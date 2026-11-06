// dsh-mailbox 网页工作台「真实 HTTP」冒烟：fake webServer 收集路由 → 挂到 node:http → fetch 全链路。
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./loader.mjs", import.meta.url);
const { registerWorkbench, BASE } = await import("../lib/http.js");

const here = dirname(fileURLToPath(import.meta.url));
const TMP = resolve(here, ".we2e");
const results = [];

async function check(name, work) {
  try { await work(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, detail: String(error?.message ?? error) }); }
}

await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const routes = new Map();
const webServer = { register({ path, handler }) { routes.set(path, handler); return () => routes.delete(path); } };
const dispose = registerWorkbench(webServer, { root: TMP, timeoutMs: 120000 });

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const handler = routes.get(pathname);
  if (!handler) { res.writeHead(404, { "content-type": "text/plain" }); res.end("no route"); return; }
  try { await handler(req, res); }
  catch (error) { if (!res.writableEnded) { res.writeHead(500); res.end(String(error)); } }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = "http://127.0.0.1:" + server.address().port;
console.log("== dsh-mailbox web e2e ==", origin);

function raw({ method = "POST", path, headers = {}, body }) {
  return new Promise((done, fail) => {
    const req = httpRequest(origin + path, { method, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => done({ status: res.statusCode, headers: res.headers, body: text }));
    });
    req.on("error", fail);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

await check("GET / 渲染工作台", async () => {
  const res = await fetch(origin + BASE + "/");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(await res.text(), /邮箱收件台/);
});

await check("GET /app.js 与 /style.css 可加载", async () => {
  const js = await fetch(origin + BASE + "/app.js");
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.match(await js.text(), /withBusy/);
  const css = await fetch(origin + BASE + "/style.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
});

await check("GET /api/status 走真实 HTTP", async () => {
  const res = await fetch(origin + BASE + "/api/status");
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.status.address, "example@126.com");
});

await check("POST /api/config 同源写入成功", async () => {
  const res = await fetch(origin + BASE + "/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ patch: { fallbackTarget: "inbox/待人工/网页测试", rules: [] } }),
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.config.fallbackTarget, "inbox/待人工/网页测试");
});

await check("POST /api/config 跨源被 403 拒绝", async () => {
  const res = await raw({
    path: BASE + "/api/config",
    headers: { "content-type": "application/json", origin: "https://evil.example.com" },
    body: JSON.stringify({ patch: { fallbackTarget: "hacked" } }),
  });
  assert.equal(res.status, 403);
  assert.match(res.body, /跨站/);
  const check2 = await (await fetch(origin + BASE + "/api/config")).json();
  assert.equal(check2.config.fallbackTarget, "inbox/待人工/网页测试");
});

await check("HEAD 静态资源与未知路由 404", async () => {
  const head = await fetch(origin + BASE + "/style.css", { method: "HEAD" });
  assert.equal(head.status, 200);
  const missing = await fetch(origin + BASE + "/nope.js");
  assert.equal(missing.status, 404);
});

await check("POST /api/selftest 完整链路 21/21", async () => {
  const res = await fetch(origin + BASE + "/api/selftest", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.passed, data.total);
  assert.ok(data.total >= 21);
});

dispose();
server.close();
await rm(TMP, { recursive: true, force: true });

const failures = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failures.length === 0,
  passed: results.length - failures.length,
  total: results.length,
  failures,
  checks: results.map((item) => item.pass ? "✓ " + item.name : "✗ " + item.name + " — " + item.detail),
}, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
