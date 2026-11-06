// probe-big10.mjs — 用 func=4 直链流式下载 QQ 超大附件，测速
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
const j = await r1.json();
const meta = (j.body || {});
const direct = (meta.url || '').replace('func=4', 'func=4&mode=download');

const t0 = Date.now();
const r2 = await fetch(direct, { headers: { 'user-agent': UA, referer: share } });
const ct = r2.headers.get('content-type') || '';
const cd = r2.headers.get('content-disposition') || '';
const len = Number(r2.headers.get('content-length') || 0);
const out = { name: meta.name, metaSize: meta.size, sha: meta.sha, status: r2.status, ct, cd: cd.slice(0, 200), contentLen: len };
if (/text\/html/i.test(ct)) {
  out.snippet = (await r2.text()).slice(0, 400);
} else {
  const dest = 'D:/dsh-workbench/mail/126/_tmp/big-dl/test.zip';
  fs.mkdirSync('D:/dsh-workbench/mail/126/_tmp/big-dl', { recursive: true });
  await pipeline(Readable.fromWeb(r2.body), fs.createWriteStream(dest));
  const st = fs.statSync(dest);
  const sec = (Date.now() - t0) / 1000;
  out.saved = dest;
  out.bytes = st.size;
  out.sec = +sec.toFixed(2);
  out.MBps = +(st.size / 1048576 / sec).toFixed(2);
}
console.log(JSON.stringify(out, null, 1));
