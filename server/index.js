require('dotenv').config();

const { createApp, port, printStartupHints } = require('./app');

const app = createApp();
const server = app.listen(port, printStartupHints);
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[错误] 端口 ${port} 已被占用。请关闭已运行的 node/其它服务，或在 .env 里设置 PORT=例如 3001`
    );
    console.error('排查: netstat -ano | findstr ":' + port + '"   然后 taskkill /PID <PID> /F');
  } else {
    console.error(err);
  }
  process.exit(1);
});
