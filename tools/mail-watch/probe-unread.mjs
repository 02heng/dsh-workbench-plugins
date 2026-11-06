const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");
await page.goto("https://mail.126.com/js6/main.jsp");
await page.waitForTimeout(4500);

for (let i = 0; i < 4; i += 1) {
  const n = JSON.parse(
    await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class^="rF0"]').length }))()`),
  ).rows;
  if (n > 0) break;
  await page.evaluate(`(() => {
    const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
    if (c.length) c[c.length - 1].click();
    return true;
  })()`);
  await page.waitForTimeout(6000);
}

const info = JSON.parse(
  await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class^="rF0"]')];
    const cls = {};
    rows.forEach((r) => { const c = r.className; cls[c] = (cls[c] || 0) + 1; });
    const sample = rows.slice(0, 4).map((r) => ({
      cls: r.className,
      id: r.id,
      label: (r.getAttribute('aria-label') || '').slice(0, 50),
      inner: r.innerText.replace(/\\s+/g, ' ').slice(0, 80),
      icons: [...r.querySelectorAll('[class*="flag"], [class*="unread"], [class*="read"]')].map((e) => e.className).slice(0, 6)
    }));
    return JSON.stringify({ count: rows.length, cls, sample });
  })()`),
);
console.log(JSON.stringify(info, null, 2));

await page.evaluate(`(() => {
  const rows = [...document.querySelectorAll('[class^="rF0"]')];
  if (rows[0]) rows[0].click();
  return true;
})()`);
await page.waitForTimeout(4500);
const body = JSON.parse(
  await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
    const box = boxes[boxes.length - 1] || null;
    const html = box ? box.innerHTML : '';
    const links = [...new Set((html.match(/https?:\\/\\/[^"'\\s<>]+/g) || []))].slice(0, 30);
    const pan = links.filter((u) => /pan\\.baidu|alipan|aliyundrive|quark\\.cn|lanzou|123pan|123684|ctfile|caiyun|weiyun/i.test(u));
    return JSON.stringify({ textHead: (box ? box.innerText : '').slice(0, 200), linkCount: links.length, links: links.slice(0, 10), panLinks: pan });
  })()`),
);
console.log(JSON.stringify(body, null, 2));
