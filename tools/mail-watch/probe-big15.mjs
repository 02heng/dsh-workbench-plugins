// probe-big15.mjs — 带上 302 下发的 mail5k cookie 再取 CDN，测速落盘
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

const hop = await fetch(meta.url, { headers: { 'user-agent': UA }, redirect: 'manual' });
const cookie = (hop.headers.getSetCookie ? hop.headers.getSetCookie() : [hop.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
const cdn = hop.headers.get('location');

const t0 = Date.now();
const r2 = await fetch(cdn, { headers: { 'user-agent': UA, cookie } });
const ct = r2.headers.get('content-type') || '';
const out = { cookie, status: r2.status, ct: ct.slice(0, 60), len: r2.headers.get('content-length') || '', want: meta.size };
if (r2.status === 200 && !/text\/html/i.test(ct)) {
  const dest = 'D:/dsh-workbench/mail/126/_tmp/big-dl3/' + String(meta.name).replace(/[\\/:*?"<>|]/g, '_');
  fs.mkdirSync('D:/dsh-workbench/mail/126/_tmp/big-dl3', { recursive: true });
  await pipeline(Readable.fromWeb(r2.body), fs.createWriteStream(dest));
  const st = fs.statSync(dest);
  const sec = (Date.now() - t0) / 1000;
  Object.assign(out, { saved: dest, bytes: st.size, sec: +sec.toFixed(2), MBps: +(st.size / 1048576 / sec).toFixed(2), ok: st.size === meta.size });
} else {
  out.snippet = (await r2.text()).slice(0, 200);
}
console.log(JSON.stringify(out, null, 1));
