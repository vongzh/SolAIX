const { Router } = require('express');
const axios = require('axios');
const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = require('../config');

const router = Router();

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('缺少 OAuth 参数 code');
  }
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(500).send(
      '服务器未配置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET，请复制 .env.example 为 .env 并填写。'
    );
  }

  try {
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    const accessToken = tokenRes.data.access_token;
    const errDesc = tokenRes.data.error_description || tokenRes.data.error;
    if (!accessToken) {
      return res.status(401).send(`GitHub 拒绝授权：${errDesc || '无 access_token'}`);
    }

    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const login = encodeURIComponent(userRes.data.login || '');
    res.redirect(`/?login=success&username=${login}`);
  } catch (err) {
    const msg = err.response?.data?.message || err.message || '未知错误';
    res.status(500).send(`登录处理失败：${msg}`);
  }
});

module.exports = router;
