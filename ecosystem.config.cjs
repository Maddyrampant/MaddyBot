module.exports = {
  apps: [
    {
      name: "maddybot",
      script: "index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      time: true,
      out_file: "bot.log",
      error_file: "bot.err.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
