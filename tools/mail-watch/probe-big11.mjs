// probe-big11.mjs — 试多种请求方式拿 func=4 直链
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
import fs from 'node:fs';
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
const base = j.body.url;

const variants = [
  ['GET as-is', base, {}],
  ['GET + range', base, { range: 'bytes=0-1023' }],
  ['GET + referer share', base, { referer: share }],
  ['GET + x-requested-with', base, { 'x-requested-with': 'XMLHttpRequest' }],
  ['POST as-is', base, { method: 'POST' }],
];
const out = [];
for (const [label, url, extra] of variants) {
  try {
    const r = await fetch(url, {
      method: extra.method || 'GET',
      redirect: 'manual',
      headers: { 'user-agent': UA, ...extra },
    });
    const ct = r.headers.get('content-type') || '';
    const loc = r.headers.get('location') || '';
    let body = '';
    if (r.status !== 200 && r.status !== 206) body = (await r.text()).slice(0, 200);
    out.push({ label, status: r.status, ct: ct.slice(0, 60), len: r.headers.get('content-length') || '', cd: (r.headers.get('content-disposition') || '').slice(0, 80), loc: loc.slice(0, 120), body });
  } catch (e) {
    out.push({ label, error: String(e).slice(0, 160) });
  }
}
console.log(JSON.stringify({ base: base.slice(0, 120), out }, null, 1));
