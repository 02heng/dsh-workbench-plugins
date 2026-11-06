// probe-read.mjs — 只读探针：确认 126 收件箱里「标已读」需要的选择器存在（不改任何状态）
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

const info = JSON.parse(await page.evaluate(`(() => {
  const rows = [...document.querySelectorAll('[class^="rF0"]')];
  const first = rows[0];
  const cb = first ? (first.querySelector('input[type=checkbox]') || first.querySelector('.nui-checkbox') || first.querySelector('[class*=checkbox]')) : null;
  const toolbars = [...document.querySelectorAll('a,div,span,button,i')]
    .filter((e) => e.offsetParent && /已读|未读|标记/.test(((e.getAttribute('title') || '') + ' ' + (e.innerText || '')).trim()))
    .slice(0, 30)
    .map((e) => ({
      tag: e.tagName,
      cls: (e.className || '').toString().slice(0, 60),
      title: (e.getAttribute('title') || '').slice(0, 40),
      text: (e.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 30),
      idAttr: (e.id || '').slice(0, 40),
    }));
  return JSON.stringify({
    rowCount: rows.length,
    firstRowId: first ? first.id : null,
    hasCheckbox: !!cb,
    checkboxTag: cb ? cb.tagName : null,
    checkboxHtml: cb ? cb.outerHTML.slice(0, 160) : null,
    unreadRows: rows.filter((r) => r.querySelector('.nui-ico-unread')).length,
    toolbars,
  });
})()`));

console.log(JSON.stringify(info, null, 1));
