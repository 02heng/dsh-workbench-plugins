// probe-mark.mjs — 冒烟测试「标记为已读」这条链路（对已读邮件操作，状态不变）
const task = await taskSpace('dsh-126-watch');
const page = task.page('p1');
await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4500);
for (let i = 0; i < 5; i += 1) {
  const n = JSON.parse(await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class^="rF0"]').length }))()`)).rows;
  if (n > 0) break;
  await page.evaluate(`(() => {
    const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
    if (c.length) c[c.length - 1].click();
    return true;
  })()`);
  await page.waitForTimeout(6000);
}

// 勾选第一行
const picked = JSON.parse(await page.evaluate(`(() => {
  const r = document.querySelector('[class^="rF0"]');
  if (!r) return JSON.stringify({ ok: false });
  const cb = r.querySelector('[class*="checkbox"]');
  if (!cb) return JSON.stringify({ ok: false, err: 'no checkbox' });
  cb.click();
  return JSON.stringify({ ok: true, rowId: r.id.slice(0, 30) });
})()`));
console.log('select:', JSON.stringify(picked));

// 点「标记为」下拉
const dd = JSON.parse(await page.evaluate(`(() => {
  const btns = [...document.querySelectorAll('.nui-dropdownBtn, [id^="_mail_button_"], .js-component-button')]
    .filter((e) => e.offsetParent && /标记为/.test((e.innerText || '').trim()));
  if (!btns.length) return JSON.stringify({ ok: false });
  btns[0].click();
  return JSON.stringify({ ok: true });
})()`));
console.log('dropdown:', JSON.stringify(dd));
await page.waitForTimeout(1000);

// 菜单项探测
const menu = JSON.parse(await page.evaluate(`(() => {
  const items = [...document.querySelectorAll('.nui-menu-item, [class*="menu"] li, [class*="MenuItem"], [class*="menuitem"]')]
    .filter((e) => e.offsetParent);
  return JSON.stringify(items.slice(0, 20).map((e) => ({
    tag: e.tagName,
    cls: (e.className || '').toString().slice(0, 40),
    text: (e.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 24),
  })));
})()`));
console.log('menu items:', JSON.stringify(menu, null, 1));

// 点「已读」
const hit = JSON.parse(await page.evaluate(`(() => {
  const items = [...document.querySelectorAll('.nui-menu-item, [class*="menu"] li, [class*="MenuItem"], [class*="menuitem"]')].filter((e) => e.offsetParent);
  const want = items.filter((e) => /^(标记为)?已读$/.test((e.innerText || '').trim()));
  if (!want.length) return JSON.stringify({ ok: false });
  want[0].click();
  return JSON.stringify({ ok: true, label: (want[0].innerText || '').trim() });
})()`));
console.log('click 已读:', JSON.stringify(hit));
await page.waitForTimeout(2500);

// 复核：全部行仍未读数量
const after = JSON.parse(await page.evaluate(`(() => {
  const rows = [...document.querySelectorAll('[class^="rF0"]')];
  return JSON.stringify({ rows: rows.length, unread: rows.filter((r) => r.querySelector('.nui-ico-unread')).length });
})()`));
console.log('after:', JSON.stringify(after));
