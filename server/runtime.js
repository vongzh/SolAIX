const { PublicKey } = require('@solana/web3.js');
const chain = require('../lib/solana');
const { RPC_URL } = require('./config');

const treasury = chain.loadTreasuryKeypair(process.env.TREASURY_SECRET_KEY || '');

let connection = null;
let mintPk = null;
let decimalsCache = 9;

(function initMintFromEnv() {
  const raw = (process.env.TOKEN_MINT || '').trim();
  if (!raw) return;
  try {
    mintPk = new PublicKey(raw);
    connection = chain.getConnection(RPC_URL);
  } catch {
    mintPk = null;
    connection = null;
  }
})();

async function getDecimals() {
  if (!connection || !mintPk) return decimalsCache;
  try {
    decimalsCache = await chain.fetchMintDecimals(connection, mintPk);
  } catch (_) {
    /* 保持上次缓存 */
  }
  return decimalsCache;
}

function isMarketReady() {
  return Boolean(connection && treasury && mintPk);
}

module.exports = {
  treasury,
  get connection() {
    return connection;
  },
  get mint() {
    return mintPk;
  },
  getDecimals,
  isMarketReady,
};
