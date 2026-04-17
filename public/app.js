import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from 'https://esm.sh/@solana/web3.js@1.98.4';

let connection = null;
let marketInfo = null;
let publicKey = null;

function shortPk(pk) {
  const s = typeof pk === 'string' ? pk : pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function fmtNum(n, dec = 4) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: dec });
}

async function loadMarket() {
  const r = await fetch('/api/market');
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || j.hint || '市场未就绪');
  }
  marketInfo = await r.json();
  connection = new Connection(marketInfo.rpcUrl, 'confirmed');
  document.getElementById('marketBadge').textContent = `${marketInfo.symbol} · ${marketInfo.cluster}`;
  document.getElementById('rateLine').textContent = `1 SOL ≈ ${fmtNum(marketInfo.tokensPerSol, 2)} ${marketInfo.symbol}（可在后台调整）`;
  document.getElementById('minLine').textContent = `单笔最低约 ${marketInfo.minTradeSol} SOL 等值`;
  return marketInfo;
}

async function refreshBalance() {
  const el = document.getElementById('tokenBalance');
  if (!connection || !marketInfo || !publicKey) {
    el.textContent = '—';
    return;
  }
  try {
    const mint = new PublicKey(marketInfo.mint);
    const resp = await connection.getParsedTokenAccountsByOwner(publicKey);
    let total = 0n;
    for (const { account } of resp.value) {
      const info = account.data.parsed?.info;
      if (!info || info.mint !== marketInfo.mint) continue;
      total += BigInt(info.tokenAmount.amount);
    }
    const dec = marketInfo.decimals;
    const human = Number(total) / 10 ** dec;
    el.textContent = `${fmtNum(human, Math.min(6, dec))} ${marketInfo.symbol}`;
  } catch {
    el.textContent = '0';
  }
}

async function connectWallet() {
  const btn = document.getElementById('connectWallet');
  if (!window.solana) {
    alert('请安装 Phantom：https://phantom.app/');
    return;
  }
  try {
    const res = await window.solana.connect();
    publicKey = res.publicKey;
    btn.textContent = `已连接 ${shortPk(publicKey)}`;
    await loadMarket().catch(() => {});
    await refreshBalance();
  } catch (e) {
    alert('连接失败：' + (e.message || e));
  }
}

async function doBuy() {
  const status = document.getElementById('tradeStatus');
  status.textContent = '';
  if (!publicKey || !connection || !marketInfo) {
    alert('请先连接钱包并等待市场信息加载');
    return;
  }
  const tokenAmount = Number(document.getElementById('buyAmount').value);
  if (!(tokenAmount > 0)) {
    alert('请输入买入数量');
    return;
  }
  try {
    status.textContent = '正在询价…';
    const q = await fetch('/api/buy/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenAmount }),
    });
    const j = await q.json();
    if (!q.ok) throw new Error(j.error || '询价失败');
    const lamports = BigInt(j.lamportsNeeded);
    const treasury = new PublicKey(j.treasury);
    const tx = new Transaction();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: treasury,
        lamports,
      })
    );
    status.textContent = '请在钱包中确认 SOL 转账…';
    const signed = await window.solana.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    status.textContent = '链上确认成功，正在发放代币…';
    const c = await fetch('/api/buy/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature: sig,
        wallet: publicKey.toBase58(),
        tokenAmount,
      }),
    });
    const cj = await c.json();
    if (!c.ok) throw new Error(cj.error || cj.detail || '发放失败');
    status.textContent = `完成。结算交易：${cj.settleTx?.slice(0, 8)}…`;
    await refreshBalance();
  } catch (e) {
    status.textContent = '失败：' + (e.message || e);
  }
}

async function doSell() {
  const status = document.getElementById('tradeStatus');
  status.textContent = '';
  if (!publicKey || !connection || !marketInfo) {
    alert('请先连接钱包');
    return;
  }
  const tokenAmount = Number(document.getElementById('sellAmount').value);
  if (!(tokenAmount > 0)) {
    alert('请输入卖出数量');
    return;
  }
  try {
    status.textContent = '正在构建卖出交易…';
    const b = await fetch('/api/sell/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: publicKey.toBase58(),
        tokenAmount,
      }),
    });
    const bj = await b.json();
    if (!b.ok) throw new Error(bj.error || '构建失败');
    const raw = Uint8Array.from(atob(bj.transaction), (c) => c.charCodeAt(0));
    const tx = Transaction.from(raw);
    status.textContent = '请在钱包中确认代币转账…';
    const signed = await window.solana.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    status.textContent = '链上确认成功，正在支付 SOL…';
    const c = await fetch('/api/sell/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature: sig,
        wallet: publicKey.toBase58(),
        tokenAmount,
      }),
    });
    const cj = await c.json();
    if (!c.ok) throw new Error(cj.error || cj.detail || '兑付失败');
    status.textContent = `完成。SOL 已打款，结算：${cj.settleTx?.slice(0, 8)}…`;
    await refreshBalance();
  } catch (e) {
    status.textContent = '失败：' + (e.message || e);
  }
}

function wireGithub() {
  document.getElementById('githubLogin').addEventListener('click', async () => {
    let clientId = null;
    try {
      const r = await fetch('/api/config');
      const j = await r.json();
      clientId = j.githubClientId;
    } catch (_) {}
    if (!clientId) {
      alert('服务器未配置 GITHUB_CLIENT_ID');
      return;
    }
    const callback = `${window.location.origin}/github/callback`;
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=user&redirect_uri=${encodeURIComponent(callback)}`;
  });
}

function wireModal() {
  window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'success') {
      const ghUser = params.get('username');
      const titleEl = document.querySelector('#authorizeModal h3');
      if (ghUser && titleEl) {
        titleEl.textContent = `欢迎，${decodeURIComponent(ghUser)}`;
      }
      setTimeout(() => {
        document.getElementById('authorizeModal').style.display = 'flex';
        const clean = new URL(window.location.href);
        clean.searchParams.delete('login');
        clean.searchParams.delete('username');
        window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);
      }, 400);
    }
  });
  document.getElementById('confirmAuthorize').addEventListener('click', () => {
    document.getElementById('authorizeModal').style.display = 'none';
  });
  document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('authorizeModal').style.display = 'none';
  });
}

document.getElementById('connectWallet').addEventListener('click', connectWallet);
document.getElementById('buyBtn').addEventListener('click', doBuy);
document.getElementById('sellBtn').addEventListener('click', doSell);

wireGithub();
wireModal();

loadMarket()
  .then(() => {
    if (window.solana?.isConnected && window.solana.publicKey) {
      publicKey = window.solana.publicKey;
      document.getElementById('connectWallet').textContent = `已连接 ${shortPk(publicKey)}`;
      return refreshBalance();
    }
    return null;
  })
  .catch((e) => {
    document.getElementById('marketBadge').textContent = '未配置';
    document.getElementById('rateLine').textContent = e.message || String(e);
  });
