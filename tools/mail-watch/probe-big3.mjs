// probe-big3.mjs — 直接抓 readhtml3.jsp 正文，找 QQ 超大附件的下载链接
import fs from 'node:fs';
const MID = '430:xtbBrgRupWroAmTT2QAA3P';
const OUT = 'D:/dsh-workbench/mail/126/_tmp/readhtml3.html';

const task = await taskSpace('dsh-126-probe');
const page = task.page('p1');
await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4000);
const ck = await page.cdp('Network.getAllCookies', {});
const list = (ck && (ck.cookies || (ck.result && ck.result.cookies))) || [];
const cookieHeader = list.filter((c) => /(^|\.)(mail\.)?(126|163)\.com$/.test(String(c.domain || ''))).map((c) => `${c.name}=${c.value}`).join('; ');

const url = `https://mail.126.com/js6/read/readhtml3.jsp?mid=${encodeURIComponent(MID).replace('%3A', ':')}&userType=browser&moduleName=read.ReadModule_0&font=15&color=299E59`;
const res = await fetch(url, {
  headers: {
    cookie: cookieHeader,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    referer: 'https://mail.126.com/js6/main.jsp',
  },
});
const html = await res.text();
fs.writeFileSync(OUT, html, 'utf8');
const hits = [...html.matchAll(/https?:\/\/[^"'\s<>]+/g)].map((m) => m[0]).filter((u) => /cgi-bin|download|ftn|big|qq/i.test(u));
const uniq = [...new Set(hits)];
console.log(JSON.stringify({ status: res.status, len: html.length, hasBig: /超大附件/.test(html), urls: uniq.slice(0, 20), saved: OUT }, null, 1));
