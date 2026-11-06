// probe-big13.mjs — 手动拿 302 的 CDN 地址，再单独试各种头
import fs from 'node:fs';
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
const cdn = hop.headers.get('location');
console.log('cdn =', String(cdn).slice(0, 120));

const trials = [
  ['plain', {}],
  ['HEAD', { method: 'HEAD' }],
  ['range 0-1023', { range: 'bytes=0-1023' }],
  ['referer mail.qq', { referer: 'https://mail.qq.com/' }],
  ['origin qq', { origin: 'https://wx.mail.qq.com' }],
];
const out = [];
for (const [label, extra] of trials) {
  try {
    const r = await fetch(cdn, { method: extra.method || 'GET', redirect: 'follow', headers: { 'user-agent': UA, ...extra } });
    out.push({ label, status: r.status, ct: (r.headers.get('content-type') || '').slice(0, 50), len: r.headers.get('content-length') || '', cd: (r.headers.get('content-disposition') || '').slice(0, 100) });
    if (r.body) { try { await r.body.cancel(); } catch (e) {} }
  } catch (e) {
    out.push({ label, error: String(e).slice(0, 150) });
  }
}
console.log(JSON.stringify(out, null, 1));
