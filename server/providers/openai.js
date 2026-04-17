const axios = require('axios');

const OPENAI_BASE = 'https://api.openai.com/v1';

function asUsage(data) {
  return {
    prompt_tokens: data?.usage?.prompt_tokens || 0,
    completion_tokens: data?.usage?.completion_tokens || 0,
    total_tokens: data?.usage?.total_tokens || 0,
  };
}

async function chatCompletions({ apiKey, model, messages, temperature }) {
  const started = Date.now();
  const res = await axios.post(
    `${OPENAI_BASE}/chat/completions`,
    {
      model,
      messages,
      temperature,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 45000,
    }
  );
  return {
    text: res.data?.choices?.[0]?.message?.content || '',
    raw: res.data,
    usage: asUsage(res.data),
    latencyMs: Date.now() - started,
  };
}

module.exports = { chatCompletions };
