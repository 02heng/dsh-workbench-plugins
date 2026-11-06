// probe-big14.mjs — 看 302 响应头，并试浏览器下载通道（CDP setDownloadBehavior）
import fs from 'node:fs';
import path from 'node:path';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const share = fs.readFileSync('D:/dsh-workbench/mail/126/_tmp/bigurl2.txt', 'utf8').trim();
const u = new URL(share);
const key = u.searchParams.get('key');
const code = u.searchParams.get('code');
const r1 = await fetch('https://wx.mail.qq.com/ftn/download', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, referer: share, origin: 'https://wx.mail.qq.com' },
  body: new URLSearchParams({ f: 'json', func: '3', key, code }).toString(),
});
const meta = (await r1.json()).body;
const hop = await fetch(meta.url, { headers: { 'user-agent': UA }, redirect: 'manual' });
const hdrs = {};
hop.headers.forEach((v, k) => { if (k !== 'location') hdrs[k] = v.slice(0, 120); });

const DL = 'D:/dsh-workbench/mail/126/_tmp/big-dl2';
fs.mkdirSync(DL, { recursive: true });
for (const f of fs.readdirSync(DL)) fs.unlinkSync(path.join(DL, f));

const task = await taskSpace('dsh-126-probe');
const page = task.page('p1');
let cdpErr = null;
try {
  await page.cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL.replace(/\//g, '\\') });
} catch (e) {
  cdpErr = String(e).slice(0, 200);
}
let gotoErr = null;
try { await page.goto(meta.url); } catch (e) { gotoErr = String(e).slice(0, 200); }
// 等待落盘（最多 180 秒，看文件是否增长）
let last = -1;
for (let i = 0; i < 36; i += 1) {
  await page.waitForTimeout(5000);
  const files = fs.readdirSync(DL).filter((f) => !f.endsWith('.crdownload'));
  const total = files.reduce((s, f) => s + fs.statSync(path.join(DL, f)).size, 0);
  if (total !== last) { last = total; }
  if (total >= meta.size) break;
  if (i > 2 && total === 0) break;
}
const files = fs.readdirSync(DL).map((f) => ({ f, size: fs.statSync(path.join(DL, f)).size }));
console.log(JSON.stringify({ status302: hop.status, hopHeaders: hdrs, cdpErr, gotoErr, files, want: meta.size }, null, 1));
