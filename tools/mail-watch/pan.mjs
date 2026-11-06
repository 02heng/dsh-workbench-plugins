// 百度网盘分享链接下载（复用 ego 浏览器里的百度登录态 cookie）
// 关键接口：share/verify（提取码）→ 分享页 yunData 取 shareid/uk/sign/timestamp
//           share/list 列文件 → api/sharedownload 换 dlink → CDN 流式下载
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function panCookieHeader(cookiesAll) {
  return cookiesAll
    .filter((c) => /(^|\.)baidu\.com$/.test(String(c.domain || '')))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

function hdrs(jar, extra) {
  return {
    cookie: jar,
    'user-agent': PAN_UA,
    'accept-language': 'zh-CN,zh;q=0.9',
    referer: 'https://pan.baidu.com/disk/main',
    ...(extra || {}),
  };
}

export async function panToken(jar) {
  const r = await fetch('https://pan.baidu.com/api/gettemplatevariable?clienttype=0&app_id=250528&web=1&channel=chunlei&fields=%5B%22bdstoken%22%5D', { headers: hdrs(jar) });
  const j = await r.json().catch(() => ({}));
  return (j && j.result && j.result.bdstoken) || '';
}

export async function panUinfo(jar) {
  const r = await fetch('https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo&app_id=250528&web=1', { headers: hdrs(jar) });
  return r.json().catch(() => null);
}

export async function panList(jar, dir = '/') {
  const tok = await panToken(jar);
  const url = `https://pan.baidu.com/api/list?order=name&desc=0&showempty=0&web=1&page=1&num=100&dir=${encodeURIComponent(dir)}&t=${Date.now()}&channel=chunlei&app_id=250528&bdstoken=${tok}&clienttype=0`;
  const r = await fetch(url, { headers: hdrs(jar, { referer: `https://pan.baidu.com/disk/main#/index?category=all&path=${encodeURIComponent(dir)}` }) });
  const j = await r.json().catch(() => ({}));
  return (j && j.list) || [];
}

// 从邮件正文里抓出来的分享串：https://pan.baidu.com/s/1ABC...  或 /share/init?surl=abc
export function parsePanLink(raw, surroundingText = '') {
  const text = String(raw || '');
  let m = /pan\.baidu\.com\/s\/([0-9A-Za-z_-]+)/.exec(text);
  let surl = m ? m[1] : '';
  if (!surl) {
    m = /pan\.baidu\.com\/share\/init\?surl=([0-9A-Za-z_-]+)/.exec(text);
    if (m) surl = m[1];
  }
  if (!surl) return null;
  let pwd = '';
  const pm = /[?&]pwd=([0-9A-Za-z]{4})/.exec(text);
  if (pm) pwd = pm[1];
  if (!pwd && surroundingText) {
    const tm = /(?:提取码|访问码|密码|提取密码)\s*[:：=]?\s*([0-9A-Za-z]{4})/.exec(surroundingText);
    if (tm) pwd = tm[1];
  }
  return { surl, pwd, url: `https://pan.baidu.com/s/${surl}${pwd ? `?pwd=${pwd}` : ''}` };
}

async function fetchText(url, jar, extra) {
  const r = await fetch(url, { headers: hdrs(jar, extra), redirect: 'follow' });
  return { status: r.status, text: await r.text(), url: r.url, cookies: r.headers.getSetCookie ? r.headers.getSetCookie() : [] };
}

// 分享页里 yunData.setData({...}) 拿 shareid / uk / sign / timestamp / 文件列表
function parseYunData(html) {
  const idx = html.indexOf('yunData.setData');
  const raw = idx >= 0 ? html.slice(idx, idx + 200000) : html;
  const grab = (re) => { const m = re.exec(raw); return m ? m[1] : ''; };
  const out = {
    shareid: grab(/"shareid"\s*:\s*(\d+)/),
    uk: grab(/"share_uk"\s*:\s*"?(\d+)/) || grab(/"uk"\s*:\s*"?(\d+)/),
    sign: grab(/"sign"\s*:\s*"([^"]+)"/),
    timestamp: grab(/"timestamp"\s*:\s*(\d+)/),
    needPwd: /请输入提取码|输入提取码|verify/.test(html) && !/"shareid"\s*:\s*\d+/.test(html),
  };
  const fm = /"file_list"\s*:\s*(\[[\s\S]*?\])\s*,\s*"a|"file_list"\s*:\s*(\[[\s\S]*?\])\s*\}/.exec(raw);
  try {
    const arr = JSON.parse(fm ? (fm[1] || fm[2]) : '[]');
    out.files = arr.map((f) => ({ fs_id: f.fs_id, name: f.server_filename, size: f.size, isdir: !!f.isdir }));
  } catch { out.files = []; }
  return out;
}

async function verifyPwd(surl, pwd, jar, referer) {
  const ts = Date.now();
  const body = new URLSearchParams({ pwd, vcode: '', vcode_str: '' });
  const r = await fetch(`https://pan.baidu.com/share/verify?surl=${encodeURIComponent(surl)}&t=${ts}&channel=chunlei&web=1&app_id=250528&clienttype=0`, {
    method: 'POST',
    headers: hdrs(jar, { referer, 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }),
    body: body.toString(),
  });
  const j = await r.json().catch(() => ({}));
  const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  const bdclnd = setCookies.map((c) => /^BDCLND=([^;]+)/.exec(c)).filter(Boolean).map((m) => m[1])[0] || j.randsk || '';
  return { errno: j.errno, bdclnd, raw: j };
}

