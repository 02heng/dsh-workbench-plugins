// probe-big5.mjs — 打开 QQ 超大附件分享页，看页面结构与下载入口
import fs from 'node:fs';
const URL_ = fs.readFileSync('D:/dsh-workbench/mail/126/_tmp/bigurl.txt', 'utf8').trim();

const task = await taskSpace('dsh-126-probe');
const page = task.page('p1');
await page.goto(URL_);
await page.waitForTimeout(6000);

const dump = JSON.parse(await page.evaluate(`(() => {
  const out = { url: location.href, title: document.title, text: '', anchors: [], buttons: [], inputs: [] };
  out.text = (document.body.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 1200);
  for (const a of document.querySelectorAll('a')) {
    const t = (a.innerText || '').trim();
    if (!t && !a.href) continue;
    out.anchors.push({ t: t.slice(0, 50), h: String(a.href || '').slice(0, 200) });
  }
  for (const b of document.querySelectorAll('button,[role=button],[class*=btn],[class*=Btn]')) out.buttons.push({ tag: b.tagName, t: (b.innerText || '').trim().slice(0, 40), cls: String(b.className || '').slice(0, 60), id: b.id || '' });
  for (const i of document.querySelectorAll('input')) out.inputs.push({ type: i.type, id: i.id || '', name: i.name || '', value: (i.value || '').slice(0, 40) });
  return JSON.stringify(out);
})()`));
console.log(JSON.stringify(dump, null, 1));
