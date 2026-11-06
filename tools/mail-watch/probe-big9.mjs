// probe-big9.mjs — 跟随重定向取 wx.mail.qq.com 分享页 URL，再用其 key/code 调接口
import fs from 'node:fs';
const start = fs.readFileSync('D:/dsh-workbench/mail/126/_tmp/bigurl.txt', 'utf8').trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

let url = start;
const chain = [url];
for (let i = 0; i < 5; i += 1) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'manual' });
  if (r.status >= 300 && r.status < 400) {
    url = new URL(r.headers.get('location'), url).toString();
    chain.push(url);
  } else break;
}
fs.writeFileSync('D:/dsh-workbench/mail/126/_tmp/bigurl2.txt', url, 'utf8');

const u = new URL(url);
const key = u.searchParams.get('key');
const code = u.searchParams.get('code');
const out = { chain, keyLen: key ? key.length : 0, code };

const body = new URLSearchParams({ f: 'json', func: '3', key, code }).toString();
const r2 = await fetch('https://wx.mail.qq.com/ftn/download', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, referer: url, origin: 'https://wx.mail.qq.com' },
  body,
});
out.api = (await r2.text()).slice(0, 2000);
console.log(JSON.stringify(out, null, 1));
