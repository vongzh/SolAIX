const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

// GitHub OAuth 配置
const GITHUB_CLIENT_ID = 'Ov23lixFVuJ2kL8kF47D';
const GITHUB_CLIENT_SECRET = '这里我稍后给你补';

// 1. 前端回调：获取 GitHub token
app.get('/github/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('缺少 code');

  try {
    // 拿 access token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
      },
      { headers: { Accept: 'application/json' } }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) return res.send('登录失败');

    // 拿用户信息
    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 登录成功 → 跳回前端并弹出授权
    res.redirect(`/?login=success&username=${userRes.data.login}`);
  } catch (err) {
    res.send('登录错误');
  }
});

// 健康检查
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
  console.log(`服务运行在 http://localhost:${port}`);
});