export async function resolveShare(link, pwd, jar) {
  const parsed = typeof link === 'string' ? parsePanLink(link, '') : link;
  if (!parsed) return { ok: false, error: 'not a pan link' };
  const pwdTry = pwd || parsed.pwd;
  let page = await fetchText(parsed.url, jar, { referer: 'https://pan.baidu.com/' });
  let yd = parseYunData(page.text);

  if (!yd.shareid && pwdTry) {
    const v = await verifyPwd(parsed.surl, pwdTry, jar, parsed.url);
    if (v.errno === 0 && v.bdclnd) {
      jar = `${jar}; BDCLND=${v.bdclnd}`;
      page = await fetchText(parsed.url, jar, { referer: parsed.url });
      yd = parseYunData(page.text);
    } else if (v.errno !== 0) {
      return { ok: false, error: `提取码校验失败 errno=${v.errno}`, needPwd: true };
    }
  }
  if (!yd.shareid) return { ok: false, error: '分享页未拿到 shareid（可能已失效或需要验证码）', needPwd: !pwdTry, html: page.text.slice(0, 600) };
  return { ok: true, jar, share: yd, shareUrl: parsed.url, surl: parsed.surl };
}

export async function listShareDir(jar, share, dir = '/') {
  const tok = await panToken(jar);
  const url = `https://pan.baidu.com/share/list?uk=${share.uk}&shareid=${share.shareid}&order=other&desc=1&showempty=0&web=1&page=1&num=100&dir=${encodeURIComponent(dir)}&t=${Date.now()}&channel=chunlei&app_id=250528&bdstoken=${tok}&clienttype=0`;
  const r = await fetch(url, { headers: hdrs(jar, { referer: `https://pan.baidu.com/s/${share.surl || ''}` }) });
  const j = await r.json().catch(() => ({}));
  const list = (j && j.list) || [];
  return list.map((f) => ({ fs_id: f.fs_id, name: f.server_filename, size: f.size, isdir: !!f.isdir, path: f.path }));
}

export async function shareDlink(jar, share, fsId, shareUrl) {
  const body = new URLSearchParams({
    encrypt: '0',
    product: 'share',
    uk: String(share.uk),
    primaryid: String(share.shareid),
    fid_list: JSON.stringify([String(fsId)]),
  });
  const url = `https://pan.baidu.com/api/sharedownload?sign=${encodeURIComponent(share.sign)}&timestamp=${share.timestamp}&channel=chunlei&web=1&app_id=250528&clienttype=0`;
  const r = await fetch(url, { method: 'POST', headers: hdrs(jar, { referer: shareUrl, 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }), body: body.toString() });
  const j = await r.json().catch(() => ({}));
  if (j && j.errno === 0 && j.list && j.list[0] && j.list[0].dlink) return { ok: true, dlink: j.list[0].dlink, name: j.list[0].server_filename, size: j.list[0].size };
  return { ok: false, error: `sharedownload errno=${j && j.errno} ${(j && (j.errmsg || j.show_msg)) || ''}`.trim(), raw: j };
}

export async function streamToFile(url, destDir, fileName, jar, referer) {
  const res = await fetch(url, { headers: { cookie: jar, 'user-agent': PAN_UA, referer: referer || 'https://pan.baidu.com/disk/main' }, redirect: 'follow' });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || /text\/html|application\/json/i.test(ct)) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `status=${res.status} ct=${ct} ${t.slice(0, 160)}` };
  }
  fs.mkdirSync(destDir, { recursive: true });
  let target = path.join(destDir, fileName);
  if (fs.existsSync(target)) {
    const ext = path.extname(target);
    const base = target.slice(0, target.length - ext.length);
    let i = 2;
    while (fs.existsSync(`${base} (${i})${ext}`)) i += 1;
    target = `${base} (${i})${ext}`;
  }
  const tmp = target + '.part';
  const hash = crypto.createHash('sha256');
  const ws = fs.createWriteStream(tmp);
  let bytes = 0;
  const t0 = Date.now();
  for await (const chunk of res.body) {
    bytes += chunk.length;
    hash.update(chunk);
    if (!ws.write(chunk)) await new Promise((r) => ws.once('drain', r));
  }
  await new Promise((r) => ws.end(r));
  const sec = Math.max(0.001, (Date.now() - t0) / 1000);
  fs.renameSync(tmp, target);
  return { ok: true, file: target, bytes, sha256: hash.digest('hex'), MBps: Math.round((bytes / 1048576 / sec) * 100) / 100 };
}

// 下载一个分享链接（文件或文件夹，最多 maxFiles 个文件、可限总量）
export async function downloadShare({ link, pwd, jar, destDir, prefix = '', shareUrl = '', maxFiles = 30 }) {
  const rs = await resolveShare(link, pwd, jar);
  if (!rs.ok) return rs;
  const share = rs.share;
  const jar2 = rs.jar;
  const files = [];
  const walk = async (dir, depth) => {
    if (depth > 3) return;
    const list = share.files && dir === '/' && share.files.length
      ? share.files
      : await listShareDir(jar2, share, dir);
    for (const f of list) {
      if (f.isdir) { await walk(f.path || `${dir}${f.name}/`, depth + 1); continue; }
      files.push(f);
    }
  };
  await walk('/', 0);
  if (!files.length) return { ok: false, error: '分享里没有可下载的文件' };
  const got = [];
  for (const f of files.slice(0, maxFiles)) {
    const dl = await shareDlink(jar2, share, f.fs_id, shareUrl || rs.shareUrl);
    if (!dl.ok) { got.push({ name: f.name, ok: false, error: dl.error }); continue; }
    const out = await streamToFile(dl.dlink, destDir, `${prefix}${f.name}`, jar2, shareUrl || rs.shareUrl);
    got.push({ name: f.name, ...out, via: 'baidu-pan' });
  }
  return { ok: got.some((g) => g.ok), dir: destDir, files: got, jar: jar2 };
}
