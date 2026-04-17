const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { getSetting, setSetting, ensureAiDefaults } = require('../lib/db');
const { port, SESSION_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ADMIN_PASS } = require('./config');
const runtime = require('./runtime');

function ensureDefaultSettings() {
  if (!getSetting('tokens_per_sol')) setSetting('tokens_per_sol', '1000');
  if (!getSetting('min_trade_sol')) setSetting('min_trade_sol', '0.001');
  if (!getSetting('token_symbol')) setSetting('token_symbol', 'SAIX');
  if (!getSetting('default_sell_markup')) setSetting('default_sell_markup', '1.25');
  ensureAiDefaults();
}

function createApp() {
  ensureDefaultSettings();

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const started = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - started;
      if (req.path.startsWith('/assets/')) return;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms) rid=${requestId}`);
    });
    next();
  });
  app.use(express.json({ limit: '400kb' }));
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  app.use('/api', require('./routes/config'));
  app.use('/api', require('./routes/trading'));
  app.use('/api', require('./routes/admin'));
  app.use('/github', require('./routes/github'));
  app.use('/v1', require('./routes/gateway'));

  const rootDir = path.join(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');
  const distReady =
    fs.existsSync(path.join(distDir, 'public', 'index.html')) &&
    fs.existsSync(path.join(distDir, 'admin', 'index.html'));

  const webRoot = distReady ? distDir : rootDir;
  const adminDir = path.join(webRoot, 'admin');
  const publicDir = path.join(webRoot, 'public');
  const assetsDir = path.join(webRoot, 'assets');
  const adminIndexHtml = path.join(adminDir, 'index.html');

  /** 管理后台首页：直接返回 HTML，避免 express.static 对目录做 301 与手动 redirect 叠加导致 ERR_TOO_MANY_REDIRECTS */
  app.get('/admin.html', (_req, res) => {
    res.redirect(301, '/admin');
  });
  app.get(['/admin', '/admin/'], (_req, res) => {
    res.sendFile(adminIndexHtml);
  });
  /** 将来 admin 下的 css/js 等仍走静态；index: false 避免再自动重定向 */
  app.use(
    '/admin',
    express.static(adminDir, {
      index: false,
      fallthrough: true,
    })
  );

  /** Vite build 后的共享资源目录（dist/assets） */
  app.use('/assets', express.static(assetsDir));

  app.use(express.static(publicDir));

  app.use((err, req, res, _next) => {
    console.error(`[${req.requestId || '-'}]`, err);
    res.status(500).json({
      error: '服务器内部错误',
      request_id: req.requestId || null,
    });
  });

  return app;
}

function printStartupHints() {
  console.log(`SolAIX 服务运行在 http://localhost:${port}`);
  console.log(`管理后台: http://localhost:${port}/admin`);
  console.log(`AI Gateway: http://localhost:${port}/v1`);
  if (!GITHUB_CLIENT_SECRET || !GITHUB_CLIENT_ID) {
    console.warn('[提示] 未设置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET，GitHub 登录将无法完成。');
  }
  if (!runtime.isMarketReady()) {
    console.warn('[提示] TOKEN_MINT 或 TREASURY_SECRET_KEY 未正确配置，代币交易接口将不可用。');
  }
  if (!ADMIN_PASS) {
    console.warn('[提示] 未设置 ADMIN_PASSWORD，管理后台无法登录。');
  }
}

module.exports = { createApp, port, printStartupHints };

