const { Router } = require('express');
const { GITHUB_CLIENT_ID } = require('../config');
const { createInquiry, getPublicMetrics } = require('../../lib/db');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'solai' });
});

router.get('/config', (req, res) => {
  res.json({ githubClientId: GITHUB_CLIENT_ID || null });
});

router.get('/metrics', (_req, res) => {
  res.json({ ok: true, ...getPublicMetrics() });
});

router.post('/inquiries', (req, res) => {
  const name = (req.body?.name || '').toString().trim();
  const email = (req.body?.email || '').toString().trim();
  const company = (req.body?.company || '').toString();
  const message = (req.body?.message || '').toString();
  const source = (req.body?.source || 'homepage').toString();
  if (!name) return res.status(400).json({ error: 'name 必填' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'email 格式无效' });
  }
  const id = createInquiry({ name, email, company, message, source });
  res.json({ ok: true, id });
});

module.exports = router;
