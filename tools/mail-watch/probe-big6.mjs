// probe-big6.mjs — 点「下载」按钮，捕获 download 事件并存盘
import fs from 'node:fs';
import path from 'node:path';
const URL_ = fs.readFileSync('D:/dsh-workbench/mail/126/_tmp/bigurl.txt', 'utf8').trim();
const TMP = 'D:/dsh-workbench/mail/126/_tmp/big-dl';

const task = await taskSpace('dsh-126-probe');
const page = task.page('p1');
await page.goto(URL_);
await page.waitForTimeout(5000);

let clicked = false;
try {
  const dlPromise = page.waitForEvent('download', { timeout: 120000 });
  clicked = JSON.parse(await page.evaluate(`(() => {
    const bs = [...document.querySelectorAll('div,button,span')].filter((e) => (e.innerText || '').trim() === '下载' && e.offsetParent);
    if (!bs.length) return 'false';
    const b = bs[bs.length - 1];
    b.click();
    return 'true';
  })()`));
  const dl = await dlPromise;
  fs.mkdirSync(TMP, { recursive: true });
  const name = (typeof dl.suggestedFilename === 'function' ? dl.suggestedFilename() : dl.suggestedFilename) || 'big.zip';
  const dest = path.join(TMP, String(name).replace(/[\\/:*?"<>|]/g, '_'));
  await dl.saveAs(dest);
  console.log(JSON.stringify({ clicked, name, dest, bytes: fs.existsSync(dest) ? fs.statSync(dest).size : 0 }, null, 1));
} catch (e) {
  // 失败时把页面上的下载相关资源列出来，便于找真实 URL
  const res = JSON.parse(await page.evaluate(`(() => {
    const r = performance.getEntriesByType('resource').map((x) => x.name).filter((u) => /download|ftn|file|exs/i.test(u));
    return JSON.stringify({ resources: [...new Set(r)].slice(0, 20), url: location.href });
  })()`));
  console.log(JSON.stringify({ clicked, error: String(e).slice(0, 300), ...res }, null, 1));
}
