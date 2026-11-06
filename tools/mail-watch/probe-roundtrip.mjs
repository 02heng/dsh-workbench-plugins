// probe-roundtrip.mjs — 端到端验证「标已读」：先手动把一封标成未读，再跑 markReadBatch 逻辑看它能不能标回已读
const task = await taskSpace('dsh-126-watch');
const page = task.page('p1');

const listReady = async () => {
  for (let i = 0; i < 5; i += 1) {
    const n = JSON.parse(await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class^="rF0"]').length }))()`)).rows;
    if (n > 0) return true;
    await page.evaluate(`(() => {
      const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
      if (c.length) c[c.length - 1].click();
      return true;
    })()`);
    await page.waitForTimeout(6000);
  }
  return false;
};

const unreadMap = async (mids) => JSON.parse(await page.evaluate(`(() => {
  const want = new Set(${JSON.stringify(mids)});
  const out = {};
  for (const r of document.querySelectorAll('[class^="rF0"]')) {
    const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
    if (!m) continue;
    const mid = m[1] + ':' + m[2];
    if (!want.has(mid)) continue;
    out[mid] = !!r.querySelector('.nui-ico-unread');
  }
  return JSON.stringify(out);
})()`));

const pickRows = async (mids) => JSON.parse(await page.evaluate(`(() => {
  const want = new Set(${JSON.stringify(mids)});
  const hit = [];
  for (const r of document.querySelectorAll('[class^="rF0"]')) {
    const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
    if (!m) continue;
    const mid = m[1] + ':' + m[2];
    if (!want.has(mid)) continue;
    const cb = r.querySelector('input[type=checkbox]') || r.querySelector('.nui-checkbox') || r.querySelector('[class*="checkbox"]');
    if (cb) { cb.click(); hit.push(mid); }
  }
  return JSON.stringify(hit);
})()`));

const markAs = async (label) => {
  const dd = JSON.parse(await page.evaluate(`(() => {
    const btns = [...document.querySelectorAll('.nui-dropdownBtn, [id^="_mail_button_"], .js-component-button')]
      .filter((e) => e.offsetParent && /标记为/.test((e.innerText || '').trim()));
    if (!btns.length) return JSON.stringify({ ok: false });
    btns[0].click();
    return JSON.stringify({ ok: true });
  })()`));
  if (!dd.ok) return { ok: false, err: 'no dropdown' };
  await page.waitForTimeout(900);
  const hit = JSON.parse(await page.evaluate(`(() => {
    const items = [...document.querySelectorAll('.nui-menu-item, [class*="menu"] li, [class*="MenuItem"], [class*="menuitem"]')].filter((e) => e.offsetParent);
    const want = items.filter((e) => /^(标记为)?${label}$/.test((e.innerText || '').trim()));
    if (!want.length) return JSON.stringify({ ok: false });
    want[0].click();
    return JSON.stringify({ ok: true });
  })()`));
  await page.waitForTimeout(2200);
  return hit;
};

await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4500);
if (!(await listReady())) { console.log('list not ready'); process.exit(0); }

const mids = JSON.parse(await page.evaluate(`(() => {
  const out = [];
  for (const r of document.querySelectorAll('[class^="rF0"]')) {
    const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
    if (m) out.push(m[1] + ':' + m[2]);
    if (out.length >= 3) break;
  }
  return JSON.stringify(out);
})()`));
const mid = mids[1] || mids[0];
console.log('测试邮件 mid:', mid);

// ① 先标成未读（制造测试条件），然后刷新列表确认真的变成未读
await pickRows([mid]);
const toUnread = await markAs('未读');
await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(5000);
await listReady();
const afterUnread = await unreadMap([mid]);
console.log('标未读:', JSON.stringify(toUnread), '→ 刷新后:', JSON.stringify(afterUnread));
if (afterUnread[mid] !== true) { console.log('⚠️ 没能造出未读状态，测试中止（邮件保持原状）'); process.exit(0); }

// 返回列表（标已读流程的第一步）
await page.evaluate(`(() => { try { location.hash = '#module=main'; } catch (e) {} return true; })()`);
await page.waitForTimeout(2500);
await listReady();

// ② 跑和 collect.mjs 里一样的流程
const before = await unreadMap([mid]);
const todo = [mid].filter((m) => before[m] !== false);
const picked = await pickRows(todo);
const mk = await markAs('已读');
const final = await unreadMap([mid]);
console.log('before:', JSON.stringify(before), 'picked:', JSON.stringify(picked), 'mark:', JSON.stringify(mk), 'final:', JSON.stringify(final));
console.log(final[mid] === false ? '✅ 端到端通过：未读 → 标已读 生效' : '❌ 仍未读，链路需修');
