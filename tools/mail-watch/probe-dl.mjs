// probe-dl.mjs — 下载指定 mid 的附件到指定目录（绕开 collect.mjs 的判重，用于补收漏掉的附件）
// 用法：ego-browser.exe nodejs -e "await import('file:///D:/dsh-workbench/mail-watch/probe-dl.mjs')"
// 环境：PROBE_MID / PROBE_PREFIX / PROBE_DEST
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MID = process.env.PROBE_MID || '403:xS2Bkw-lHWrsFC9hWwAA3j';
const PREFIX = process.env.PROBE_PREFIX || 'KOBE__';
const DEST = process.env.PROBE_DEST || 'E:/桌面/办公文件/办公文档/2026年/10月/课件15分钟/01_学校回交案例';

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

const items = JSON.parse(await page.evaluate(`(() => {
  const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
  const box = boxes[boxes.length - 1];
  if (!box) return JSON.stringify([]);
  const uls = [...box.querySelectorAll('[id$="_ulCommonAttachItem"]')];
  const ul = uls[uls.length - 1];
  const out = [];
  if (ul) {
    for (const li of ul.querySelectorAll('li')) {
      const a = li.querySelector('a[target="downloadFrame"]');
      if (!a) continue;
      const t = ((li.querySelector('.cg0') || {}).innerText || li.innerText || '').trim();
      out.push({ name: t.split('\\n')[0].trim(), href: a.href });
    }
  }
  return JSON.stringify(out);
})()`));

const cookieList = await page.cdp('Network.getAllCookies', {});
const cookiesAll = (cookieList && (cookieList.cookies || (cookieList.result && cookieList.result.cookies))) || [];
const cookieHeader = cookiesAll
  .filter((c) => /(^|\.)(mail\.)?(126|163)\.com$/.test(String(c.domain || '')))
  .map((c) => `${c.name}=${c.value}`).join('; ');

const sanitize = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 110) || 'unnamed';
const uniqueTarget = (dir, name) => {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let p = path.join(dir, name);
  let n = 2;
  while (fs.existsSync(p)) { p = path.join(dir, `${base} (${n})${ext}`); n += 1; if (n > 200) break; }
  return p;
};

fs.mkdirSync(DEST, { recursive: true });
const saved = [];
for (const it of items) {
  const fileName = `${PREFIX}${sanitize(it.name)}`;
  const res = await fetch(it.href, {
    headers: {
      cookie: cookieHeader,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      referer: 'https://mail.126.com/js6/main.jsp',
      accept: '*/*',
    },
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || /text\/html/i.test(ct)) {
    saved.push({ name: it.name, ok: false, error: `status=${res.status} ct=${ct}` });
    continue;
  }
  const target = uniqueTarget(DEST, fileName);
  const tmp = target + '.part';
  const hash = crypto.createHash('sha256');
  const ws = fs.createWriteStream(tmp);
  let bytes = 0;
  for await (const chunk of res.body) {
    bytes += chunk.length;
    hash.update(chunk);
    if (!ws.write(chunk)) await new Promise((r) => ws.once('drain', r));
  }
  await new Promise((r) => ws.end(r));
  fs.renameSync(tmp, target);
  saved.push({ name: it.name, ok: bytes > 0, path: target, bytes, mb: Math.round(bytes / 1048576 * 10) / 10, sha256: hash.digest('hex') });
}

console.log(JSON.stringify({ mid: MID, attachments: items.length, saved }, null, 2));
