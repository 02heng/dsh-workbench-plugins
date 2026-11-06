// 诊断：每封邮件正文 HTML 长度与全部外链 host（判断 readhtml3.jsp 是否真拿到正文）
import fs from 'node:fs';

const ROOT = 'D:/dsh-workbench/mail/126';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const task = await taskSpace('dsh-126-watch');
const page = task.page('p1');
await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4000);
const cookieList = await page.cdp('Network.getAllCookies', {});
const cookiesAll = (cookieList && (cookieList.cookies || (cookieList.result && cookieList.result.cookies))) || [];
const cookie126 = cookiesAll.filter((c) => /(^|\.)(mail\.)?(126|163)\.com$/.test(String(c.domain || ''))).map((c) => `${c.name}=${c.value}`).join('; ');

const mailbox = JSON.parse(fs.readFileSync(`${ROOT}/mailbox.json`, 'utf8'));
const rows = [];
for (const m of mailbox) {
  const url = `https://mail.126.com/js6/read/readhtml3.jsp?mid=${encodeURIComponent(m.mid)}&userType=browser&moduleName=read.ReadModule_0&font=15&color=299E59`;
  let html = '', status = 0, ct = '';
  try {
    const res = await fetch(url, { headers: { cookie: cookie126, 'user-agent': UA, referer: 'https://mail.126.com/js6/main.jsp' } });
    status = res.status; ct = res.headers.get('content-type') || '';
    html = await res.text();
  } catch (e) {
    rows.push({ subject: m.subject, error: e.message });
    continue;
  }
  const text = html.replace(/&amp;/g, '&');
  const urls = [...new Set(text.match(/https?:\/\/[^\s"'<>\\)]+/g) || [])];
  const hosts = [...new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return ''; } }).filter(Boolean))];
  const external = hosts.filter((h) => !/(^|\.)(126|163)\.com$/.test(h));
  rows.push({ subject: m.subject.slice(0, 30), status, ct, len: html.length, urls: urls.length, external, sample: urls.filter((u) => !/(^|\.)(126|163)\.com/.test(u)).slice(0, 4) });
}
fs.writeFileSync(`${ROOT}/_tmp/body-diag.json`, JSON.stringify(rows, null, 2), 'utf8');
for (const r of rows) console.log(JSON.stringify(r));
