import fs from 'node:fs';
import path from 'node:path';

const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");

const meta = JSON.parse(
  await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
    const box = boxes[boxes.length - 1];
    const ul = box ? [...box.querySelectorAll('[id$="_ulCommonAttachItem"]')].pop() : null;
    const a = ul ? ul.querySelector('a[target="downloadFrame"]') : null;
    return JSON.stringify({
      href: a ? a.href : null,
      name: ul ? ((ul.querySelector('.cg0') || {}).innerText || '').trim() : '',
      cookie: document.cookie
    });
  })()`),
);
console.log('href=' + (meta.href || 'null'));
console.log('name=' + meta.name);
console.log('cookieLen=' + meta.cookie.length);

if (!meta.href) process.exit(3);

const outDir = 'D:/dsh-workbench/mail/126/_probe';
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, 'direct-' + Date.now() + path.extname(meta.name || '.bin'));

const t0 = Date.now();
const res = await fetch(meta.href, {
  headers: { cookie: meta.cookie, 'user-agent': 'Mozilla/5.0', referer: 'https://mail.126.com/' },
});
console.log('status=' + res.status + ' type=' + res.headers.get('content-type') + ' len=' + res.headers.get('content-length'));

const ws = fs.createWriteStream(dest);
let bytes = 0;
for await (const chunk of res.body) {
  bytes += chunk.length;
  ws.write(chunk);
}
await new Promise((r) => ws.end(r));
const sec = (Date.now() - t0) / 1000;
console.log(JSON.stringify({ dest, bytes, sec: Math.round(sec * 10) / 10, MBps: Math.round((bytes / 1048576 / sec) * 100) / 100 }));
