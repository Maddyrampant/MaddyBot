module.exports = {
  apps: [
    {
      name: "maddybot",
      script: "index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      watch: false,
      out_file: "bot.log",
      error_file: "bot.err.log",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
