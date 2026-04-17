const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'market.db');
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL,
  side TEXT NOT NULL,
  token_amount_raw TEXT NOT NULL,
  sol_lamports TEXT NOT NULL,
  user_tx TEXT,
  settle_tx TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'buyer',
  balance_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  base_url TEXT,
  api_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  input_price_per_1k REAL NOT NULL,
  output_price_per_1k REAL NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(provider_id, model_name)
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  provider_id INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  provider_cost_cents INTEGER NOT NULL DEFAULT 0,
  sell_cost_cents INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  ref_id TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'homepage',
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
CREATE INDEX IF NOT EXISTS idx_provider_models_model ON provider_models(model_name);
CREATE INDEX IF NOT EXISTS idx_usage_user_created ON usage_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at DESC);
`);

function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return defaultValue;
  return row.value;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value)
  );
}

function insertTrade(row) {
  const stmt = db.prepare(
    `INSERT INTO trades (wallet, side, token_amount_raw, sol_lamports, user_tx, settle_tx, status, note, created_at)
     VALUES (@wallet, @side, @token_amount_raw, @sol_lamports, @user_tx, @settle_tx, @status, @note, @created_at)`
  );
  const info = stmt.run({
    ...row,
    settle_tx: row.settle_tx ?? null,
    note: row.note ?? null,
    created_at: row.created_at ?? Date.now(),
  });
  return info.lastInsertRowid;
}

function updateTrade(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE trades SET ${sets} WHERE id = @id`).run({ ...patch, id });
}

function listTrades(limit = 100) {
  return db
    .prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?')
    .all(Math.min(500, Number(limit) || 100));
}

function stats() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM trades').get().n;
  const bySide = db.prepare('SELECT side, COUNT(*) AS n FROM trades GROUP BY side').all();
  const vol = db.prepare(`SELECT side, COALESCE(SUM(CAST(sol_lamports AS INTEGER)), 0) AS lamports FROM trades WHERE status = 'done' GROUP BY side`).all();
  const usage = db.prepare('SELECT COUNT(*) AS n FROM usage_records').get().n;
  return { total, bySide, volumeLamports: vol, usageCount: usage };
}

