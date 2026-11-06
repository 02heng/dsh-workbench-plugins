// probe-attach.mjs — 只看某一封邮件的附件清单（名称/大小/下载链接），不下载
// 用法：ego-browser.exe nodejs -e "await import('file:///D:/dsh-workbench/mail-watch/probe-attach.mjs')"
const MID = process.env.PROBE_MID || '403:xS2Bkw-lHWrsFC9hWwAA3j';
const SUBJ = process.env.PROBE_SUBJECT || '后沙峪第二小学－AI赋能益智游戏-课间一刻钟AI应用案例';

const task = await taskSpace('dsh-126-watch');
const page = task.page('p1');

await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4500);
for (let i = 0; i < 4; i += 1) {
  const n = JSON.parse(await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class^="rF0"]').length }))()`)).rows;
  if (n > 0) break;
  await page.waitForTimeout(4000);
}

const hashMid = MID.replace(':', '%3A');
await page.evaluate(`(() => { location.hash = '#module=read.ReadModule%7C%7B%22id%22%3A%22${hashMid}%22%7D'; return true; })()`);
await page.waitForTimeout(4000);

const info = JSON.parse(await page.evaluate(`(() => {
  const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
  const box = boxes[boxes.length - 1];
  if (!box) return JSON.stringify({ ok: false, reason: 'read module not found' });
  const head = (box.innerText || '').split('\\n').filter(Boolean).slice(0, 6);
  const uls = [...box.querySelectorAll('[id$="_ulCommonAttachItem"]')];
  const ul = uls[uls.length - 1];
  const items = [];
  if (ul) {
    for (const li of ul.querySelectorAll('li')) {
      const a = li.querySelector('a[target="downloadFrame"]');
      if (!a) continue;
      const t = ((li.querySelector('.cg0') || {}).innerText || li.innerText || '').trim();
      items.push({ name: t.split('\\n')[0].trim(), raw: t.replace(/\\s+/g, ' ').slice(0, 120), href: a.href });
    }
  }
  return JSON.stringify({ ok: true, subjectMatch: box.innerText.includes(${JSON.stringify(SUBJ.slice(0, 8))}), head: head, attachments: items, hasBigAttachPanel: !!box.querySelector('[class*="bigatt"], [class*="AttachBig"], [id*="bigAttach"]') });
})()`));

console.log(JSON.stringify(info, null, 2));
