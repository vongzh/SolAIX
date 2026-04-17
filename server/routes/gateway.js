const crypto = require('crypto');
const axios = require('axios');
const { Router } = require('express');
const {
  getSetting,
  getUserByApiKey,
  adjustUserBalance,
  getEnabledProviderModels,
  createRequestLog,
  finishRequestLog,
  recordUsage,
} = require('../../lib/db');
const openaiAdapter = require('../providers/openai');
const openrouterAdapter = require('../providers/openrouter');
const { OPENAI_API_KEY, OPENROUTER_API_KEY } = require('../config');

const router = Router();

function getApiKey(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return (req.headers['x-api-key'] || '').toString().trim();
}

function centsFromTokens(tokens, pricePer1k) {
  if (!(pricePer1k > 0) || !(tokens > 0)) return 0;
  return Math.ceil((tokens / 1000) * pricePer1k * 100);
}

async function callCustomOpenAICompatible(baseUrl, apiKey, payload) {
  const started = Date.now();
  const res = await axios.post(`${baseUrl.replace(/\/$/, '')}/chat/completions`, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 45000,
  });
  const usage = res.data?.usage || {};
  return {
    text: res.data?.choices?.[0]?.message?.content || '',
    raw: res.data,
    usage: {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    },
    latencyMs: Date.now() - started,
  };
}

async function runProvider(provider, payload) {
  if (provider.type === 'openai') {
    const key = provider.api_key || OPENAI_API_KEY;
    if (!key) throw new Error('openai provider 缺少 api_key');
    return openaiAdapter.chatCompletions({ apiKey: key, ...payload });
  }
  if (provider.type === 'openrouter') {
    const key = provider.api_key || OPENROUTER_API_KEY;
    if (!key) throw new Error('openrouter provider 缺少 api_key');
    return openrouterAdapter.chatCompletions({ apiKey: key, ...payload });
  }
  if (provider.type === 'custom') {
    if (!provider.base_url || !provider.api_key) {
      throw new Error('custom provider 需要 base_url 和 api_key');
    }
    return callCustomOpenAICompatible(provider.base_url, provider.api_key, payload);
  }
  throw new Error(`不支持的 provider.type=${provider.type}`);
}

router.get('/models', (req, res) => {
  const modelRows = getEnabledProviderModels(null);
  const unique = new Map();
  for (const row of modelRows) {
    if (!unique.has(row.model_name)) {
      unique.set(row.model_name, {
        id: row.model_name,
        object: 'model',
        owned_by: row.name,
      });
    }
  }
  res.json({ object: 'list', data: [...unique.values()] });
});

router.post('/chat/completions', async (req, res) => {
  const requestId = crypto.randomUUID();
  res.setHeader('x-gateway-request-id', requestId);
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: '缺少 API Key（Authorization: Bearer 或 x-api-key）', request_id: requestId });
  }

  const user = getUserByApiKey(apiKey);
  if (!user) {
    return res.status(401).json({ error: 'API Key 无效或用户不可用', request_id: requestId });
  }

  const model = req.body?.model;
  const messages = req.body?.messages;
  const temperature = req.body?.temperature;
  if (!model || !Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: '需要 model 与非空 messages 数组', request_id: requestId });
  }

  const providerCandidates = getEnabledProviderModels(model);
  if (!providerCandidates.length) {
    return res.status(404).json({ error: `没有可用 provider 提供模型 ${model}`, request_id: requestId });
  }

  createRequestLog({ requestId, userId: user.id, modelName: model });

  const markup = Number(getSetting('default_sell_markup', '1.25')) || 1.25;
  const failures = [];

  for (const provider of providerCandidates) {
    try {
      const result = await runProvider(provider, { model, messages, temperature });
      const promptTokens = result.usage.prompt_tokens || 0;
      const completionTokens = result.usage.completion_tokens || 0;
      const totalTokens = result.usage.total_tokens || promptTokens + completionTokens;
      const providerCostCents =
        centsFromTokens(promptTokens, provider.input_price_per_1k) +
        centsFromTokens(completionTokens, provider.output_price_per_1k);
      const sellCostCents = Math.ceil(providerCostCents * markup);

      if (user.balance_cents < sellCostCents) {
        finishRequestLog({
          requestId,
          providerId: provider.provider_id,
          status: 'failed',
          errorMessage: '余额不足',
        });
        return res.status(402).json({
          error: '余额不足',
          need_cents: sellCostCents,
          balance_cents: user.balance_cents,
          request_id: requestId,
        });
      }

      adjustUserBalance(user.id, -sellCostCents, 'usage_debit', requestId, `${provider.name}/${model}`);
      recordUsage({
        request_id: requestId,
        user_id: user.id,
        provider_id: provider.provider_id,
        model_name: model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        provider_cost_cents: providerCostCents,
        sell_cost_cents: sellCostCents,
        latency_ms: result.latencyMs,
        status: 'ok',
      });
      finishRequestLog({ requestId, providerId: provider.provider_id, status: 'ok' });

      return res.json({
        id: requestId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: result.text },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
        billing: {
          currency: 'USD',
          charged_cents: sellCostCents,
          balance_cents_after: user.balance_cents - sellCostCents,
          provider: provider.name,
        },
        request_id: requestId,
      });
    } catch (err) {
      failures.push(`${provider.name}: ${err.message}`);
    }
  }

  finishRequestLog({
    requestId,
    providerId: null,
    status: 'failed',
    errorMessage: failures.join(' | ').slice(0, 500),
  });

  return res.status(502).json({
    error: '所有 provider 调用失败',
    details: failures,
    request_id: requestId,
    tried_providers: providerCandidates.map((p) => p.name),
  });
});

module.exports = router;