function ensureAiDefaults() {
  if (!getSetting('default_sell_markup')) setSetting('default_sell_markup', '1.25');

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    const key = process.env.DEFAULT_API_KEY || `sk-solai-${crypto.randomBytes(12).toString('hex')}`;
    db.prepare(
      `INSERT INTO users (name, api_key, role, balance_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('demo-user', key, 'buyer', 2000, 'active', Date.now());
    setSetting('demo_api_key', key);
  }
}

function getUserByApiKey(apiKey) {
  return db.prepare('SELECT * FROM users WHERE api_key = ? AND status = ?').get(apiKey, 'active');
}

function adjustUserBalance(userId, deltaCents, type, refId, note) {
  db.prepare('UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?').run(deltaCents, userId);
  db.prepare(
    `INSERT INTO wallet_ledger (user_id, type, amount_cents, ref_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, type, deltaCents, refId || null, note || null, Date.now());
}

function listProviders() {
  return db
    .prepare(
      `SELECT p.*, 
              COUNT(pm.id) AS model_count
       FROM providers p
       LEFT JOIN provider_models pm ON pm.provider_id = p.id AND pm.enabled = 1
       GROUP BY p.id
       ORDER BY p.enabled DESC, p.priority ASC, p.id ASC`
    )
    .all();
}

function upsertProvider(payload) {
  const row = {
    name: payload.name.trim(),
    type: payload.type,
    base_url: payload.base_url || null,
    api_key: payload.api_key || null,
    enabled: payload.enabled ? 1 : 0,
    priority: Number(payload.priority) || 100,
  };
  if (payload.id) {
    db.prepare(
      `UPDATE providers
       SET name=@name, type=@type, base_url=@base_url, api_key=@api_key, enabled=@enabled, priority=@priority
       WHERE id=@id`
    ).run({ ...row, id: payload.id });
    return payload.id;
  }
  const info = db
    .prepare(
      `INSERT INTO providers (name, type, base_url, api_key, enabled, priority, created_at)
       VALUES (@name, @type, @base_url, @api_key, @enabled, @priority, @created_at)`
    )
    .run({ ...row, created_at: Date.now() });
  return info.lastInsertRowid;
}

function replaceProviderModels(providerId, models) {
  const tx = db.transaction((pid, rows) => {
    db.prepare('DELETE FROM provider_models WHERE provider_id = ?').run(pid);
    const insert = db.prepare(
      `INSERT INTO provider_models (provider_id, model_name, input_price_per_1k, output_price_per_1k, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const m of rows) {
      insert.run(
        pid,
        m.model_name,
        Number(m.input_price_per_1k) || 0,
        Number(m.output_price_per_1k) || 0,
        m.enabled === false ? 0 : 1,
        Date.now()
      );
    }
  });
  tx(providerId, models || []);
}

function getProviderById(id) {
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
}

function setProviderEnabled(id, enabled) {
  db.prepare('UPDATE providers SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

function getEnabledProviderModels(modelName) {
  const sql = `
    SELECT p.id AS provider_id, p.name, p.type, p.base_url, p.api_key, p.priority,
           pm.model_name, pm.input_price_per_1k, pm.output_price_per_1k
    FROM providers p
    JOIN provider_models pm ON pm.provider_id = p.id
    WHERE p.enabled = 1 AND pm.enabled = 1
      AND (? IS NULL OR pm.model_name = ?)
    ORDER BY p.priority ASC, p.id ASC
  `;
  return db.prepare(sql).all(modelName || null, modelName || null);
}

function createRequestLog({ requestId, userId, modelName }) {
  db.prepare(
    `INSERT INTO requests (request_id, user_id, model_name, status, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(requestId, userId, modelName, 'pending', Date.now());
}

function finishRequestLog({ requestId, providerId, status, errorMessage }) {
  db.prepare(
    `UPDATE requests
     SET provider_id = ?, status = ?, error_message = ?
     WHERE request_id = ?`
  ).run(providerId || null, status, errorMessage || null, requestId);
}

function recordUsage(payload) {
  db.prepare(
    `INSERT INTO usage_records (
      request_id, user_id, provider_id, model_name,
      prompt_tokens, completion_tokens, total_tokens,
      provider_cost_cents, sell_cost_cents, latency_ms,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    payload.request_id,
    payload.user_id,
    payload.provider_id,
    payload.model_name,
    payload.prompt_tokens,
    payload.completion_tokens,
    payload.total_tokens,
    payload.provider_cost_cents,
    payload.sell_cost_cents,
    payload.latency_ms,
    payload.status || 'ok',
    Date.now()
  );
}

function listUsage(limit = 100) {
  return db
    .prepare(
      `SELECT ur.*, u.name AS user_name, p.name AS provider_name
       FROM usage_records ur
       LEFT JOIN users u ON u.id = ur.user_id
       LEFT JOIN providers p ON p.id = ur.provider_id
       ORDER BY ur.created_at DESC
       LIMIT ?`
    )
    .all(Math.min(500, Number(limit) || 100));
}

function listUsers() {
  return db.prepare('SELECT id, name, role, balance_cents, status, created_at FROM users ORDER BY id DESC').all();
}

function createUser(name, role = 'buyer', initialBalanceCents = 0) {
  const apiKey = `sk-solai-${crypto.randomBytes(12).toString('hex')}`;
  const info = db
    .prepare(
      `INSERT INTO users (name, api_key, role, balance_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, apiKey, role, Math.max(0, Number(initialBalanceCents) || 0), 'active', Date.now());
  return { id: info.lastInsertRowid, apiKey };
}

function rotateUserApiKey(userId) {
  const apiKey = `sk-solai-${crypto.randomBytes(12).toString('hex')}`;
  db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(apiKey, userId);
  return apiKey;
}

function getPublicMetrics() {
  const usageTokens = db
    .prepare('SELECT COALESCE(SUM(total_tokens), 0) AS n FROM usage_records')
    .get().n;
  const activeUsers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'").get().n;
  const activeProviders = db.prepare('SELECT COUNT(*) AS n FROM providers WHERE enabled = 1').get().n;
  const activeModels = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM provider_models pm
       JOIN providers p ON p.id = pm.provider_id
       WHERE pm.enabled = 1 AND p.enabled = 1`
    )
    .get().n;
  return {
    monthlyTokens: Number(usageTokens) || 0,
    activeUsers: Number(activeUsers) || 0,
    activeProviders: Number(activeProviders) || 0,
    activeModels: Number(activeModels) || 0,
  };
}

function createInquiry(payload) {
  const info = db
    .prepare(
      `INSERT INTO inquiries (name, email, company, message, source, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.name.trim(),
      payload.email.trim().toLowerCase(),
      payload.company ? payload.company.trim() : null,
      payload.message ? payload.message.trim() : null,
      payload.source || 'homepage',
      'new',
      Date.now()
    );
  return info.lastInsertRowid;
}

function listInquiries(limit = 100) {
  return db
    .prepare(
      `SELECT id, name, email, company, message, source, status, created_at
       FROM inquiries
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(Math.min(500, Number(limit) || 100));
}

module.exports = {
  db,
  getSetting,
  setSetting,
  insertTrade,
  updateTrade,
  listTrades,
  stats,
  ensureAiDefaults,
  getUserByApiKey,
  adjustUserBalance,
  listProviders,
  upsertProvider,
  getProviderById,
  setProviderEnabled,
  replaceProviderModels,
  getEnabledProviderModels,
  createRequestLog,
  finishRequestLog,
  recordUsage,
  listUsage,
  listUsers,
  createUser,
  rotateUserApiKey,
  createInquiry,
  listInquiries,
  getPublicMetrics,
};
