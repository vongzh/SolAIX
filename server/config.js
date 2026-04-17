const { LAMPORTS_PER_SOL } = require('@solana/web3.js');

const port = Number(process.env.PORT) || 3000;
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

function clusterLabel() {
  if (RPC_URL.includes('devnet')) return 'devnet';
  if (RPC_URL.includes('testnet')) return 'testnet';
  return 'mainnet-beta';
}

function explorerTx(sig) {
  const c = clusterLabel();
  const q = c === 'mainnet-beta' ? '' : `?cluster=${c}`;
  return `https://explorer.solana.com/tx/${sig}${q}`;
}

/** 按「每 1 SOL 可买 tokensPerSol 枚」的汇率，计算卖出 tokenRaw 应得 lamports */
function lamportsForSellRaw(tokenRaw, decimals, tokensPerSol) {
  const tps = Number(tokensPerSol);
  if (!(tps > 0)) return 0n;
  const float = Number(tokenRaw) / 10 ** decimals;
  const lamports = Math.floor((float / tps) * Number(LAMPORTS_PER_SOL));
  return BigInt(Math.max(0, lamports));
}

module.exports = {
  port,
  RPC_URL,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  ADMIN_USER: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASSWORD || '',
  SESSION_SECRET: process.env.SESSION_SECRET || 'solai-dev-change-me',
  clusterLabel,
  explorerTx,
  lamportsForSellRaw,
};
