// 诊断 2：从渲染后的 DOM（含同源 iframe）取正文文本与全部链接，找网盘地址
import fs from 'node:fs';

const ROOT = 'D:/dsh-workbench/mail/126';
const task = await taskSpace('dsh-126-watch');
const page = task.page('p1');

await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4500);
for (let i = 0; i < 4; i += 1) {
  const n = JSON.parse(await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class^="rF0"]').length }))()`)).rows;
  if (n > 0) break;
  await page.evaluate(`(() => {
    const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
    if (c.length) c[c.length - 1].click();
    return true;
  })()`);
  await page.waitForTimeout(6000);
}

const mailbox = JSON.parse(fs.readFileSync(`${ROOT}/mailbox.json`, 'utf8'));

async function openByMid(mid, subject) {
  const hashMid = mid.replace(':', '%3A');
  await page.evaluate(`(() => { location.hash = '#module=read.ReadModule%7C%7B%22id%22%3A%22${hashMid}%22%7D'; return true; })()`);
  for (let i = 0; i < 3; i += 1) {
    await page.waitForTimeout(3200);
    const st = JSON.parse(await page.evaluate(`(() => {
      const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
      const box = boxes[boxes.length - 1];
      return JSON.stringify({ has: !!box, match: box ? box.innerText.includes(${JSON.stringify(String(subject).slice(0, 8))}) : false });
    })()`));
    if (st.has && st.match) return true;
  }
  return false;
}

const PAN_RE = /(pan\.baidu\.com|yun\.baidu\.com|eyun\.baidu\.com|aliyundrive\.com|alipan\.com|pan\.quark\.cn|cloud\.189\.cn|115\.com|weiyun\.com|lanzou[a-z]?\.com|123pan\.com|jianguoyun\.com)/i;
const rows = [];

for (const m of mailbox) {
  const ok = await openByMid(m.mid, m.subject).catch(() => false);
  if (!ok) { rows.push({ subject: m.subject.slice(0, 28), ok: false }); continue; }
  const info = JSON.parse(await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
    const box = boxes[boxes.length - 1];
    const urls = [];
    const texts = [];
    const push = (d) => { if (!d) return; for (const a of d.querySelectorAll('a[href]')) urls.push(a.href + ' || ' + (a.innerText || '').trim().slice(0, 40)); };
    push(box);
    let frames = 0;
    for (const f of box.querySelectorAll('iframe')) {
      let src = '';
      try { src = f.src || ''; } catch {}
      frames += 1;
      try { push(f.contentDocument); texts.push(((f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText) || '').slice(0, 300)); } catch (e) { texts.push('iframe inaccessible: ' + e.message); }
    }
    return JSON.stringify({ text: (box.innerText || '').slice(0, 400), frames, urls: [...new Set(urls)] });
  })()`));
  const pan = info.urls.filter((u) => PAN_RE.test(u));
  const pwds = (info.text.match(/(提取码|密码|访问码|pwd)\s*[:：=]?\s*([0-9a-zA-Z]{4})/gi) || []);
  rows.push({ subject: m.subject.slice(0, 28), ok: true, frames: info.frames, urls: info.urls.length, pan, pwds: [...new Set(pwds)], textHead: info.text.replace(/\s+/g, ' ').slice(0, 120) });
}

fs.writeFileSync(`${ROOT}/_tmp/body-diag2.json`, JSON.stringify(rows, null, 2), 'utf8');
for (const r of rows) console.log(JSON.stringify(r));
