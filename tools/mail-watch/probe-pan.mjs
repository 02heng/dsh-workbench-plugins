// 探查：ego 浏览器里的百度登录态能否被 Node fetch 复用（BDUSS 等 cookie）
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const task = await taskSpace('dsh-126-watch');
const page = task.page('p1');
try {
  await page.goto('https://pan.baidu.com/disk/main');
} catch (e) {
  console.error('[warn] goto: ' + e.message);
}
await page.waitForTimeout(5000);

const cl = await page.cdp('Network.getAllCookies', {});
const all = (cl && (cl.cookies || (cl.result && cl.result.cookies))) || [];
const baidu = all.filter((c) => /(^|\.)baidu\.com$/.test(String(c.domain || '')));
const jar = baidu.map((c) => `${c.name}=${c.value}`).join('; ');
const out = { count: baidu.length, headerLen: jar.length, checks: [] };

async function get(url, extra) {
  const res = await fetch(url, { headers: { cookie: jar, 'user-agent': UA, referer: 'https://pan.baidu.com/disk/main', ...(extra || {}) }, redirect: 'manual' });
  const text = await res.text().catch(() => '');
  return { status: res.status, location: res.headers.get('location') || '', ct: res.headers.get('content-type') || '', text };
}

// 1) bdstoken：能拿到说明登录态有效
try {
  const r = await get('https://pan.baidu.com/api/gettemplatevariable?clienttype=0&app_id=250528&web=1&channel=chunlei&fields=%5B%22bdstoken%22%5D');
  let tok = '';
  try { tok = JSON.parse(r.text).result.bdstoken || ''; } catch {}
  out.checks.push({ name: 'bdstoken', status: r.status, ok: !!tok, len: tok.length, head: r.text.slice(0, 120) });
} catch (e) { out.checks.push({ name: 'bdstoken', error: e.message }); }

// 2) 用户信息：确认是谁登录的
try {
  const r = await get('https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo&app_id=250528&web=1');
  out.checks.push({ name: 'uinfo', status: r.status, body: r.text.slice(0, 300) });
} catch (e) { out.checks.push({ name: 'uinfo', error: e.message }); }

// 3) 磁盘配额：证明能读盘
try {
  const r = await get('https://pan.baidu.com/api/quota?checkfree=1&checkexpire=1&clienttype=0&app_id=250528&web=1&channel=chunlei');
  out.checks.push({ name: 'quota', status: r.status, body: r.text.slice(0, 200) });
} catch (e) { out.checks.push({ name: 'quota', error: e.message }); }

// 4) 页面标题：看浏览器里网盘是不是已登录
try {
  const t = await page.evaluate(`(() => JSON.stringify({ url: location.href, title: document.title, hasLogin: /登录|login/.test(document.body.innerText.slice(0, 400)), head: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160) }))()`);
  out.page = JSON.parse(t);
} catch (e) { out.page = { error: e.message }; }

fs.writeFileSync('D:/dsh-workbench/mail/126/_tmp/pan-auth.json', JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 1));
