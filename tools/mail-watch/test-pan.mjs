// 自测 v2：往自己网盘根目录传 2KB 测试文件 → 建分享 → 用 pan.mjs 下载 → 取消分享并删文件
import fs from 'node:fs';
import crypto from 'node:crypto';
import { panCookieHeader, panToken, panUinfo, panList, downloadShare, PAN_UA } from './pan.mjs';

const task = await taskSpace('dsh-126-watch');
const page = task.page('p1');
try { await page.goto('https://pan.baidu.com/disk/main'); } catch {}
await page.waitForTimeout(4000);

const cl = await page.cdp('Network.getAllCookies', {});
const all = (cl && (cl.cookies || (cl.result && cl.result.cookies))) || [];
const jar = panCookieHeader(all);
const out = { steps: [] };
const H = (extra) => ({ cookie: jar, 'user-agent': PAN_UA, referer: 'https://pan.baidu.com/disk/main', ...(extra || {}) });

const tok = await panToken(jar);
const ui = await panUinfo(jar);
out.steps.push({ step: 'auth', ok: !!tok, uk: ui && ui.uk, name: ui && ui.baidu_name });

let name = `dsh-selftest-${Date.now()}.txt`;
let fsId = null;
let shareId = null;
const payload = Buffer.from('DSH pan self test ' + new Date().toISOString() + '\n', 'utf8');
const md5 = crypto.createHash('md5').update(payload).digest('hex');

try {
  // 1) precreate
  const pc = await fetch(`https://pan.baidu.com/api/precreate?channel=chunlei&web=1&app_id=250528&bdstoken=${tok}&clienttype=0`, {
    method: 'POST', headers: H({ 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }),
    body: new URLSearchParams({ path: `/${name}`, size: String(payload.length), isdir: '0', autoinit: '1', block_list: JSON.stringify([md5]), rtype: '3' }).toString(),
  });
  const pcj = await pc.json().catch(() => ({}));
  out.steps.push({ step: 'precreate', errno: pcj.errno, uploadid: (pcj.uploadid || '').slice(0, 24), return_type: pcj.return_type });
  if (pcj.errno !== 0) throw new Error(`precreate errno=${pcj.errno}`);

  // 2) upload part
  const fd = new FormData();
  fd.append('file', new Blob([payload], { type: 'text/plain' }), name);
  const up = await fetch(`https://d.pcs.baidu.com/rest/2.0/pcs/superfile2?method=upload&app_id=250528&channel=chunlei&web=1&clienttype=0&path=${encodeURIComponent('/' + name)}&uploadid=${encodeURIComponent(pcj.uploadid)}&partseq=0&type=tmpfile`, {
    method: 'POST', headers: { cookie: jar, 'user-agent': PAN_UA, referer: 'https://pan.baidu.com/disk/main' }, body: fd,
  });
  const upj = await up.json().catch(() => ({}));
  out.steps.push({ step: 'upload', errno: upj.errno, md5match: upj.md5 === md5, errmsg: upj.errmsg });
  if (upj.errno !== 0) throw new Error(`upload errno=${upj.errno} ${upj.errmsg || ''}`);

  // 3) create/commit
  const cr = await fetch(`https://pan.baidu.com/api/create?channel=chunlei&web=1&app_id=250528&bdstoken=${tok}&clienttype=0`, {
    method: 'POST', headers: H({ 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }),
    body: new URLSearchParams({ path: `/${name}`, size: String(payload.length), isdir: '0', block_list: JSON.stringify([md5]), rtype: '3', uploadid: pcj.uploadid }).toString(),
  });
  const crj = await cr.json().catch(() => ({}));
  fsId = crj.fs_id || null;
  out.steps.push({ step: 'commit', errno: crj.errno, fs_id: fsId });
  if (crj.errno !== 0) throw new Error(`commit errno=${crj.errno}`);

  // 4) 建分享
  const sh = await fetch(`https://pan.baidu.com/share/set?channel=chunlei&web=1&app_id=250528&bdstoken=${tok}&clienttype=0`, {
    method: 'POST', headers: H({ 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }),
    body: new URLSearchParams({ fid_list: JSON.stringify([String(fsId)]), pwd: 'ab12', period: '1', eflag_disable: 'true', schannel: '4', channel: '4' }).toString(),
  });
  const shj = await sh.json().catch(() => ({}));
  shareId = shj.shareid || null;
  out.steps.push({ step: 'create-share', errno: shj.errno, link: shj.link, shareid: shareId });
  if (shj.errno !== 0) throw new Error(`share errno=${shj.errno}`);

  // 5) 走完整下载链路
  const dl = await downloadShare({ link: shj.link, pwd: 'ab12', jar, destDir: 'D:/dsh-workbench/mail/126/_tmp/pan-test', prefix: 'TEST__' });
  out.steps.push({ step: 'download', ok: dl.ok, error: dl.error, files: (dl.files || []).map((x) => ({ name: x.name, ok: x.ok, bytes: x.bytes, MBps: x.MBps, sha256: (x.sha256 || '').slice(0, 10), err: x.error })) });
  out.downloadOk = !!dl.ok;
} catch (e) {
  out.steps.push({ step: 'error', message: e.message });
} finally {
  if (shareId) {
    try {
      const r = await fetch(`https://pan.baidu.com/share/cancel?channel=chunlei&web=1&app_id=250528&bdstoken=${tok}&clienttype=0`, {
        method: 'POST', headers: H({ 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }),
        body: new URLSearchParams({ shareid_list: JSON.stringify([String(shareId)]) }).toString(),
      });
      const j = await r.json().catch(() => ({}));
      out.steps.push({ step: 'cancel-share', errno: j.errno });
    } catch (e) { out.steps.push({ step: 'cancel-share', error: e.message }); }
  }
  if (fsId) {
    try {
      const fl = await fetch(`https://pan.baidu.com/api/filemanager?opera=delete&channel=chunlei&web=1&app_id=250528&bdstoken=${tok}&clienttype=0`, {
        method: 'POST', headers: H({ 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }),
        body: new URLSearchParams({ filelist: JSON.stringify([`/${name}`]), async: '0', ondup: 'fail' }).toString(),
      });
      const j = await fl.json().catch(() => ({}));
      out.steps.push({ step: 'delete-file', errno: j.errno });
    } catch (e) { out.steps.push({ step: 'delete-file', error: e.message }); }
  }
}

fs.writeFileSync('D:/dsh-workbench/mail/126/_tmp/pan-selftest.json', JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 1));
