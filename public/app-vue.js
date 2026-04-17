import { createApp, ref, reactive, computed, onMounted } from 'vue';
import ElementPlus from 'element-plus';
import { ElMessage } from 'element-plus';
import 'element-plus/dist/index.css';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';

const App = {
  setup() {
    const loading = ref(false);
    const authLoading = ref(false);
    const inquiryLoading = ref(false);
    const isAuthed = ref(false);
    const loginApiKey = ref('');
    const locale = ref(localStorage.getItem('solaix_locale') || 'zh');
    const consoleView = ref('trade');
    const loginVisible = ref(false);
    const inquiryForm = reactive({ name: '', email: '', company: '', message: '' });
    const account = reactive({ name: 'Guest', role: 'viewer', balance_cents: 0 });
    const market = reactive({
      ok: false,
      symbol: 'SAIX',
      cluster: '-',
      rpcUrl: '',
      mint: '',
      tokensPerSol: 0,
      minTradeSol: 0,
      decimals: 9,
      treasury: '',
    });
    const metrics = reactive({
      monthlyTokens: 0,
      activeUsers: 0,
      activeProviders: 0,
      activeModels: 0,
    });
    const form = reactive({ buyAmount: null, sellAmount: null });
    const walletAddress = ref('');
    const tokenBalance = ref('—');
    const tradeStatus = ref('');
    const apiExample = `curl -X POST http://localhost:3000/v1/chat/completions
  -H "Authorization: Bearer sk-solai-..."
  -H "Content-Type: application/json"
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello"}]}'`;

    let connection = null;
    let walletPk = null;

    const walletShort = computed(() => {
      if (!walletAddress.value) return '未连接';
      return `${walletAddress.value.slice(0, 4)}...${walletAddress.value.slice(-4)}`;
    });
    const balanceUsd = computed(() => `$${(account.balance_cents / 100).toFixed(2)}`);
    const i18n = {
      zh: {
        eyebrow: 'AI 商业网络基础设施',
        heroTitle: '让 AI 调用\n变成可增长的商业网络',
        heroDesc: 'SolAIX 帮助平台快速搭建可定价、可路由、可结算的 AI 交换层，把模型能力转化为持续收益与网络效应。',
        heroSub1: 'OpenAI-compatible',
        heroSub2: 'Real-time Routing',
        heroSub3: 'Auditable Settlement',
        trust1: 'OpenAI 兼容',
        trust2: '链上结算',
        trust3: '智能路由',
        proof1: 'Provider Uptime Strategy',
        proof2: 'Cost-aware Dispatch',
        proof3: 'Operator-grade Visibility',
        proof4: 'Wallet-native Flows',
        biz1: '活跃用户',
        biz2: '活跃供给方',
        biz3: '活跃模型',
        stat1Label: '统一网关',
        stat1Value: '/v1 API',
        stat2Label: '模型来源',
        stat2Value: '平台 + 个人',
        stat3Label: '结算方式',
        stat3Value: '钱包原生',
        stat4Label: '累计 Token',
        sectionArch: '增长型架构',
        sectionArchDesc: '不是单纯聚合，而是为商业增长设计：更快上线、更稳服务、更高毛利。',
        arch1: '统一接入：兼容 OpenAI 协议，产品可低成本迁移与接入',
        arch2: '智能路由：按成本与可用性动态分发，控制质量与利润',
        arch3: '可结算账本：按调用量自动计费，沉淀可追踪收入数据',
        sectionPillars: '核心能力矩阵',
        sectionPillarsDesc: '以模块化单元构建 AI 交换网络，每块能力可独立演进。',
        p1Title: 'Unified Gateway',
        p1Desc: '一个 API 统一接入多模型供应。',
        p2Title: 'Provider Routing',
        p2Desc: '按价格和可用性自动调度。',
        p3Title: 'Usage Metering',
        p3Desc: '全链路记录请求与成本指标。',
        p4Title: 'Programmable Billing',
        p4Desc: '支持动态定价和分层费率。',
        p5Title: 'Wallet Settlement',
        p5Desc: '钱包买卖与链上结算一体化。',
        p6Title: 'Ops Console',
        p6Desc: '统一管理用户、模型与运营策略。',
        p7Title: 'Model Catalog',
        p7Desc: '统一模型目录与能力标签。',
        p8Title: 'Risk Controls',
        p8Desc: '限额、风控和可追踪审计链。',
        p9Title: 'Revenue Split',
        p9Desc: '多角色分账与收益分配规则。',
        g1Title: 'Access Layer',
        g1Desc: '统一接入、目录与身份能力',
        g2Title: 'Routing Layer',
        g2Desc: '路由、计量与风控能力',
        g3Title: 'Settlement Layer',
        g3Desc: '计费、结算与收益分配能力',
        sectionUsecase: '商业场景',
        sectionUsecaseDesc: '覆盖从早期验证到规模化经营的关键路径。',
        case1Title: '聚合型 AI 平台',
        case1Desc: '以统一网关整合多模型供给，快速扩展产品能力边界。',
        case2Title: '订阅能力交易市场',
        case2Desc: '个人与团队可对外出售模型额度，实现供给侧变现。',
        case3Title: '增长与利润优化',
        case3Desc: '通过分层定价与路由策略持续优化转化率与毛利率。',
        manifestoTitle: '从“调用成本”到“网络收益”',
        manifestoDesc: '我们相信 AI 基础设施的下一阶段，不只是更快调用模型，而是让每一次调用都沉淀为可运营、可分配、可增长的商业资产。',
        ctaTitle: '把你的 AI 产品接入 SolAIX 交换网络',
        ctaDesc: '在同一平台完成接入、路由、计费与结算，缩短从产品上线到收入增长的路径。',
        ctaPrimary: '预约接入',
        ctaSecondary: '获取方案',
        inquirySuccess: '提交成功，我们会尽快联系你。',
        footerDocs: '文档',
        footerTerms: '条款',
        footerPrivacy: '隐私',
        footerRight: '版权所有。',
        featuresTitle: '平台能力',
        lockedTitle: '私有控制台已锁定',
        lockedDesc: '登录后可查看交易流程、API 调用示例、余额与执行状态。',
        consoleTitle: '交易与网关控制台',
        production: '生产预览',
        connectWallet: '连接钱包',
        walletLabel: '钱包',
        tabTrade: '交易',
        tabStatus: '状态',
        tabApi: '接口',
        navConsole: '控制台',
        navPillars: '能力矩阵',
        navArch: '增长架构',
        navUsecase: '商业场景',
        marketParams: '市场参数',
        buyTitle: '买入',
        sellTitle: '卖出',
        buyAmount: '买入数量',
        sellAmount: '卖出数量',
        buyBtn: '用 SOL 买入',
        sellBtn: '卖出换 SOL',
        tokenBalance: '当前钱包余额',
        tradeStatusTitle: '交易状态',
        waiting: '等待操作',
        apiExampleTitle: 'API 示例',
        apiCompatible: '兼容 OpenAI /v1/chat/completions 接口',
        apiHint: 'API Key 可在后台创建用户后生成，Provider 可按优先级自动路由。',
      },
      en: {
        eyebrow: 'AI Commerce Network Infrastructure',
        heroTitle: 'Turn AI traffic\ninto compounding revenue',
        heroDesc: 'SolAIX helps platforms launch a priced, routed, and settleable AI exchange layer that converts model access into durable business growth.',
        heroSub1: 'OpenAI-compatible',
        heroSub2: 'Real-time Routing',
        heroSub3: 'Auditable Settlement',
        trust1: 'OpenAI Compatible',
        trust2: 'On-chain Settlement',
        trust3: 'Smart Routing',
        proof1: 'Provider Uptime Strategy',
        proof2: 'Cost-aware Dispatch',
        proof3: 'Operator-grade Visibility',
        proof4: 'Wallet-native Flows',
        biz1: 'Active Users',
        biz2: 'Active Providers',
        biz3: 'Active Models',
        stat1Label: 'Unified Gateway',
        stat1Value: '/v1 API',
        stat2Label: 'Model Supply',
        stat2Value: 'Platform + Individuals',
        stat3Label: 'Settlement',
        stat3Value: 'Wallet Native',
        stat4Label: 'Total Tokens',
        sectionArch: 'Growth Architecture',
        sectionArchDesc: 'Built not just for aggregation, but for speed-to-market, service quality, and margin control.',
        arch1: 'Unified ingress: OpenAI-compatible protocol with low migration cost',
        arch2: 'Intelligent routing: dynamic dispatch by cost and availability',
        arch3: 'Settleable ledger: usage billing with auditable revenue traces',
        sectionPillars: 'Core Capability Matrix',
        sectionPillarsDesc: 'Build the AI exchange network in modular units that evolve independently.',
        p1Title: 'Unified Gateway',
        p1Desc: 'One API layer for multi-supplier access.',
        p2Title: 'Provider Routing',
        p2Desc: 'Dispatch by price and availability.',
        p3Title: 'Usage Metering',
        p3Desc: 'Track request and cost metrics end to end.',
        p4Title: 'Programmable Billing',
        p4Desc: 'Support dynamic pricing and tiered rates.',
        p5Title: 'Wallet Settlement',
        p5Desc: 'Wallet buy/sell with on-chain settlement.',
        p6Title: 'Ops Console',
        p6Desc: 'Operate users, models, and growth strategy centrally.',
        p7Title: 'Model Catalog',
        p7Desc: 'Unified model directory with capability tags.',
        p8Title: 'Risk Controls',
        p8Desc: 'Limits, guardrails, and auditable traces.',
        p9Title: 'Revenue Split',
        p9Desc: 'Multi-role split and payout rules.',
        g1Title: 'Access Layer',
        g1Desc: 'Unified ingress, catalog, and access capabilities',
        g2Title: 'Routing Layer',
        g2Desc: 'Routing, metering, and guardrail capabilities',
        g3Title: 'Settlement Layer',
        g3Desc: 'Billing, settlement, and revenue distribution capabilities',
        sectionUsecase: 'Commercial Use Cases',
        sectionUsecaseDesc: 'From early validation to scaled operations.',
        case1Title: 'AI Aggregation Platform',
        case1Desc: 'Expand product capability fast with one gateway across model suppliers.',
        case2Title: 'Subscription Capacity Marketplace',
        case2Desc: 'Enable teams and individuals to monetize model capacity as supply.',
        case3Title: 'Growth & Margin Optimization',
        case3Desc: 'Improve conversion and gross margin with pricing and routing strategy.',
        manifestoTitle: 'From “API cost” to “network revenue”',
        manifestoDesc: 'The next phase of AI infrastructure is not just faster model calls, but turning every call into an operable, distributable, and compounding business asset.',
        ctaTitle: 'Connect your AI product to the SolAIX exchange network',
        ctaDesc: 'Unify ingress, routing, billing, and settlement in one platform and shorten the path from launch to revenue growth.',
        ctaPrimary: 'Book Onboarding',
        ctaSecondary: 'Get Solution',
        inquirySuccess: 'Submitted. Our team will contact you soon.',
        footerDocs: 'Docs',
        footerTerms: 'Terms',
        footerPrivacy: 'Privacy',
        footerRight: 'All rights reserved.',
        featuresTitle: 'Core Capabilities',
        f1t: 'Multi-Provider Aggregation',
        f1d: 'Connect OpenAI, OpenRouter, and custom providers with price/priority routing.',
        f2t: 'Wallet-native Settlement',
        f2d: 'Wallet-connected trading with transparent on-chain settlement.',
        lockedTitle: 'Private Console Locked',
        lockedDesc: 'Sign in to view trading flow, API examples, balance, and execution details.',
        consoleTitle: 'Trading & Gateway Console',
        production: 'Production Preview',
        connectWallet: 'Connect Wallet',
        walletLabel: 'Wallet',
        tabTrade: 'Trade',
        tabStatus: 'Status',
        tabApi: 'API',
        navConsole: 'Console',
        navPillars: 'Capabilities',
        navArch: 'Architecture',
        navUsecase: 'Use Cases',
        marketParams: 'Market',
        buyTitle: 'Buy',
        sellTitle: 'Sell',
        buyAmount: 'Buy Amount',
        sellAmount: 'Sell Amount',
        buyBtn: 'Buy with SOL',
        sellBtn: 'Sell for SOL',
        tokenBalance: 'Current Wallet Balance',
        tradeStatusTitle: 'Trade Status',
        waiting: 'Waiting',
        apiExampleTitle: 'API Example',
        apiCompatible: 'OpenAI-compatible /v1/chat/completions',
        apiHint: 'Create API keys in admin panel and route providers by priority.',
      },
    };
    const t = computed(() => i18n[locale.value] || i18n.zh);
    const metricCards = computed(() => [
      { label: t.value.stat1Label, value: t.value.stat1Value },
      { label: t.value.stat2Label, value: t.value.stat2Value },
      { label: t.value.stat3Label, value: t.value.stat3Value },
      { label: t.value.stat4Label, value: formatCompact(metrics.monthlyTokens) },
    ]);

    async function fetchAccount(apiKey) {
      const r = await fetch('/api/admin/users', {
        credentials: 'include',
      });
      if (r.ok) {
        const j = await r.json();
        const demo = (j.users || []).find((u) => u.api_key === apiKey);
        if (demo) {
          account.name = demo.name;
          account.role = demo.role;
          account.balance_cents = demo.balance_cents || 0;
          return;
        }
      }
      account.name = 'API User';
      account.role = 'buyer';
    }

    async function login() {
      const key = loginApiKey.value.trim();
      if (!key) {
        ElMessage.warning('请输入 API Key');
        return;
      }
      authLoading.value = true;
      try {
        const test = await fetch('/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        const data = await test.json().catch(() => ({}));
        if (!test.ok) throw new Error(data.error || 'API Key 验证失败');
        localStorage.setItem('solaix_user_api_key', key);
        isAuthed.value = true;
        await fetchAccount(key);
        ElMessage.success('登录成功，已解锁交易与 API 面板');
      } catch (e) {
        ElMessage.error(e.message || String(e));
      } finally {
        authLoading.value = false;
      }
    }

    async function submitInquiry() {
      const name = inquiryForm.name.trim();
      const email = inquiryForm.email.trim();
      if (!name || !email) {
        ElMessage.warning(locale.value === 'zh' ? '请填写姓名和邮箱' : 'Please provide name and email');
        return;
      }
      inquiryLoading.value = true;
      try {
        const r = await fetch('/api/inquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...inquiryForm,
            source: 'homepage_cta',
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'submit failed');
        ElMessage.success(t.value.inquirySuccess);
        inquiryForm.name = '';
        inquiryForm.email = '';
        inquiryForm.company = '';
        inquiryForm.message = '';
      } catch (e) {
        ElMessage.error(e.message || String(e));
      } finally {
        inquiryLoading.value = false;
      }
    }

    function logout() {
      localStorage.removeItem('solaix_user_api_key');
      isAuthed.value = false;
      loginApiKey.value = '';
      account.name = 'Guest';
      account.role = 'viewer';
      account.balance_cents = 0;
      ElMessage.success('已退出');
    }

    function toggleLocale() {
      locale.value = locale.value === 'zh' ? 'en' : 'zh';
      localStorage.setItem('solaix_locale', locale.value);
    }

    function jumpTo(id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function loadMarket() {
      try {
        const r = await fetch('/api/market');
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || j.hint || '市场未配置');
        Object.assign(market, j, { ok: true });
        connection = new Connection(j.rpcUrl, 'confirmed');
      } catch (e) {
        market.ok = false;
        ElMessage.error(e.message || String(e));
      }
    }

    function formatCompact(n) {
      if (!Number.isFinite(Number(n))) return '0';
      return new Intl.NumberFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(Number(n));
    }

    async function loadMetrics() {
      try {
        const r = await fetch('/api/metrics');
        const j = await r.json();
        if (!r.ok) return;
        metrics.monthlyTokens = Number(j.monthlyTokens || 0);
        metrics.activeUsers = Number(j.activeUsers || 0);
        metrics.activeProviders = Number(j.activeProviders || 0);
        metrics.activeModels = Number(j.activeModels || 0);
      } catch {
        // ignore metrics fetch error on homepage
      }
    }

    async function refreshBalance() {
      if (!connection || !walletPk || !market.ok) {
        tokenBalance.value = '—';
        return;
      }
      try {
        const resp = await connection.getParsedTokenAccountsByOwner(walletPk);
        let total = 0n;
        for (const { account } of resp.value) {
          const info = account.data.parsed?.info;
          if (!info || info.mint !== market.mint) continue;
          total += BigInt(info.tokenAmount.amount);
        }
        tokenBalance.value = `${Number(total) / 10 ** market.decimals} ${market.symbol}`;
      } catch {
        tokenBalance.value = `0 ${market.symbol}`;
      }
    }

    async function connectWallet() {
      if (!window.solana) {
        ElMessage.warning('请先安装 Phantom 钱包');
        return;
      }
      try {
        const res = await window.solana.connect();
        walletPk = res.publicKey;
        walletAddress.value = walletPk.toBase58();
        await refreshBalance();
        ElMessage.success('钱包连接成功');
      } catch (e) {
        ElMessage.error(e.message || String(e));
      }
    }

    async function buy() {
      if (!walletPk || !market.ok || !form.buyAmount || form.buyAmount <= 0) {
        ElMessage.warning('请先连接钱包并填写买入数量');
        return;
      }
      loading.value = true;
      tradeStatus.value = '准备买入...';
      try {
        const q = await fetch('/api/buy/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenAmount: Number(form.buyAmount) }),
        });
        const qj = await q.json();
        if (!q.ok) throw new Error(qj.error || '询价失败');

        const tx = new Transaction();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = walletPk;
        tx.add(
          SystemProgram.transfer({
            fromPubkey: walletPk,
            toPubkey: new PublicKey(qj.treasury),
            lamports: BigInt(qj.lamportsNeeded),
          })
        );
        tradeStatus.value = '请在钱包确认买入转账...';
        const signed = await window.solana.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

        const c = await fetch('/api/buy/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature: sig, wallet: walletAddress.value, tokenAmount: Number(form.buyAmount) }),
        });
        const cj = await c.json();
        if (!c.ok) throw new Error(cj.error || cj.detail || '买入确认失败');
        tradeStatus.value = `买入成功，结算哈希 ${cj.settleTx?.slice(0, 10)}...`;
        ElMessage.success('买入成功');
        await refreshBalance();
      } catch (e) {
        tradeStatus.value = `买入失败: ${e.message || e}`;
        ElMessage.error(e.message || String(e));
      } finally {
        loading.value = false;
      }
    }

    async function sell() {
      if (!walletPk || !market.ok || !form.sellAmount || form.sellAmount <= 0) {
        ElMessage.warning('请先连接钱包并填写卖出数量');
        return;
      }
      loading.value = true;
      tradeStatus.value = '准备卖出...';
      try {
        const b = await fetch('/api/sell/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress.value, tokenAmount: Number(form.sellAmount) }),
        });
        const bj = await b.json();
        if (!b.ok) throw new Error(bj.error || '构建卖出交易失败');
        const raw = Uint8Array.from(atob(bj.transaction), (c) => c.charCodeAt(0));
        const tx = Transaction.from(raw);

        tradeStatus.value = '请在钱包确认卖出转账...';
        const signed = await window.solana.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, 'confirmed');

        const c = await fetch('/api/sell/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature: sig, wallet: walletAddress.value, tokenAmount: Number(form.sellAmount) }),
        });
        const cj = await c.json();
        if (!c.ok) throw new Error(cj.error || cj.detail || '卖出确认失败');
        tradeStatus.value = `卖出成功，结算哈希 ${cj.settleTx?.slice(0, 10)}...`;
        ElMessage.success('卖出成功');
        await refreshBalance();
      } catch (e) {
        tradeStatus.value = `卖出失败: ${e.message || e}`;
        ElMessage.error(e.message || String(e));
      } finally {
        loading.value = false;
      }
    }

    onMounted(async () => {
      await loadMarket();
      await loadMetrics();
      const saved = localStorage.getItem('solaix_user_api_key') || '';
      if (saved) {
        loginApiKey.value = saved;
        await login();
      }
      if (window.solana?.isConnected && window.solana.publicKey) {
        walletPk = window.solana.publicKey;
        walletAddress.value = walletPk.toBase58();
        await refreshBalance();
      }
    });

    return {
      loading,
      market,
      form,
      walletAddress,
      walletShort,
      authLoading,
      isAuthed,
      loginApiKey,
      account,
      balanceUsd,
      locale,
      t,
      consoleView,
      loginVisible,
      inquiryLoading,
      inquiryForm,
      metrics,
      metricCards,
      tokenBalance,
      tradeStatus,
      apiExample,
      login,
      submitInquiry,
      logout,
      toggleLocale,
      jumpTo,
      connectWallet,
      buy,
      sell,
    };
  },
  template: `
    <div class="app-wrap">
      <div class="top-nav">
        <div class="brand-wrap">
          <div class="brand-mark"></div>
          <div class="brand-text">
            <strong>SolAIX Network</strong>
            <span>AI Subscription Exchange Infrastructure</span>
          </div>
        </div>
        <div class="top-links">
          <button class="brand-btn brand-btn-secondary" @click="toggleLocale">{{ locale === 'zh' ? 'EN' : '中' }}</button>
        </div>
      </div>

      <div v-if="isAuthed" class="authed-nav">
        <div class="authed-nav-group">
          <button class="authed-nav-link" :class="{ active: consoleView === 'trade' }" @click="consoleView = 'trade'; jumpTo('console')">{{ t.tabTrade }}</button>
          <button class="authed-nav-link" :class="{ active: consoleView === 'status' }" @click="consoleView = 'status'; jumpTo('console')">{{ t.tabStatus }}</button>
          <button class="authed-nav-link" :class="{ active: consoleView === 'api' }" @click="consoleView = 'api'; jumpTo('console')">{{ t.tabApi }}</button>
        </div>
        <div class="authed-nav-sep"></div>
        <div class="authed-nav-group">
          <button class="authed-nav-link" @click="jumpTo('pillars')">{{ t.navPillars }}</button>
          <button class="authed-nav-link" @click="jumpTo('arch')">{{ t.navArch }}</button>
          <button class="authed-nav-link" @click="jumpTo('usecase')">{{ t.navUsecase }}</button>
        </div>
      </div>

      <div class="hero">
        <div class="hero-grid">
          <div>
            <div class="hero-eyebrow">{{ t.eyebrow }}</div>
            <h1>{{ t.heroTitle }}</h1>
            <p>{{ t.heroDesc }}</p>
            <div class="hero-subline">
              <span class="pill">{{ t.heroSub1 }}</span>
              <span class="pill">{{ t.heroSub2 }}</span>
              <span class="pill">{{ t.heroSub3 }}</span>
            </div>
            <div class="trust-line">
              <span class="pill">{{ t.trust1 }}</span>
              <span class="pill">{{ t.trust2 }}</span>
              <span class="pill">{{ t.trust3 }}</span>
            </div>
          </div>
        </div>
        <div class="brand-stats">
          <div v-for="card in metricCards" :key="card.label" class="brand-stat">
            <div class="label">{{ card.label }}</div>
            <div class="value">{{ card.value }}</div>
          </div>
        </div>
      </div>

      <div v-if="isAuthed" id="console" class="head-row" style="margin-top:18px">
        <h3 style="margin:0;color:#fff">{{ t.consoleTitle }}</h3>
        <div class="status-pills">
          <span class="pill">{{ account.name }} / {{ balanceUsd }}</span>
          <el-button class="brand-btn brand-btn-primary" @click="connectWallet">{{ t.walletLabel }}: {{ walletShort }}</el-button>
        </div>
      </div>

      <div v-if="isAuthed" class="console-tabs">
        <button class="console-tab" :class="{ active: consoleView === 'trade' }" @click="consoleView = 'trade'">{{ t.tabTrade }}</button>
        <button class="console-tab" :class="{ active: consoleView === 'status' }" @click="consoleView = 'status'">{{ t.tabStatus }}</button>
        <button class="console-tab" :class="{ active: consoleView === 'api' }" @click="consoleView = 'api'">{{ t.tabApi }}</button>
      </div>

      <el-row v-if="isAuthed && consoleView === 'trade'" :gutter="16">
        <el-col :md="8" :sm="24">
          <el-card class="console-card">
            <template #header><span>{{ t.marketParams }}</span></template>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="状态">{{ market.ok ? '可用' : '未配置' }}</el-descriptions-item>
              <el-descriptions-item label="代币">{{ market.symbol }}</el-descriptions-item>
              <el-descriptions-item label="网络">{{ market.cluster }}</el-descriptions-item>
              <el-descriptions-item label="汇率">1 SOL ≈ {{ market.tokensPerSol }} {{ market.symbol }}</el-descriptions-item>
              <el-descriptions-item label="最小交易">{{ market.minTradeSol }} SOL</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <el-col :md="8" :sm="24">
          <el-card class="console-card">
            <template #header><span>{{ t.buyTitle }} {{ market.symbol }}</span></template>
            <el-form label-position="top">
              <el-form-item :label="t.buyAmount">
                <el-input-number v-model="form.buyAmount" :min="0" :step="1" style="width:100%" />
              </el-form-item>
              <el-button class="brand-btn brand-btn-primary" :loading="loading" @click="buy" style="width:100%">{{ t.buyBtn }}</el-button>
            </el-form>
          </el-card>
        </el-col>

        <el-col :md="8" :sm="24">
          <el-card class="console-card">
            <template #header><span>{{ t.sellTitle }} {{ market.symbol }}</span></template>
            <p class="muted">{{ t.tokenBalance }}: {{ tokenBalance }}</p>
            <el-form label-position="top">
              <el-form-item :label="t.sellAmount">
                <el-input-number v-model="form.sellAmount" :min="0" :step="1" style="width:100%" />
              </el-form-item>
              <el-button class="brand-btn brand-btn-secondary" :loading="loading" @click="sell" style="width:100%">{{ t.sellBtn }}</el-button>
            </el-form>
          </el-card>
        </el-col>
      </el-row>

      <el-card v-if="isAuthed && consoleView === 'status'" class="console-card" style="margin-top:16px">
        <template #header><span>{{ t.tradeStatusTitle }}</span></template>
        <el-alert class="console-alert" :title="tradeStatus || t.waiting" type="info" :closable="false" />
      </el-card>

      <el-card v-if="isAuthed && consoleView === 'api'" class="console-card" style="margin-top:16px">
        <template #header><span>{{ t.apiExampleTitle }}</span></template>
        <el-alert class="console-alert" type="success" :closable="false" :title="t.apiCompatible" />
        <el-input
          class="console-textarea"
          type="textarea"
          :rows="10"
          readonly
          :model-value="apiExample"
          style="margin-top:10px"
        />
        <p class="muted" style="margin-top:8px">{{ t.apiHint }}</p>
      </el-card>

      <section id="pillars" class="showcase">
        <div class="showcase-head">
          <h3>{{ t.sectionPillars }}</h3>
          <p>{{ t.sectionPillarsDesc }}</p>
        </div>
        <div class="pillar-groups">
          <div class="pillar-group">
            <div class="pillar-group-head">
              <h4>{{ t.g1Title }}</h4>
              <p>{{ t.g1Desc }}</p>
            </div>
            <div class="pillar-grid">
              <div class="pillar-card"><h4>{{ t.p1Title }}</h4><p>{{ t.p1Desc }}</p></div>
              <div class="pillar-card"><h4>{{ t.p7Title }}</h4><p>{{ t.p7Desc }}</p></div>
              <div class="pillar-card"><h4>{{ t.p6Title }}</h4><p>{{ t.p6Desc }}</p></div>
            </div>
          </div>
          <div class="pillar-group">
            <div class="pillar-group-head">
              <h4>{{ t.g2Title }}</h4>
              <p>{{ t.g2Desc }}</p>
            </div>
            <div class="pillar-grid">
              <div class="pillar-card"><h4>{{ t.p2Title }}</h4><p>{{ t.p2Desc }}</p></div>
              <div class="pillar-card"><h4>{{ t.p3Title }}</h4><p>{{ t.p3Desc }}</p></div>
              <div class="pillar-card"><h4>{{ t.p8Title }}</h4><p>{{ t.p8Desc }}</p></div>
            </div>
          </div>
          <div class="pillar-group">
            <div class="pillar-group-head">
              <h4>{{ t.g3Title }}</h4>
              <p>{{ t.g3Desc }}</p>
            </div>
            <div class="pillar-grid">
              <div class="pillar-card"><h4>{{ t.p4Title }}</h4><p>{{ t.p4Desc }}</p></div>
              <div class="pillar-card"><h4>{{ t.p5Title }}</h4><p>{{ t.p5Desc }}</p></div>
              <div class="pillar-card"><h4>{{ t.p9Title }}</h4><p>{{ t.p9Desc }}</p></div>
            </div>
          </div>
        </div>
      </section>

      <section id="arch" class="showcase">
        <div class="showcase-head">
          <h3>{{ t.sectionArch }}</h3>
          <p>{{ t.sectionArchDesc }}</p>
        </div>
        <div class="showcase-card">
          <ul class="clean-list">
            <li>{{ t.arch1 }}</li>
            <li>{{ t.arch2 }}</li>
            <li>{{ t.arch3 }}</li>
          </ul>
        </div>
      </section>

      <section class="manifesto">
        <h3>{{ t.manifestoTitle }}</h3>
        <p>{{ t.manifestoDesc }}</p>
      </section>

      <section class="final-cta">
        <h3>{{ t.ctaTitle }}</h3>
        <p>{{ t.ctaDesc }}</p>
        <div class="cta-lead-form">
          <input v-model="inquiryForm.name" type="text" placeholder="Name" />
          <input v-model="inquiryForm.email" type="email" placeholder="Email" />
          <input v-model="inquiryForm.company" type="text" placeholder="Company" />
          <textarea v-model="inquiryForm.message" rows="3" placeholder="Use case / message"></textarea>
        </div>
        <div class="cta-actions">
          <button class="brand-btn brand-btn-primary" @click="submitInquiry" :disabled="inquiryLoading">{{ inquiryLoading ? '...' : t.ctaPrimary }}</button>
          <a class="brand-btn brand-btn-secondary" href="#">{{ t.ctaSecondary }}</a>
        </div>
      </section>

      <section id="usecase" class="showcase">
        <div class="showcase-head">
          <h3>{{ t.sectionUsecase }}</h3>
          <p>{{ t.sectionUsecaseDesc }}</p>
        </div>
        <div class="case-grid">
          <div class="case-card">
            <h4>{{ t.case1Title }}</h4>
            <p>{{ t.case1Desc }}</p>
          </div>
          <div class="case-card">
            <h4>{{ t.case2Title }}</h4>
            <p>{{ t.case2Desc }}</p>
          </div>
          <div class="case-card">
            <h4>{{ t.case3Title }}</h4>
            <p>{{ t.case3Desc }}</p>
          </div>
        </div>
      </section>

      <footer class="site-footer">
        <div>SolAIX Network © 2026 · {{ t.footerRight }}</div>
        <div class="footer-links">
          <a href="#">{{ t.footerDocs }}</a>
          <a href="#">{{ t.footerTerms }}</a>
          <a href="#">{{ t.footerPrivacy }}</a>
        </div>
      </footer>

      <el-dialog v-model="loginVisible" :title="'Access'" width="420px">
        <el-form label-position="top">
          <el-form-item :label="'API Key'">
            <el-input v-model="loginApiKey" placeholder="sk-solai-..." show-password />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button class="brand-btn brand-btn-secondary" @click="loginVisible = false">Close</el-button>
          <el-button class="brand-btn brand-btn-primary" :loading="authLoading" @click="login">Continue</el-button>
        </template>
      </el-dialog>
    </div>
  `,
};

createApp(App).use(ElementPlus).mount('#app');





