// 一次性探查：扫收件箱每封邮件正文里的网盘链接 / 提取码，并看 ego 浏览器有没有百度登录态
import fs from 'node:fs';

const ROOT = 'D:/dsh-workbench/mail/126';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const task = await taskSpace('dsh-126-watch');
const page = task.page('p1');

const out = { baidu: {}, mails: [] };

try {
  await page.goto('https://mail.126.com/js6/main.jsp');
  await page.waitForTimeout(4000);
} catch (e) {
  console.error('goto failed', e.message);
}

const cookieList = await page.cdp('Network.getAllCookies', {});
const cookiesAll = (cookieList && (cookieList.cookies || (cookieList.result && cookieList.result.cookies))) || [];
const pick = (re) => cookiesAll.filter((c) => re.test(String(c.domain || '')));
const cookie126 = pick(/(^|\.)(mail\.)?(126|163)\.com$/).map((c) => `${c.name}=${c.value}`).join('; ');
const baiduCookies = pick(/(^|\.)baidu\.com$/);
out.baidu = {
  total: baiduCookies.length,
  names: baiduCookies.map((c) => c.name),
  hasBDUSS: baiduCookies.some((c) => c.name === 'BDUSS'),
  hasSTOKEN: baiduCookies.some((c) => c.name === 'STOKEN'),
};

const mailbox = JSON.parse(fs.readFileSync(`${ROOT}/mailbox.json`, 'utf8'));
const HOST_RE = /https?:\/\/[^\s"'<>\\)]+/g;
const PAN_RE = /(pan\.baidu\.com|yun\.baidu\.com|eyun\.baidu\.com|aliyundrive\.com|alipan\.com|pan\.quark\.cn|cloud\.189\.cn|115\.com|weiyun\.com|lanzou[a-z]?\.com|123pan\.com|jianguoyun\.com)/i;

for (const m of mailbox) {
  const url = `https://mail.126.com/js6/read/readhtml3.jsp?mid=${encodeURIComponent(m.mid)}&userType=browser&moduleName=read.ReadModule_0&font=15&color=299E59`;
  let html = '';
  try {
    const res = await fetch(url, { headers: { cookie: cookie126, 'user-agent': UA, referer: 'https://mail.126.com/js6/main.jsp' } });
    html = await res.text();
  } catch (e) {
    out.mails.push({ subject: m.subject, error: e.message });
    continue;
  }
  const text = html.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const links = [...new Set((text.match(HOST_RE) || []).filter((u) => PAN_RE.test(u)))];
  const pwds = [];
  const re = /(提取码|密码|访问码|pwd)\s*[:：=]?\s*([0-9a-zA-Z]{4})/gi;
  let mm;
  while ((mm = re.exec(text))) pwds.push(mm[0]);
  if (links.length || pwds.length) out.mails.push({ mid: m.mid, subject: m.subject, from: m.from, time: m.time, links, pwds: [...new Set(pwds)] });
}

fs.writeFileSync(`${ROOT}/_tmp/pan-links.json`, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ baidu: out.baidu, hits: out.mails.length, mails: out.mails }, null, 1));
