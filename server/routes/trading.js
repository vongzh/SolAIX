const { Router } = require('express');
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const {
  db,
  getSetting,
  insertTrade,
  updateTrade,
} = require('../../lib/db');
const chain = require('../../lib/solana');
const { RPC_URL, clusterLabel, explorerTx, lamportsForSellRaw } = require('../config');
const runtime = require('../runtime');
const { requireMarket } = require('../middleware');

const router = Router();

router.get('/market', requireMarket, async (req, res) => {
  const dec = await runtime.getDecimals();
  const tokensPerSol = Number(getSetting('tokens_per_sol', '1000'));
  const minTradeSol = Number(getSetting('min_trade_sol', '0.001'));
  const symbol = getSetting('token_symbol', 'SAIX');
  const mint = runtime.mint;
  res.json({
    cluster: clusterLabel(),
    rpcUrl: RPC_URL,
    mint: mint.toBase58(),
    decimals: dec,
    treasury: runtime.treasury.publicKey.toBase58(),
    tokensPerSol,
    minTradeSol,
    symbol,
  });
});

router.post('/buy/quote', requireMarket, async (req, res) => {
  const tokenAmount = Number(req.body?.tokenAmount);
  if (!(tokenAmount > 0)) {
    return res.status(400).json({ error: 'tokenAmount 无效' });
  }
  const tokensPerSol = Number(getSetting('tokens_per_sol', '1000'));
  const minTradeSol = Number(getSetting('min_trade_sol', '0.001'));
  const minLamports = BigInt(Math.ceil(minTradeSol * Number(LAMPORTS_PER_SOL)));
  const lamportsNeeded = chain.lamportsForBuyTokens(tokenAmount, tokensPerSol);
  if (lamportsNeeded < minLamports) {
    return res.status(400).json({ error: `单笔买入折算 SOL 不得低于 ${minTradeSol}` });
  }
  const dec = await runtime.getDecimals();
  const raw = chain.tokenRawFromFloat(tokenAmount, dec);
  res.json({
    lamportsNeeded: lamportsNeeded.toString(),
    tokenAmountRaw: raw.toString(),
    treasury: runtime.treasury.publicKey.toBase58(),
    decimals: dec,
  });
});

router.post('/buy/confirm', requireMarket, async (req, res) => {
  const { signature, wallet, tokenAmount } = req.body || {};
  if (!signature || !wallet || !(Number(tokenAmount) > 0)) {
    return res.status(400).json({ error: '缺少 signature / wallet / tokenAmount' });
  }
  const tokensPerSol = Number(getSetting('tokens_per_sol', '1000'));
  const dec = await runtime.getDecimals();
  const raw = chain.tokenRawFromFloat(Number(tokenAmount), dec);
  const minLamports = chain.lamportsForBuyTokens(Number(tokenAmount), tokensPerSol);
  const connection = runtime.connection;
  const mint = runtime.mint;
  const treasury = runtime.treasury;

  const dup = db.prepare('SELECT id FROM trades WHERE user_tx = ?').get(signature);
  if (dup) {
    return res.json({ ok: true, duplicate: true, message: '该交易已处理' });
  }

  const v = await chain.verifyNativeReceived(connection, signature, {
    to: treasury.publicKey.toBase58(),
    minLamports,
  });
  if (!v.ok) {
    return res.status(400).json({ error: v.reason || '链上校验失败' });
  }

  const tradeId = insertTrade({
    wallet,
    side: 'buy',
    token_amount_raw: raw.toString(),
    sol_lamports: minLamports.toString(),
    user_tx: signature,
    status: 'pending',
  });

  try {
    const settle = await chain.sendTreasuryTokenToUser(connection, treasury, mint.toBase58(), wallet, raw);
    updateTrade(tradeId, { status: 'done', settle_tx: settle });
    return res.json({
      ok: true,
      settleTx: settle,
      explorer: explorerTx(settle),
    });
  } catch (e) {
    updateTrade(tradeId, {
      status: 'failed',
      note: String(e.message || e),
    });
    return res.status(500).json({
      error: '已向金库打款，但发放代币失败，请联系管理员处理。',
      detail: String(e.message || e),
    });
  }
});

