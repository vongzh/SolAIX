import { createApp, ref, reactive, onMounted } from 'vue';
import ElementPlus from 'element-plus';
import { ElMessage, ElMessageBox } from 'element-plus';
import 'element-plus/dist/index.css';

const App = {
  setup() {
    const loggedIn = ref(false);
    const loading = ref(false);
    const loginForm = reactive({ username: 'admin', password: '' });
    const stats = reactive({ total: 0, usageCount: 0, rpc: '-' });
    const settings = reactive({ defaultSellMarkup: 1.25 });
    const providers = ref([]);
    const users = ref([]);
    const usage = ref([]);
    const inquiries = ref([]);
    const userMsg = ref('');

    const providerForm = reactive({
      name: '',
      type: 'openai',
      api_key: '',
      base_url: '',
      model_name: '',
      input_price_per_1k: 0.001,
      output_price_per_1k: 0.002,
    });

    const newUser = reactive({ name: '', role: 'buyer', initialBalanceCents: 0 });

    async function api(path, options = {}) {
      const r = await fetch(path, {
        ...options,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.statusText);
      return j;
    }

    async function login() {
      loading.value = true;
      try {
        await api('/api/admin/login', { method: 'POST', body: JSON.stringify(loginForm) });
        loggedIn.value = true;
        ElMessage.success('登录成功');
        await loadAll();
      } catch (e) {
        ElMessage.error(e.message || String(e));
      } finally {
        loading.value = false;
      }
    }

    async function logout() {
      await api('/api/admin/logout', { method: 'POST' });
      location.reload();
    }

    async function loadStats() {
      const s = await api('/api/admin/stats');
      Object.assign(stats, s);
    }

    async function loadSettings() {
      const s = await api('/api/admin/settings');
      settings.defaultSellMarkup = Number(s.defaultSellMarkup || 1.25);
    }

    async function saveSettings() {
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ defaultSellMarkup: settings.defaultSellMarkup }),
      });
      ElMessage.success('设置已保存');
    }

    async function loadProviders() {
      const { providers: rows } = await api('/api/admin/providers');
      providers.value = rows;
    }

    async function saveProvider() {
      if (!providerForm.name || !providerForm.model_name) {
        ElMessage.warning('请填写 provider 名称和模型名');
        return;
      }
      await api('/api/admin/providers', {
        method: 'POST',
        body: JSON.stringify({
          provider: {
            name: providerForm.name,
            type: providerForm.type,
            api_key: providerForm.api_key || null,
            base_url: providerForm.base_url || null,
            enabled: true,
            priority: 100,
          },
          models: [
            {
              model_name: providerForm.model_name,
              input_price_per_1k: Number(providerForm.input_price_per_1k),
              output_price_per_1k: Number(providerForm.output_price_per_1k),
              enabled: true,
            },
          ],
        }),
      });
      ElMessage.success('Provider 保存成功');
      await loadProviders();
    }

    async function toggleProvider(row) {
      await api(`/api/admin/providers/${row.id}/enabled`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      await loadProviders();
    }

    async function loadUsers() {
      const { users: rows, demoApiKey } = await api('/api/admin/users');
      users.value = rows;
      userMsg.value = demoApiKey ? `Demo API Key: ${demoApiKey}` : '';
    }

    async function createUser() {
      if (!newUser.name) {
        ElMessage.warning('请输入用户名称');
        return;
      }
      const created = await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      userMsg.value = `创建成功 user=${created.id} apiKey=${created.apiKey}`;
      ElMessage.success('用户创建成功');
      await loadUsers();
    }

    async function topupUser(row) {
      await api(`/api/admin/users/${row.id}/topup`, {
        method: 'POST',
        body: JSON.stringify({ amountCents: 1000 }),
      });
      ElMessage.success('已充值 +1000 cents');
      await loadUsers();
    }

    async function rotateUserKey(row) {
      const r = await api(`/api/admin/users/${row.id}/rotate-key`, { method: 'POST' });
      await ElMessageBox.alert(r.apiKey, `用户 ${row.id} 新 API Key`, { confirmButtonText: '已复制/关闭' });
      await loadUsers();
    }

    async function loadUsage() {
      const { usage: rows } = await api('/api/admin/usage?limit=100');
      usage.value = rows;
    }

    async function loadInquiries() {
      const { inquiries: rows } = await api('/api/admin/inquiries?limit=200');
      inquiries.value = rows;
    }

    async function loadAll() {
      await Promise.all([loadStats(), loadSettings(), loadProviders(), loadUsers(), loadUsage(), loadInquiries()]);
    }

    onMounted(async () => {
      const me = await api('/api/admin/me').catch(() => ({ admin: false }));
      loggedIn.value = !!me.admin;
      if (loggedIn.value) await loadAll();
    });

    return {
      loggedIn,
      loading,
      loginForm,
      stats,
      settings,
      providers,
      users,
      usage,
      inquiries,
      providerForm,
      newUser,
      userMsg,
      login,
      logout,
      saveSettings,
      saveProvider,
      toggleProvider,
      createUser,
      topupUser,
      rotateUserKey,
      loadProviders,
      loadUsers,
      loadUsage,
      loadInquiries,
    };
  },
  template: `
    <div class="admin-wrap">
      <div class="page-head">
        <el-space>
          <el-tag type="success" effect="dark">SolAIX 管理后台</el-tag>
          <el-link href="/" type="primary">返回前台</el-link>
        </el-space>
        <el-button v-if="loggedIn" type="danger" plain @click="logout">退出登录</el-button>
      </div>

      <el-card v-if="!loggedIn">
        <template #header><span>管理员登录</span></template>
        <el-form label-position="top" style="max-width:360px">
          <el-form-item label="用户名"><el-input v-model="loginForm.username" /></el-form-item>
          <el-form-item label="密码"><el-input v-model="loginForm.password" type="password" show-password /></el-form-item>
          <el-button type="primary" :loading="loading" @click="login">登录</el-button>
        </el-form>
      </el-card>

      <div v-else>
        <el-row :gutter="16">
          <el-col :md="8" :sm="24"><el-card><el-statistic title="链上交易数" :value="stats.total" /></el-card></el-col>
          <el-col :md="8" :sm="24"><el-card><el-statistic title="AI 请求数" :value="stats.usageCount" /></el-card></el-col>
          <el-col :md="8" :sm="24"><el-card><el-statistic title="RPC" :value="stats.rpc || '-'" /></el-card></el-col>
        </el-row>

        <el-tabs style="margin-top:16px">
          <el-tab-pane label="系统设置">
            <el-card>
              <el-form label-position="top" style="max-width:360px">
                <el-form-item label="默认售价系数 defaultSellMarkup">
                  <el-input-number v-model="settings.defaultSellMarkup" :min="1" :step="0.01" style="width:100%" />
                </el-form-item>
                <el-button type="primary" @click="saveSettings">保存设置</el-button>
              </el-form>
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="Provider 管理">
            <el-card>
              <el-form label-position="top">
                <el-row :gutter="12">
                  <el-col :md="8"><el-form-item label="名称"><el-input v-model="providerForm.name" /></el-form-item></el-col>
                  <el-col :md="8"><el-form-item label="类型"><el-select v-model="providerForm.type"><el-option label="openai" value="openai"/><el-option label="openrouter" value="openrouter"/><el-option label="custom" value="custom"/></el-select></el-form-item></el-col>
                  <el-col :md="8"><el-form-item label="模型名"><el-input v-model="providerForm.model_name" /></el-form-item></el-col>
                </el-row>
                <el-row :gutter="12">
                  <el-col :md="6"><el-form-item label="输入价 USD/1K"><el-input-number v-model="providerForm.input_price_per_1k" :min="0" :step="0.0001" style="width:100%" /></el-form-item></el-col>
                  <el-col :md="6"><el-form-item label="输出价 USD/1K"><el-input-number v-model="providerForm.output_price_per_1k" :min="0" :step="0.0001" style="width:100%" /></el-form-item></el-col>
                  <el-col :md="6"><el-form-item label="API Key"><el-input v-model="providerForm.api_key" placeholder="可留空" /></el-form-item></el-col>
                  <el-col :md="6"><el-form-item label="Base URL(custom)"><el-input v-model="providerForm.base_url" placeholder="https://host/v1" /></el-form-item></el-col>
                </el-row>
                <el-button type="primary" @click="saveProvider">保存 Provider</el-button>
                <el-button @click="loadProviders">刷新</el-button>
              </el-form>
            </el-card>
            <el-card style="margin-top:12px">
              <el-table :data="providers" border>
                <el-table-column prop="name" label="名称" />
                <el-table-column prop="type" label="类型" />
                <el-table-column prop="priority" label="优先级" />
                <el-table-column prop="model_count" label="模型数" />
                <el-table-column label="状态">
                  <template #default="{ row }">
                    <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="120">
                  <template #default="{ row }">
                    <el-button size="small" @click="toggleProvider(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="用户与 API Key">
            <el-card>
              <el-form label-position="top">
                <el-row :gutter="12">
                  <el-col :md="8"><el-form-item label="用户名称"><el-input v-model="newUser.name" /></el-form-item></el-col>
                  <el-col :md="8"><el-form-item label="角色"><el-input v-model="newUser.role" /></el-form-item></el-col>
                  <el-col :md="8"><el-form-item label="初始余额(cents)"><el-input-number v-model="newUser.initialBalanceCents" :min="0" :step="100" style="width:100%" /></el-form-item></el-col>
                </el-row>
                <el-button type="primary" @click="createUser">创建用户</el-button>
                <el-button @click="loadUsers">刷新</el-button>
              </el-form>
              <p class="muted">{{ userMsg }}</p>
            </el-card>
            <el-card style="margin-top:12px">
              <el-table :data="users" border>
                <el-table-column prop="id" label="ID" width="80" />
                <el-table-column prop="name" label="名称" />
                <el-table-column prop="role" label="角色" />
                <el-table-column prop="balance_cents" label="余额(cents)" />
                <el-table-column prop="status" label="状态" />
                <el-table-column label="操作" width="220">
                  <template #default="{ row }">
                    <el-space>
                      <el-button size="small" @click="topupUser(row)">充值+1000</el-button>
                      <el-button size="small" type="warning" @click="rotateUserKey(row)">轮换 Key</el-button>
                    </el-space>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="Usage 记录">
            <el-card>
              <el-button @click="loadUsage" style="margin-bottom:12px">刷新 Usage</el-button>
              <el-table :data="usage" border>
                <el-table-column prop="created_at" label="时间" width="180">
                  <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
                </el-table-column>
                <el-table-column prop="user_name" label="用户" />
                <el-table-column prop="provider_name" label="Provider" />
                <el-table-column prop="model_name" label="模型" />
                <el-table-column prop="total_tokens" label="总 tokens" />
                <el-table-column prop="sell_cost_cents" label="计费(cents)" />
              </el-table>
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="官网线索">
            <el-card>
              <el-button @click="loadInquiries" style="margin-bottom:12px">刷新线索</el-button>
              <el-table :data="inquiries" border>
                <el-table-column prop="created_at" label="时间" width="180">
                  <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
                </el-table-column>
                <el-table-column prop="name" label="姓名" width="130" />
                <el-table-column prop="email" label="邮箱" min-width="180" />
                <el-table-column prop="company" label="公司" width="150" />
                <el-table-column prop="source" label="来源" width="130" />
                <el-table-column prop="message" label="需求说明" min-width="220" />
              </el-table>
            </el-card>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  `,
};

createApp(App).use(ElementPlus).mount('#admin-app');



