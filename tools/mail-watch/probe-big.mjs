// probe-big.mjs — 探查 126「QQ 邮箱超大附件」邮件的下载入口
const MID = '430:xtbBrgRupWroAmTT2QAA3P';
const SUBJ = '后沙峪第二小学－智动课间';

const task = await taskSpace('dsh-126-probe');
const page = task.page('p1');
await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4500);
for (let i = 0; i < 4; i += 1) {
  const n = JSON.parse(await page.evaluate('(() => JSON.stringify({ rows: document.querySelectorAll(\'[class^="rF0"]\').length }))()')).rows;
  if (n > 0) break;
  await page.evaluate(`(() => {
    const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
    if (c.length) c[c.length - 1].click();
    return true;
  })()`);
  await page.waitForTimeout(6000);
}

// 直接按 hash 打开
const hashMid = MID.replace(':', '%3A');
await page.evaluate(`(() => { location.hash = '#module=read.ReadModule%7C%7B%22id%22%3A%22${hashMid}%22%7D'; return true; })()`);
await page.waitForTimeout(5000);

const dump = JSON.parse(await page.evaluate(`(() => {
  const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
  const box = boxes[boxes.length - 1];
  const out = { hasBox: !!box, match: false, text: '', anchors: [], iframes: [], bigNodes: [] };
  if (!box) return JSON.stringify(out);
  out.match = box.innerText.includes(${JSON.stringify(SUBJ)});
  out.text = box.innerText.replace(/\\s+/g, ' ').slice(0, 1200);
  for (const a of box.querySelectorAll('a')) {
    const t = (a.innerText || '').trim().slice(0, 60);
    if (!t && !a.href) continue;
    out.anchors.push({ text: t, href: String(a.href || '').slice(0, 400), target: a.target || '', cls: a.className || '', onclick: (a.getAttribute('onclick') || '').slice(0, 160) });
  }
  for (const f of box.querySelectorAll('iframe')) out.iframes.push({ src: String(f.src || '').slice(0, 400), id: f.id || '' });
  for (const e of box.querySelectorAll('[class*=big],[class*=Big],[id*=big],[id*=Big]')) {
    out.bigNodes.push({ tag: e.tagName, id: e.id || '', cls: String(e.className || '').slice(0, 80), html: e.outerHTML.slice(0, 500) });
  }
  return JSON.stringify(out);
})()`));

const cookies = await page.cdp('Network.getAllCookies', {});
const list = (cookies && (cookies.cookies || (cookies.result && cookies.result.cookies))) || [];
const cookieHeader = list.filter((c) => /(^|\.)(mail\.)?(126|163)\.com$/.test(String(c.domain || ''))).map((c) => `${c.name}=${c.value}`).join('; ');

console.log(JSON.stringify({ dump, cookieLen: cookieHeader.length, anchors: dump.anchors.length }, null, 1));
// 附带把超大附件区所有 a 的完整 href 打出来
for (const a of dump.anchors) {
  if (/超大|下载|big|Big|qq/i.test(a.text + ' ' + a.href)) console.log('CANDIDATE:', JSON.stringify(a));
}
