module.exports = {
  apps: [
    {
      name: 'predict-tg-bot',
      script: 'src/bot.js',
      cwd: __dirname,
      max_memory_restart: '512M',
      // Cap restarts on bad config so PM2 doesn't spin forever if TG_TOKEN is missing.
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 5000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
