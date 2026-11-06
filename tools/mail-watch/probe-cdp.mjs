const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");
const r = await page.cdp('Network.getAllCookies', {});
const list = (r && (r.cookies || (r.result && r.result.cookies))) || [];
const mine = list.filter((c) => /126\.com|163\.com/.test(String(c.domain || '')));
console.log('total=' + list.length + ' mine=' + mine.length);
console.log(JSON.stringify(mine.map((c) => ({ n: c.name, d: c.domain, h: !!c.httpOnly }))));
const cookieHeader = mine.map((c) => c.name + '=' + c.value).join('; ');
console.log('cookieHeaderLen=' + cookieHeader.length);

// 用完整 cookie 直连下载试试
const meta = JSON.parse(
  await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
    const box = boxes[boxes.length - 1];
    const ul = box ? [...box.querySelectorAll('[id$="_ulCommonAttachItem"]')].pop() : null;
    const a = ul ? ul.querySelector('a[target="downloadFrame"]') : null;
    return JSON.stringify({ href: a ? a.href : null });
  })()`),
);
if (!meta.href) {
  console.log('no href');
  process.exit(0);
}
const res = await fetch(meta.href, {
  headers: {
    cookie: cookieHeader,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    referer: 'https://mail.126.com/js6/main.jsp',
    accept: '*/*',
  },
});
console.log('status=' + res.status + ' ct=' + res.headers.get('content-type') + ' len=' + res.headers.get('content-length') + ' cd=' + res.headers.get('content-disposition'));
