// probe-big12.mjs — 完整下载：api → func=4 → 跟随 302 到 CDN → 流式落盘
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
const t0 = Date.now();
const r2 = await fetch(meta.url, { headers: { 'user-agent': UA, referer: share }, redirect: 'follow' });
const ct = r2.headers.get('content-type') || '';
const out = { name: meta.name, metaSize: meta.size, status: r2.status, ct };
if (/text\/html|json/i.test(ct)) {
  out.snippet = (await r2.text()).slice(0, 300);
} else {
  fs.mkdirSync('D:/dsh-workbench/mail/126/_tmp/big-dl', { recursive: true });
  const dest = 'D:/dsh-workbench/mail/126/_tmp/big-dl/' + String(meta.name).replace(/[\\/:*?"<>|]/g, '_');
  await pipeline(Readable.fromWeb(r2.body), fs.createWriteStream(dest));
  const st = fs.statSync(dest);
  const sec = (Date.now() - t0) / 1000;
  out.saved = dest; out.bytes = st.size; out.sec = +sec.toFixed(2); out.MBps = +(st.size / 1048576 / sec).toFixed(2);
  out.sizeMatches = st.size === meta.size;
}
console.log(JSON.stringify(out, null, 1));
