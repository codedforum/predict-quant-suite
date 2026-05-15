module.exports = {
  apps: [
    {
      name: 'predict-tg-bot',
      script: 'src/bot.js',
      cwd: __dirname,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
