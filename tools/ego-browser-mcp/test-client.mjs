import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["D:\\dsh-workbench\\ego-browser-mcp\\server.mjs"], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const pending = new Map();
let nextId = 1;

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      console.log("[non-json]", line.slice(0, 200));
      continue;
    }
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    } else {
      console.log("[unsolicited]", JSON.stringify(message).slice(0, 300));
    }
  }
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${method}`)), 200000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

const notify = (method, params) =>
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

const show = (label, message, limit = 1500) => {
  const text = JSON.stringify(message.result ?? message, null, 2);
  console.log(`\n##### ${label} #####\n${text.slice(0, limit)}${text.length > limit ? `\n…[${text.length} chars]` : ""}`);
};

const init = await request("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
show("initialize", init, 600);
notify("notifications/initialized", {});

const list = await request("tools/list", {});
console.log("\n##### tools #####");
console.log((list.result?.tools || []).map((t) => t.name).join(", "));

const open = await request("tools/call", {
  name: "browser_open",
  arguments: { url: "https://example.com" },
});
show("browser_open", open, 1200);

const snap = await request("tools/call", {
  name: "browser_snapshot",
  arguments: { maxChars: 1200 },
});
show("browser_snapshot", snap, 1800);

const shot = await request("tools/call", {
  name: "browser_screenshot",
  arguments: { path: "D:/dsh-workbench/tmp/ego-test/mcp-shot.png" },
});
show("browser_screenshot", shot, 600);

child.stdin.end();
setTimeout(() => process.exit(0), 500);
