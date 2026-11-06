// probe-big7.mjs — 挂钩 fetch/XHR，点下载，抓出真实的下载 API 与返回
import fs from 'node:fs';
const URL_ = fs.readFileSync('D:/dsh-workbench/mail/126/_tmp/bigurl.txt', 'utf8').trim();

const task = await taskSpace('dsh-126-probe');
const page = task.page('p1');
await page.goto(URL_);
await page.waitForTimeout(5000);

await page.evaluate(`(() => {
  window.__calls = [];
  const rec = (o) => { try { window.__calls.push(o); } catch (e) {} };
  const of = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    const t0 = Date.now();
    const r = await of.apply(this, arguments);
    let body = '';
    try { body = (await r.clone().text()).slice(0, 1500); } catch (e) { body = '<no body>'; }
    rec({ kind: 'fetch', url: String(url).slice(0, 600), status: r.status, ms: Date.now() - t0, body });
    return r;
  };
  const oo = XMLHttpRequest.prototype.open;
  const os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    this.addEventListener('load', () => {
      let t = '';
      try { t = String(this.responseText).slice(0, 1500); } catch (e) { t = '<binary>'; }
      rec({ kind: 'xhr', method: this.__m, url: String(this.__u).slice(0, 600), status: this.status, body: t });
    });
    return os.apply(this, arguments);
  };
  return true;
})()`);

await page.evaluate(`(() => {
  const bs = [...document.querySelectorAll('div,button,span')].filter((e) => (e.innerText || '').trim() === '下载' && e.offsetParent);
  if (bs.length) bs[bs.length - 1].click();
  return true;
})()`);
await page.waitForTimeout(9000);

const calls = JSON.parse(await page.evaluate('(() => JSON.stringify(window.__calls || []))()'));
console.log(JSON.stringify(calls, null, 1));
