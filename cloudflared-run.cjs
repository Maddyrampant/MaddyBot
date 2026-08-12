const { spawn } = require("child_process");

const exe = "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe";
const child = spawn(exe, ["tunnel", "--url", "http://localhost:8834"], {
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code) => process.exit(code));
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
