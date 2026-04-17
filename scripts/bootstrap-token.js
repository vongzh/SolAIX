/**
 * 在 Devnet 上创建 SAIX SPL Mint，并向金库 ATA 铸造初始供应量。
 * 用法：配置 .env 中 TREASURY_SECRET_KEY、SOLANA_RPC_URL，然后：
 *   npm run bootstrap-token
 * 将输出的 TOKEN_MINT 写入 .env。
 */
require('dotenv').config();
const { Connection, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require('@solana/spl-token');
const { loadTreasuryKeypair, getConnection } = require('../lib/solana');

async function main() {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const treasury = loadTreasuryKeypair(process.env.TREASURY_SECRET_KEY);
  if (!treasury) {
    console.error('请在 .env 中设置 TREASURY_SECRET_KEY（Base58 私钥）。');
    process.exit(1);
  }
  const connection = getConnection(rpc);
  const bal = await connection.getBalance(treasury.publicKey);
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    console.error('金库 SOL 余额过低，请到 https://faucet.solana.com 领取 Devnet SOL。');
    process.exit(1);
  }

  const decimals = Number(process.env.TOKEN_DECIMALS || 9);
  console.log('创建 Mint（decimals=%s）...', decimals);
  const mint = await createMint(
    connection,
    treasury,
    treasury.publicKey,
    null,
    decimals
  );
  console.log('Mint:', mint.toBase58());

  const ata = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
  const supply = BigInt(process.env.INITIAL_MINT_RAW || '1000000000000000');
  console.log('向金库 ATA 铸造初始代币 raw=%s ...', supply.toString());
  await mintTo(connection, treasury, mint, ata.address, treasury, supply);

  console.log('\n请将下列内容加入 .env：');
  console.log('TOKEN_MINT=' + mint.toBase58());
  console.log('\n金库地址:', treasury.publicKey.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