router.post('/sell/quote', requireMarket, async (req, res) => {
  const tokenAmount = Number(req.body?.tokenAmount);
  if (!(tokenAmount > 0)) {
    return res.status(400).json({ error: 'tokenAmount 无效' });
  }
  const tokensPerSol = Number(getSetting('tokens_per_sol', '1000'));
  const minTradeSol = Number(getSetting('min_trade_sol', '0.001'));
  const dec = await runtime.getDecimals();
  const raw = chain.tokenRawFromFloat(tokenAmount, dec);
  const solOut = lamportsForSellRaw(raw, dec, tokensPerSol);
  const minLamports = BigInt(Math.ceil(minTradeSol * Number(LAMPORTS_PER_SOL)));
  if (solOut < minLamports) {
    return res.status(400).json({ error: `单笔卖出获得 SOL 不得低于 ${minTradeSol}` });
  }
  const mint = runtime.mint;
  res.json({
    tokenAmountRaw: raw.toString(),
    solLamportsOut: solOut.toString(),
    treasuryAta: chain.getAssociatedTokenAddressSync(mint, runtime.treasury.publicKey).toBase58(),
    decimals: dec,
  });
});

router.post('/sell/transaction', requireMarket, async (req, res) => {
  const { wallet, tokenAmount } = req.body || {};
  if (!wallet || !(Number(tokenAmount) > 0)) {
    return res.status(400).json({ error: '缺少 wallet / tokenAmount' });
  }
  const tokensPerSol = Number(getSetting('tokens_per_sol', '1000'));
  const dec = await runtime.getDecimals();
  const raw = chain.tokenRawFromFloat(Number(tokenAmount), dec);
  const solOut = lamportsForSellRaw(raw, dec, tokensPerSol);
  const minLamports = BigInt(Math.ceil(Number(getSetting('min_trade_sol', '0.001')) * Number(LAMPORTS_PER_SOL)));
  if (solOut < minLamports) {
    return res.status(400).json({ error: '卖出数量过小' });
  }
  try {
    const { tx, lastValidBlockHeight } = await chain.buildSellSplTransaction(runtime.connection, {
      user: wallet,
      mint: runtime.mint.toBase58(),
      treasury: runtime.treasury,
      tokenAmountRaw: raw,
    });
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    res.json({
      transaction: serialized.toString('base64'),
      lastValidBlockHeight,
      expectedSolLamportsOut: solOut.toString(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post('/sell/confirm', requireMarket, async (req, res) => {
  const { signature, wallet, tokenAmount } = req.body || {};
  if (!signature || !wallet || !(Number(tokenAmount) > 0)) {
    return res.status(400).json({ error: '缺少参数' });
  }
  const tokensPerSol = Number(getSetting('tokens_per_sol', '1000'));
  const dec = await runtime.getDecimals();
  const raw = chain.tokenRawFromFloat(Number(tokenAmount), dec);
  const solOut = lamportsForSellRaw(raw, dec, tokensPerSol);
  const mint = runtime.mint;
  const treasuryAta = chain.getAssociatedTokenAddressSync(mint, runtime.treasury.publicKey);

  const dup = db.prepare('SELECT id FROM trades WHERE user_tx = ?').get(signature);
  if (dup) {
    return res.json({ ok: true, duplicate: true });
  }

  const v = await chain.verifySplReceived(runtime.connection, signature, {
    mint,
    treasuryAta,
    minRaw: raw,
  });
  if (!v.ok) {
    return res.status(400).json({ error: v.reason || '链上校验失败' });
  }

  const tradeId = insertTrade({
    wallet,
    side: 'sell',
    token_amount_raw: raw.toString(),
    sol_lamports: solOut.toString(),
    user_tx: signature,
    status: 'pending',
  });

  try {
    const settle = await chain.sendTreasurySolToUser(runtime.connection, runtime.treasury, wallet, solOut);
    updateTrade(tradeId, { status: 'done', settle_tx: settle });
    return res.json({
      ok: true,
      settleTx: settle,
      explorer: explorerTx(settle),
    });
  } catch (e) {
    updateTrade(tradeId, { status: 'failed', note: String(e.message || e) });
    return res.status(500).json({
      error: '代币已收，但 SOL 打款失败，请联系管理员。',
      detail: String(e.message || e),
    });
  }
});

module.exports = router;
