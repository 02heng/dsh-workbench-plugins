import fs from 'node:fs';

const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");
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

const rows = JSON.parse(await page.evaluate(`(() => {
  const out = [];
  for (const r of document.querySelectorAll('[class^="rF0"]')) {
    const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
    if (!m) continue;
    const label = r.getAttribute('aria-label') || '';
    const fm = /发件人\\s*[：:]\\s*([^\\s]+)/.exec(label);
    const tm = /时间\\s*[：:]\\s*(.+)$/.exec(label);
    out.push({
      mid: m[1] + ':' + m[2],
      subject: (label.split(' 发件人')[0] || '').trim(),
      from: fm ? fm[1] : '',
      time: tm ? tm[1].trim() : '',
      unread: !!r.querySelector('.nui-ico-unread'),
      raw: (r.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200)
    });
  }
  return JSON.stringify(out);
})()`));

fs.writeFileSync('D:/dsh-workbench/mail/126/mailbox.json', JSON.stringify(rows, null, 2), 'utf8');
console.log('rows=' + rows.length + ' unread=' + rows.filter((r) => r.unread).length);
console.log(JSON.stringify(rows.slice(0, 3), null, 2));
