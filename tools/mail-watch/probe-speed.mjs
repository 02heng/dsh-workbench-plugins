import fs from 'node:fs';
import path from 'node:path';

const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");
const ck = await page.cdp('Network.getAllCookies', {});
const cookies = (ck && (ck.cookies || (ck.result && ck.result.cookies))) || [];
const cookieHeader = cookies
  .filter((c) => /(^|\.)(mail\.)?(126|163)\.com$/.test(String(c.domain || '')))
  .map((c) => `${c.name}=${c.value}`).join('; ');

const meta = JSON.parse(await page.evaluate(`(() => {
  const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
  const box = boxes[boxes.length - 1];
  const ul = box ? [...box.querySelectorAll('[id$="_ulCommonAttachItem"]')].pop() : null;
  const a = ul ? ul.querySelector('a[target="downloadFrame"]') : null;
  return JSON.stringify({ href: a ? a.href : null, name: ul ? ((ul.querySelector('.cg0') || {}).innerText || '').trim() : '' });
})()`));
console.log('name=' + meta.name);
if (!meta.href) { console.log('no href'); process.exit(0); }

const dest = 'D:/dsh-workbench/mail/126/_probe/speed-' + Date.now() + path.extname(meta.name || '.bin');
const res = await fetch(meta.href, {
  headers: {
    cookie: cookieHeader,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    referer: 'https://mail.126.com/js6/main.jsp',
    accept: '*/*',
  },
});
console.log('status=' + res.status + ' ct=' + res.headers.get('content-type') + ' len=' + res.headers.get('content-length'));
const t0 = Date.now();
const ws = fs.createWriteStream(dest);
let bytes = 0;
for await (const chunk of res.body) { bytes += chunk.length; ws.write(chunk); }
await new Promise((r) => ws.end(r));
const sec = (Date.now() - t0) / 1000;
console.log(JSON.stringify({ dest, bytes, sec: Math.round(sec * 10) / 10, MBps: Math.round((bytes / 1048576 / sec) * 100) / 100 }));
