const axios = require('axios');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function asUsage(data) {
  const usage = data?.usage || {};
  return {
    prompt_tokens: usage.prompt_tokens || usage.input_tokens || 0,
    completion_tokens: usage.completion_tokens || usage.output_tokens || 0,
    total_tokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
  };
}

async function chatCompletions({ apiKey, model, messages, temperature }) {
  const started = Date.now();
  const res = await axios.post(
    `${OPENROUTER_BASE}/chat/completions`,
    {
      model,
      messages,
      temperature,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://solaix.local',
        'X-Title': 'SolAIX Aggregator',
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
