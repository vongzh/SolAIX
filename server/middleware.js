const runtime = require('./runtime');

function requireMarket(_req, res, next) {
  if (!runtime.isMarketReady()) {
    return res.status(503).json({
      error: '市场未配置',
      hint: '请在 .env 设置 TREASURY_SECRET_KEY、TOKEN_MINT，并执行 npm run bootstrap-token（Devnet）',
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.admin) {
    return res.status(401).json({ error: '需要管理员登录' });
  }
  next();
}

module.exports = { requireMarket, requireAdmin };
