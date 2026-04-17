# SolAIX

面向 Solana 的落地页 + **SPL 代币买卖**（网页钱包签名）+ **管理后台**。默认使用 **Devnet**，便于零成本联调。

## 功能概览

- **前台**（`/`）：连接 Phantom 等 Solana 钱包，按后台配置的汇率用 SOL **买入** SAIX，或将 SAIX **卖出**换回 SOL（两笔链上步骤：用户签名 + 金库结算）。
- **管理后台**（`/admin/`，独立目录 `admin/`）：登录后查看成交、修改「每 1 SOL 可买多少代币」、单笔最低交易量、代币简称等。
- **GitHub 登录**（可选）：OAuth 成功后弹出说明弹窗（需配置 `GITHUB_CLIENT_*`）。

## 产品路线（当前共识）

- **阶段 A（当前）**：**现货**为主——SAIX 与 **SOL** 的柜台兑换；后续在同一方向演进为 **与主流币关联**（例如用 **USDC** 标价/交割、或接入 **Jupiter** 做其它资产的聚合兑换），仍属现货与流动性范畴，不引入合约杠杆与清算。
- **阶段 B（做大后再评估）**：**期货 / 永续 /「期货币」类衍生品**——需单独产品与技术方案（如接入成熟永续协议或全新设计），不在本仓库当前迭代内承诺。

## 环境要求

- Node.js 18+（`package.json` 中已声明 `engines`）
- Phantom 或其他支持 `window.solana` 的浏览器钱包
- Devnet SOL：金库地址需有水（[水龙头](https://faucet.solana.com/)）

## 结构是否合理

当前分层是清晰、可维护的：

| 层级 | 内容 |
|------|------|
| `server/` | HTTP：路由、Session、静态资源挂载顺序 |
| `lib/` | 与 HTTP 解耦：`db` 持久化、`solana` 纯链上逻辑 |
| `public/` / `admin/` | 前台与后台静态资源分离 |
| `scripts/` | 一次性链上初始化（发币） |
| `data/` | 本地 SQLite（默认已 gitignore） |

**可改进点（非必须）**：前台 `app.js` 通过 CDN 加载 `@solana/web3.js`，若需离线/可控构建可后续改为 Vite/Webpack；管理后台密码为明文比对，生产环境建议哈希存储或接入 SSO。

## 还可补充什么（按需）

- **健康检查**：已实现 `GET /api/health`（返回 `{ ok: true }`），部署探活可直接用。
- **日志**：用 `pino`/`winston` 结构化日志，替代 `console`。
- **测试**：对 `lib/solana.js` 的纯函数、`lamportsForSellRaw` 等写单元测试。
- **安全**：生产环境为 Cookie 设置 `secure: true`、`sameSite`，Session 存 Redis 等。
- **依赖审计**：`npm audit` 中提示可按需 `npm audit fix`（注意破坏性变更）。

## 本地如何跑起来（推荐顺序）

**1. 安装依赖**

```bash
cd SolAIX
npm install
```

**2. 环境变量**

PowerShell：

```powershell
Copy-Item .env.example .env
```

用编辑器打开 `.env`，至少填写：

- `TREASURY_SECRET_KEY`：Phantom 导出私钥（Base58），将作为金库。
- `ADMIN_PASSWORD`、`SESSION_SECRET`：后台登录与 Session（不要用示例里的弱密码）。
- 代币相关见下一步。

**3. Devnet SOL**

用 [水龙头](https://faucet.solana.com/) 给金库地址（对应 `TREASURY_SECRET_KEY` 的公钥）领 Devnet SOL（脚本要求余额大致 ≥ 0.05 SOL）。

**4. 创建 Mint 并写入 `TOKEN_MINT`**

```bash
npm run bootstrap-token
```

把终端里打印的 `TOKEN_MINT=...` 整行追加进 `.env`。

**5. 启动**

```bash
npm start
```

- 前台：<http://localhost:3000>（端口可在 `.env` 里改 `PORT`）
- 管理后台：<http://localhost:3000/admin/>

**6.（可选）GitHub 登录**

在 GitHub OAuth App 里将 **Authorization callback URL** 设为 `http://localhost:3000/github/callback`（与浏览器访问的 host/port 一致），并把 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 填入 `.env`。

### 最小可运行（不跑链上交易）

若只想看页面、进后台：填好 `ADMIN_PASSWORD` 与 `SESSION_SECRET` 即可启动；不填 `TOKEN_MINT` / `TREASURY_SECRET_KEY` 时，代币相关 API 会返回 503，前台会提示市场未配置。

## 业务说明（必读）

- **汇率**：后台「每 1 SOL 可购买的代币数量」为 `tokens_per_sol`。买入时用户先向金库转 SOL，服务端校验后从金库 ATA 向用户转 SAIX；卖出则相反（先收代币，再付 SOL）。
- **流动性**：卖出兑付需要金库内有足够 **SOL**；买入发放需要金库 ATA 内有足够 **SAIX**。请通过 `bootstrap-token` 或自行向金库 ATA 充值。
- **主网**：将 RPC 与 Phantom 网络切到 Mainnet 前，请完成安全审计与密钥管理；本仓库按演示场景设计。

## 项目结构

```
server/                 # HTTP 服务（Express）
  index.js              # 入口：加载环境变量并监听端口
  app.js                # 组装中间件、挂载路由、静态资源
  config.js             # 环境变量与业务常量（汇率换算辅助函数等）
  runtime.js            # 链上连接、Mint、金库 Keypair、decimals 缓存
  middleware.js         # requireMarket / requireAdmin
  routes/
    config.js           # GET /api/config
    trading.js          # /api/market、买/卖询价与确认
    admin.js            # /api/admin/*
    github.js           # GET /github/callback
lib/
  db.js                 # SQLite：设置与成交记录
  solana.js             # Solana / SPL 链上操作（与 HTTP「市场」路由区分）
scripts/
  bootstrap-token.js    # Devnet 创建 Mint 并铸造初始代币
public/
  index.html / app.js   # 前台落地页与交易脚本
admin/
  index.html            # 管理后台（与 public 分离，URL: /admin/）
data/
  market.db             # 运行时生成（勿提交）
```

| 路径 | 说明 |
|------|------|
| `server/index.js` | 进程入口 |
| `server/app.js` | 创建应用、Session、API 路由、`public/` 与 `admin/` 静态资源 |
| `server/config.js` | 端口、RPC、管理员、Explorer 链接、卖出侧 lamports 计算 |
| `server/runtime.js` | `TOKEN_MINT` / `TREASURY_SECRET_KEY` 解析后的链上状态 |
| `server/routes/*.js` | 按域拆分的 Express 路由 |
| `lib/db.js` | SQLite 访问 |
| `lib/solana.js` | 纯链上逻辑（校验转账、构建卖出交易、金库结算） |
| `scripts/bootstrap-token.js` | Devnet 一键发币到金库 ATA |
| `public/index.html` + `app.js` | 前台 |
| `admin/index.html` | 管理后台静态页（挂载在 `/admin/`） |

## 安全提示

- 切勿将 `.env`、金库私钥或 `data/*.db` 提交到公开仓库。
- 生产环境使用 HTTPS，并收紧 Session、CORS 与管理后台访问（如 IP 限制、反向代理鉴权）。
