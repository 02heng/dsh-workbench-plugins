// probe-big2.mjs — 在整页范围内找「QQ邮箱发来的超大附件」区块与其下载链接
const MID = '430:xtbBrgRupWroAmTT2QAA3P';

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
const hashMid = MID.replace(':', '%3A');
await page.evaluate(`(() => { location.hash = '#module=read.ReadModule%7C%7B%22id%22%3A%22${hashMid}%22%7D'; return true; })()`);
await page.waitForTimeout(6000);

const res = JSON.parse(await page.evaluate(`(() => {
  const out = { hit: 0, blocks: [], links: [], iframeBodies: [] };
  const all = [...document.querySelectorAll('div,td,table,span,b')];
  const cands = all.filter((e) => (e.innerText || '').includes('超大附件'));
  out.hit = cands.length;
  // 取最深的那几个节点，往上找两层容器
  for (const c of cands.slice(-3)) {
    let node = c;
    for (let i = 0; i < 3 && node.parentElement; i += 1) node = node.parentElement;
    out.blocks.push(node.outerHTML.slice(0, 2500));
  }
  for (const a of document.querySelectorAll('a')) {
    const h = String(a.href || '');
    const t = (a.innerText || '').trim();
    if (/download|cgi-bin|ftn|big/i.test(h) || /下载/.test(t)) out.links.push({ t: t.slice(0, 40), h: h.slice(0, 300), target: a.target || '', cls: a.className || '' });
  }
  for (const f of document.querySelectorAll('iframe')) out.iframeBodies.push({ id: f.id, src: String(f.src || '').slice(0, 300) });
  return JSON.stringify(out);
})()`));
console.log(JSON.stringify(res, null, 1));
