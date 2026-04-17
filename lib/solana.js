const {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const bs58mod = require('bs58');
const bs58 = bs58mod.default || bs58mod;
const {
  getMint,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');

function loadTreasuryKeypair(secret) {
  if (!secret || typeof secret !== 'string') return null;
  try {
    const raw = bs58.decode(secret.trim());
    const { Keypair } = require('@solana/web3.js');
    return Keypair.fromSecretKey(raw);
  } catch {
    return null;
  }
}

function getConnection(rpcUrl) {
  return new Connection(rpcUrl, 'confirmed');
}

/** tokensPerSol：每 1 SOL 可购买的「完整代币」数量（含小数语义由 mint decimals 决定） */
function lamportsForBuyTokens(tokenAmountFloat, tokensPerSol) {
  if (!(tokensPerSol > 0) || !(tokenAmountFloat > 0)) return 0n;
  const lamportsFloat = (tokenAmountFloat / tokensPerSol) * Number(LAMPORTS_PER_SOL);
  return BigInt(Math.max(1, Math.ceil(lamportsFloat)));
}

function tokenRawFromFloat(amountFloat, decimals) {
  const f = 10 ** decimals;
  return BigInt(Math.floor(amountFloat * f + 1e-12));
}

function floatFromRaw(raw, decimals) {
  return Number(raw) / 10 ** decimals;
}

async function fetchMintDecimals(connection, mint) {
  const info = await getMint(connection, mint);
  return info.decimals;
}

function resolvedAccountKeys(tx) {
  const message = tx.transaction.message;
  const meta = tx.meta;
  if (message.staticAccountKeys) {
    const keys = [...message.staticAccountKeys];
    if (meta?.loadedAddresses) {
      const { writable, readonly } = meta.loadedAddresses;
      for (const w of writable) {
        keys.push(new PublicKey(w));
      }
      for (const r of readonly) {
        keys.push(new PublicKey(r));
      }
    }
    return keys.map((k) => k.toBase58());
  }
  if (message.accountKeys) {
    return message.accountKeys.map((k) => (k.pubkey ? k.pubkey.toBase58() : k.toBase58()));
  }
  return [];
}

async function verifyNativeReceived(connection, signature, { to, minLamports }) {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || tx.meta?.err) {
    return { ok: false, reason: '交易不存在或执行失败' };
  }
  const keys = resolvedAccountKeys(tx);
  const idxTo = keys.indexOf(to);
  if (idxTo < 0) return { ok: false, reason: '交易中未找到金库地址' };
  const received = BigInt(tx.meta.postBalances[idxTo] - tx.meta.preBalances[idxTo]);
  if (received < minLamports) {
    return { ok: false, reason: `SOL 不足：金库收到 ${received} lamports，需要至少 ${minLamports}` };
  }
  return { ok: true, received };
}

async function verifySplReceived(connection, signature, { mint, treasuryAta, minRaw }) {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta || tx.meta.err) {
    return { ok: false, reason: '交易不存在或执行失败' };
  }
  const mintStr = mint.toBase58();
  const ataStr = treasuryAta.toBase58();
  const keys = resolvedAccountKeys(tx);
  let delta = 0n;
  for (const p of tx.meta.postTokenBalances || []) {
    if (p.mint !== mintStr) continue;
    const addr = keys[p.accountIndex];
    if (addr !== ataStr) continue;
    const postAmt = BigInt(p.uiTokenAmount.amount);
    const preRow = (tx.meta.preTokenBalances || []).find(
      (x) => x.accountIndex === p.accountIndex && x.mint === mintStr
    );
    const preAmt = preRow?.uiTokenAmount ? BigInt(preRow.uiTokenAmount.amount) : 0n;
    delta = postAmt - preAmt;
    break;
  }
  if (delta < minRaw) {
    return { ok: false, reason: `代币数量不足：金库收到 ${delta}，需要至少 ${minRaw}` };
  }
  return { ok: true, received: delta };
}

async function buildSellSplTransaction(connection, { user, mint, treasury, tokenAmountRaw }) {
  const userPk = new PublicKey(user);
  const mintPk = new PublicKey(mint);
  const treasuryPk = treasury.publicKey;
  const userAta = getAssociatedTokenAddressSync(mintPk, userPk);
  const treasuryAta = getAssociatedTokenAddressSync(mintPk, treasuryPk);
  const ix = createTransferInstruction(userAta, treasuryAta, userPk, tokenAmountRaw, [], TOKEN_PROGRAM_ID);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.feePayer = userPk;
  tx.recentBlockhash = blockhash;
  tx.add(ix);
  return { tx, lastValidBlockHeight };
}

async function sendTreasuryTokenToUser(connection, treasury, mint, user, tokenAmountRaw) {
  const mintPk = new PublicKey(mint);
  const userPk = new PublicKey(user);
  const treasuryPk = treasury.publicKey;
  const fromAta = getAssociatedTokenAddressSync(mintPk, treasuryPk);
  const toAta = getAssociatedTokenAddressSync(mintPk, userPk);
  const ixs = [];
  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    ixs.push(
      createAssociatedTokenAccountIdempotentInstructionWithDerivation(treasuryPk, userPk, mintPk)
    );
  }
  ixs.push(
    createTransferInstruction(fromAta, toAta, treasuryPk, tokenAmountRaw, [], TOKEN_PROGRAM_ID)
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.feePayer = treasuryPk;
  tx.recentBlockhash = blockhash;
  tx.add(...ixs);
  tx.sign(treasury);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

async function sendTreasurySolToUser(connection, treasury, user, lamports) {
  const userPk = new PublicKey(user);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.feePayer = treasury.publicKey;
  tx.recentBlockhash = blockhash;
  tx.add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: userPk,
      lamports,
    })
  );
  tx.sign(treasury);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

module.exports = {
  loadTreasuryKeypair,
  getConnection,
  lamportsForBuyTokens,
  tokenRawFromFloat,
  floatFromRaw,
  fetchMintDecimals,
  verifyNativeReceived,
  verifySplReceived,
  buildSellSplTransaction,
  sendTreasuryTokenToUser,
  sendTreasurySolToUser,
  getAssociatedTokenAddressSync,
};
