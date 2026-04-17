const { Router } = require('express');
const {
  getSetting,
  setSetting,
  listTrades,
  stats,
  listProviders,
  upsertProvider,
  getProviderById,
  setProviderEnabled,
  replaceProviderModels,
  listUsage,
  listUsers,
  adjustUserBalance,
  createUser,
  rotateUserApiKey,
  listInquiries,
} = require('../../lib/db');
const { RPC_URL, ADMIN_PASS, ADMIN_USER } = require('../config');
const runtime = require('../runtime');
const { requireAdmin } = require('../middleware');

const router = Router();

router.post('/admin/login', (req, res) => {
  if (!ADMIN_PASS) {
    return res.status(503).json({ error: '未配置 ADMIN_PASSWORD' });
  }
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  req.session.admin = true;
  res.json({ ok: true });
});

router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/admin/me', (req, res) => {
  res.json({ admin: Boolean(req.session?.admin) });
});

router.get('/admin/stats', requireAdmin, (req, res) => {
  const s = stats();
  const mint = runtime.mint;
  res.json({
    ...s,
    marketConfigured: runtime.isMarketReady(),
    treasury: runtime.treasury ? runtime.treasury.publicKey.toBase58() : null,
    mint: mint ? mint.toBase58() : null,
    rpc: RPC_URL,
  });
});

router.get('/admin/trades', requireAdmin, (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json({ trades: listTrades(limit) });
});

router.get('/admin/settings', requireAdmin, (req, res) => {
  res.json({
    tokensPerSol: getSetting('tokens_per_sol'),
    minTradeSol: getSetting('min_trade_sol'),
    tokenSymbol: getSetting('token_symbol'),
    defaultSellMarkup: getSetting('default_sell_markup', '1.25'),
  });
});

router.patch('/admin/settings', requireAdmin, (req, res) => {
  const { tokensPerSol, minTradeSol, tokenSymbol, defaultSellMarkup } = req.body || {};
  if (tokensPerSol !== undefined) {
    const n = Number(tokensPerSol);
    if (!(n > 0)) return res.status(400).json({ error: 'tokensPerSol 须为正数' });
    setSetting('tokens_per_sol', String(n));
  }
  if (minTradeSol !== undefined) {
    const n = Number(minTradeSol);
    if (!(n > 0)) return res.status(400).json({ error: 'minTradeSol 须为正数' });
    setSetting('min_trade_sol', String(n));
  }
  if (tokenSymbol !== undefined && typeof tokenSymbol === 'string' && tokenSymbol.trim()) {
    setSetting('token_symbol', tokenSymbol.trim().slice(0, 12));
  }
  if (defaultSellMarkup !== undefined) {
    const m = Number(defaultSellMarkup);
    if (!(m >= 1)) return res.status(400).json({ error: 'defaultSellMarkup 需 >= 1' });
    setSetting('default_sell_markup', String(m));
  }
  res.json({
    tokensPerSol: getSetting('tokens_per_sol'),
    minTradeSol: getSetting('min_trade_sol'),
    tokenSymbol: getSetting('token_symbol'),
    defaultSellMarkup: getSetting('default_sell_markup', '1.25'),
  });
});

router.get('/admin/providers', requireAdmin, (_req, res) => {
  res.json({ providers: listProviders() });
});

router.post('/admin/providers', requireAdmin, (req, res) => {
  const { provider, models } = req.body || {};
  if (!provider?.name || !provider?.type) {
    return res.status(400).json({ error: 'provider.name 与 provider.type 必填' });
  }
  if (!['openai', 'openrouter', 'custom'].includes(provider.type)) {
    return res.status(400).json({ error: 'provider.type 仅支持 openai/openrouter/custom' });
  }
  const id = upsertProvider(provider);
  replaceProviderModels(id, Array.isArray(models) ? models : []);
  res.json({ ok: true, id });
});

router.patch('/admin/providers/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!(id > 0)) return res.status(400).json({ error: 'provider id 无效' });
  const current = getProviderById(id);
  if (!current) return res.status(404).json({ error: 'provider 不存在' });
  const patch = req.body?.provider || {};
  const merged = {
    id,
    name: patch.name ?? current.name,
    type: patch.type ?? current.type,
    base_url: patch.base_url ?? current.base_url,
    api_key: patch.api_key ?? current.api_key,
    enabled: patch.enabled ?? Boolean(current.enabled),
    priority: patch.priority ?? current.priority,
  };
  upsertProvider(merged);
  if (Array.isArray(req.body?.models)) {
    replaceProviderModels(id, req.body.models);
  }
  res.json({ ok: true, id });
});

router.patch('/admin/providers/:id/enabled', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const enabled = Boolean(req.body?.enabled);
  if (!(id > 0)) return res.status(400).json({ error: 'provider id 无效' });
  setProviderEnabled(id, enabled);
  res.json({ ok: true });
});

router.get('/admin/usage', requireAdmin, (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json({ usage: listUsage(limit) });
});

router.get('/admin/users', requireAdmin, (_req, res) => {
  res.json({ users: listUsers(), demoApiKey: getSetting('demo_api_key') || null });
});

router.post('/admin/users', requireAdmin, (req, res) => {
  const name = (req.body?.name || '').toString().trim();
  const role = (req.body?.role || 'buyer').toString().trim() || 'buyer';
  const initialBalanceCents = Number(req.body?.initialBalanceCents || 0);
  if (!name) return res.status(400).json({ error: 'name 必填' });
  const created = createUser(name, role, initialBalanceCents);
  res.json({ ok: true, ...created });
});

router.post('/admin/users/:id/rotate-key', requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  if (!(userId > 0)) return res.status(400).json({ error: 'user id 无效' });
  const apiKey = rotateUserApiKey(userId);
  res.json({ ok: true, apiKey });
});

router.post('/admin/users/:id/topup', requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const amountCents = Number(req.body?.amountCents);
  if (!(userId > 0) || !(amountCents > 0)) {
    return res.status(400).json({ error: 'userId/amountCents 无效' });
  }
  adjustUserBalance(userId, amountCents, 'admin_topup', null, 'admin topup');
  res.json({ ok: true });
});

router.get('/admin/inquiries', requireAdmin, (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json({ inquiries: listInquiries(limit) });
});

module.exports = router;
