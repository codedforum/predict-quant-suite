module.exports = {
  apps: [
    { name: 'vol-arb-bot', script: 'src/bot.js', cwd: __dirname, max_memory_restart: '512M' },
    { name: 'vol-arb-dashboard', script: 'src/dashboard/server.js', cwd: __dirname, max_memory_restart: '256M' },
  ],
};
