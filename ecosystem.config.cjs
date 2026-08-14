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
    {
      name: "sd-forge",
      script: "start-forge.bat",
      cwd: "E:/AI-Studio",
      interpreter: "cmd.exe",
      autorestart: true,
      max_restarts: 3,
      time: true,
      out_file: "E:/AI-Studio/forge.log",
      error_file: "E:/AI-Studio/forge.err.log",
      merge_logs: true,
    },
  ],
};
