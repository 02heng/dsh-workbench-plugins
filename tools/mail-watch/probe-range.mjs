const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");

const out = JSON.parse(
  await page.evaluate(`(async () => {
    const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
    const box = boxes[boxes.length - 1];
    const ul = box ? [...box.querySelectorAll('[id$="_ulCommonAttachItem"]')].pop() : null;
    const a = ul ? ul.querySelector('a[target="downloadFrame"]') : null;
    if (!a) return JSON.stringify({ error: 'no attachment anchor' });
    const href = a.href;
    const name = (ul.querySelector('.cg0') || {}).innerText || '';
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(href, { credentials: 'include', headers: { Range: 'bytes=0-499999' } });
    } catch (e) {
      return JSON.stringify({ href, name, error: String(e) });
    }
    const buf = await res.arrayBuffer();
    const ms = performance.now() - t0;
    return JSON.stringify({
      name,
      status: res.status,
      contentRange: res.headers.get('content-range'),
      contentLength: res.headers.get('content-length'),
      acceptRanges: res.headers.get('accept-ranges'),
      gotBytes: buf.byteLength,
      kbps: Math.round(buf.byteLength / 1024 / (ms / 1000)),
      ms: Math.round(ms)
    });
  })()`),
);
console.log(JSON.stringify(out, null, 2));
