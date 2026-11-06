// probe-big8.mjs — 调 /ftn/download 接口拿真实下载信息
import fs from 'node:fs';
const src = fs.readFileSync('D:/dsh-workbench/mail/126/_tmp/bigurl.txt', 'utf8').trim();
const u = new URL(src);
const key = u.searchParams.get('key');
const code = u.searchParams.get('code');
const body = new URLSearchParams({ f: 'json', func: '3', key, code }).toString();
const r = await fetch('https://wx.mail.qq.com/ftn/download', {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    referer: src,
    origin: 'https://wx.mail.qq.com',
  },
  body,
});
const text = await r.text();
console.log(JSON.stringify({ status: r.status, setCookie: (r.headers.get('set-cookie') || '').slice(0, 300), body: text.slice(0, 1500) }, null, 1));
