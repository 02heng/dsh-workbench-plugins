// collect.mjs — 126 邮箱附件收集（一次性执行，跑完退出，不做常驻循环）
//   默认模式 unread  ：只处理「未读 且 未收过」的邮件
//   补采模式 --backfill：按 mailbox.json 里 20 封邮件逐封核对本地是否已有落盘文件，缺什么补什么
// 加速：Node 侧直连 + 流式落盘（不再走浏览器 base64 中转，实测 16MB/s 级）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { panCookieHeader, parsePanLink, downloadShare } from './pan.mjs';

const ROOT = 'D:/dsh-workbench/mail/126';
const STATE_PATH = path.join(ROOT, 'state.json');
const INDEX_PATH = path.join(ROOT, 'hash-index.json');
const RULES_PATH = 'D:/dsh-workbench/mail-watch/rules.json';
const LEDGER_PATH = path.join(ROOT, 'ledger-raw.jsonl');
const LAST_RUN = path.join(ROOT, 'last-run.json');
const MAILBOX = path.join(ROOT, 'mailbox.json');
const TMP_DIR = path.join(ROOT, '_tmp');

// ego 内嵌 node 不继承自定义环境变量/参数，所以模式也可以写在 flag 文件里（backfill 一次性回归用）
const MODE_FILE = path.join(ROOT, 'collect-mode.txt');
const modeFlag = (() => { try { return fs.readFileSync(MODE_FILE, 'utf8').trim(); } catch { return ''; } })();
const BACKFILL = process.argv.includes('--backfill') || process.env.COLLECT_BACKFILL === '1' || modeFlag === 'backfill';
// 只收某一类材料（用户 2026-11-04 要求：只监听千问）。ego 内嵌 node 不继承自定义环境变量，所以同样用 flag 文件。
// 文件写分类 id（如 qianwen）即只处理该类邮件；文件不存在或为空＝按全量规则处理。
const ONLY_FILE = path.join(ROOT, 'route-only.txt');
const ROUTE_ONLY = (() => { try { return fs.readFileSync(ONLY_FILE, 'utf8').trim(); } catch { return ''; } })();
const MAX_MAILS = BACKFILL ? 40 : 10;
const DEADLINE_MS = 10 * 60 * 1000;
const T0 = Date.now();

const SEARCH_DIRS = [
  'E:/桌面/办公文件/办公文档/2026年/10月/课件15分钟',
  'E:/桌面/办公文件/办公文档/2026年/10月/千问账号发送',
  'E:/桌面/办公文件/办公文档/2026年/10月/创想微造实践/材料',
  path.join(ROOT, '待确认'),
];

const load = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const save = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2), 'utf8');
const state = load(STATE_PATH, { seen: {}, pending: {} });
if (!state.seen) state.seen = {};
if (!state.pending) state.pending = {};
const index = load(INDEX_PATH, { files: {} });
const rules = load(RULES_PATH, { rules: [], confirmKeywords: [], unknownDir: path.join(ROOT, '待确认') });
fs.mkdirSync(TMP_DIR, { recursive: true });

const sanitize = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 110) || 'unnamed';

const walk = (dir, base = dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push({ path: p, rel: path.relative(base, p), size: fs.statSync(p).size });
  }
  return out;
};
const localNames = SEARCH_DIRS.flatMap((d) => walk(d).map((f) => f.rel));

// 判定顺序（用户要求：先看邮件名，再看附件名，再定目录）：
// ①附件名 strongKeywords（最可靠，防止「课间一刻钟附件1 联系人信息表」被「信息表」抢走）
// ②主题 strongKeywords  ③confirmKeywords→待确认  ④附件名 keywords  ⑤主题 keywords
function route(subject, fileName) {
  const cat = (rules.categories || rules.rules || []).slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const sub = String(subject || '').toLowerCase();
  const nam = String(fileName || '').toLowerCase();
  const hit = (hay, kws) => {
    for (const kw of kws || []) if (kw && hay.includes(String(kw).toLowerCase())) return kw;
    return null;
  };
  const pass = (label) => (r, kw) => ({ dir: r.dir, bucket: r.id || r.name, keyword: kw, basis: label });
  // 已截止活动（如创想微造）：命中就直接进归档目录，不再当待确认、不进汇总表
  const expired = (rules.expired || []);
  const tiers = [
    [nam, 'strongKeywords', '附件名-强'],
    [sub, 'strongKeywords', '主题-强'],
  ];
  for (const [hay, , label] of tiers) {
    for (const r of expired) { const kw = hit(hay, r.strongKeywords); if (kw) return { dir: r.dir, bucket: 'archived', keyword: kw, basis: '已截止-强' }; }
  }
  for (const [hay, label] of [[nam, '附件名'], [sub, '主题']]) {
    for (const r of expired) { const kw = hit(hay, r.keywords); if (kw) return { dir: r.dir, bucket: 'archived', keyword: kw, basis: `已截止-${label}` }; }
  }
  for (const [hay, field, label] of tiers) {
    for (const r of cat) { const kw = hit(hay, r[field]); if (kw) return pass(label)(r, kw); }
  }
  const kwc = hit(sub + ' ' + nam, rules.confirmKeywords);
  if (kwc) return { dir: rules.unknownDir, bucket: 'confirm', keyword: kwc, basis: '需人工确认' };
  for (const [hay, label] of [[nam, '附件名'], [sub, '主题']]) {
    for (const r of cat) { const kw = hit(hay, r.keywords); if (kw) return pass(label)(r, kw); }
  }
  return { dir: rules.unknownDir, bucket: 'confirm', keyword: null, basis: '未匹配' };
}

function uniqueTarget(dir, fileName) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let p = path.join(dir, fileName);
  let n = 2;
  while (fs.existsSync(p)) { p = path.join(dir, `${base} (${n})${ext}`); n += 1; if (n > 200) break; }
  return p;
}

const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");
const result = { mode: BACKFILL ? 'backfill' : 'unread', startedAt: new Date().toISOString(), checked: 0, downloads: [], duplicates: [], needsConfirm: [], archived: [], skipped: [], errors: [], aborted: null };

function pushItem(item) {
  if (item.bucket === 'confirm') result.needsConfirm.push(item);
  else if (item.bucket === 'archived') result.archived.push(item);
  else result.downloads.push(item);
}

await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4500);
for (let i = 0; i < 4; i += 1) {
  const n = JSON.parse(await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class^="rF0"]').length }))()`)).rows;
  if (n > 0) break;
  await page.evaluate(`(() => {
    const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
    if (c.length) c[c.length - 1].click();
    return true;
  })()`);
  await page.waitForTimeout(6000);
}

const rows = JSON.parse(await page.evaluate(`(() => {
  const out = [];
  for (const r of document.querySelectorAll('[class^="rF0"]')) {
    const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
    if (!m) continue;
    const label = r.getAttribute('aria-label') || '';
    const fm = /发件人\\s*[：:]\\s*([^\\s]+)/.exec(label);
    const tm = /时间\\s*[：:]\\s*(.+)$/.exec(label);
    out.push({ mid: m[1] + ':' + m[2], subject: (label.split(' 发件人')[0] || '').trim(), from: fm ? fm[1] : '', time: tm ? tm[1].trim() : '', unread: !!r.querySelector('.nui-ico-unread') });
  }
  return JSON.stringify(out);
})()`));
fs.writeFileSync(MAILBOX, JSON.stringify(rows, null, 2), 'utf8');

// 兜底：pending 里上次没跑完的
const pendingRows = Object.entries(state.pending).map(([mid, v]) => ({ mid, subject: v.subject, from: v.from, time: v.time, unread: true }));

let candidates;
if (BACKFILL) {
  const merged = [...pendingRows, ...rows];
  const rawDone = new Set();
  try {
    for (const line of fs.readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(Boolean)) {
      const rec = JSON.parse(line);
      if (rec.attachments && rec.attachments.length) rawDone.add(rec.mid);
    }
  } catch {}
  candidates = merged.filter((r) => {
    if (!r.from) return true;
    if (!rawDone.has(r.mid)) return true; // 这封邮件还没被采集过（同一发件人可能有多封）
    return !localNames.some((n) => path.basename(n).startsWith(r.from + '__'));
  }).slice(0, MAX_MAILS);
} else {
  // 用户 2026-11-06 指出：他在网页上自己点开过的邮件会变成「已读」，旧逻辑只收「未读」邮件，
  // 于是这类邮件被永久漏收（KOBE 11-05「AI赋能益智游戏」就因此没下到附件）。
  // 改为：近 10 天内、尚未采集过的邮件都收，已读与否不再作为过滤条件；去重仍靠 state.seen + sha256。
  const mailDay = (t) => {
    const m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(String(t || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
  };
  const now = Date.now();
  const RECENT_MS = 10 * 24 * 3600 * 1000;
  candidates = [
    ...pendingRows,
    ...rows.filter((r) => {
      if (state.seen[r.mid]) return false;
      const d = mailDay(r.time);
      return d === 0 || now - d <= RECENT_MS;
    }),
  ].slice(0, MAX_MAILS);
}

// 以前处理过、但现在仍显未读的老邮件：只标已读，绝不再打开重读
const seenUnread = BACKFILL ? [] : rows.filter((r) => r.unread && state.seen[r.mid]).map((r) => ({ mid: r.mid, subject: r.subject, backfill: true }));

const cookieList = await page.cdp('Network.getAllCookies', {});
const cookiesAll = (cookieList && (cookieList.cookies || (cookieList.result && cookieList.result.cookies))) || [];
const cookieHeader = cookiesAll
  .filter((c) => /(^|\.)(mail\.)?(126|163)\.com$/.test(String(c.domain || '')))
  .map((c) => `${c.name}=${c.value}`).join('; ');

async function openByMid(mid, subject) {
  const hashMid = mid.replace(':', '%3A');
  await page.evaluate(`(() => { location.hash = '#module=read.ReadModule%7C%7B%22id%22%3A%22${hashMid}%22%7D'; return true; })()`);
  for (let i = 0; i < 3; i += 1) {
    await page.waitForTimeout(3200);
    const st = JSON.parse(await page.evaluate(`(() => {
      const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
      const box = boxes[boxes.length - 1];
      return JSON.stringify({ has: !!box, match: box ? box.innerText.includes(${JSON.stringify(String(subject).slice(0, 8))}) : false });
    })()`));
    if (st.has && st.match) return true;
  }
  return false;
}

async function readAttachments() {
  return JSON.parse(await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
    const box = boxes[boxes.length - 1];
    if (!box) return JSON.stringify([]);
    const uls = [...box.querySelectorAll('[id$="_ulCommonAttachItem"]')];
    const ul = uls[uls.length - 1];
    if (!ul) return JSON.stringify([]);
    const out = [];
    for (const li of ul.querySelectorAll('li')) {
      const a = li.querySelector('a[target="downloadFrame"]');
      if (!a) continue;
      const t = ((li.querySelector('.cg0') || {}).innerText || li.innerText || '').trim();
      out.push({ name: t.split('\\n')[0].trim(), href: a.href });
    }
    return JSON.stringify(out);
  })()`));
}

// ── 标已读 ────────────────────────────────────────────────────────────────
// 用户 2026-11-03 要求：已经读过的邮件直接标明已读，不要再重复读。
// 背景：本脚本用 location.hash 打开 read 模块，126 不会因为这种跳转把邮件标成已读，
// 所以收件箱里老邮件一直是未读状态。这里在「处理完一封」之后回到列表，勾选该行并点
// 工具栏「标记为已读」；失败则退化为「真点一下这一行」再校验一次。
const NO_MARK_READ = process.argv.includes('--no-mark-read') || process.env.COLLECT_NO_MARK_READ === '1';

async function backToList() {
  await page.evaluate(`(() => { try { location.hash = '#module=main'; } catch (e) {} return true; })()`);
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(2200);
    const n = JSON.parse(await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class^="rF0"]').length }))()`)).rows;
    if (n > 0) return true;
  }
  return false;
}

// 读当前列表里每行的未读状态，返回 { mid: stillUnread }
async function unreadMap(mids) {
  return JSON.parse(await page.evaluate(`(() => {
    const want = new Set(${JSON.stringify(mids)});
    const out = {};
    for (const r of document.querySelectorAll('[class^="rF0"]')) {
      const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
      if (!m) continue;
      const mid = m[1] + ':' + m[2];
      if (!want.has(mid)) continue;
      out[mid] = !!r.querySelector('.nui-ico-unread');
    }
    return JSON.stringify(out);
  })()`));
}

async function markReadBatch(items) {
  const mids = items.map((i) => i.mid);
  const marked = [];
  if (!mids.length || NO_MARK_READ) return marked;
  if (!(await backToList())) {
    for (const mid of mids) marked.push({ mid, ok: false, error: 'list not ready' });
    return marked;
  }
  const before = await unreadMap(mids).catch(() => ({}));
  const todo = mids.filter((m) => before[m] !== false); // false＝本来已读，不用管
  if (!todo.length) return marked;

  // ① 勾选这些行的复选框
  const picked = JSON.parse(await page.evaluate(`(() => {
    const want = new Set(${JSON.stringify(todo)});
    const hit = [];
    for (const r of document.querySelectorAll('[class^="rF0"]')) {
      const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
      if (!m) continue;
      const mid = m[1] + ':' + m[2];
      if (!want.has(mid)) continue;
      const cb = r.querySelector('input[type=checkbox]') || r.querySelector('.nui-checkbox') || r.querySelector('[class*="checkbox"]');
      if (cb) { (cb.click ? cb : cb.querySelector('input') || cb).click(); hit.push(mid); }
    }
    return JSON.stringify(hit);
  })()`)).catch(() => []);

  // ② 126 的工具栏是「标记为」下拉：先点开，再点菜单里的「已读」
  if (picked.length) {
    const dd = JSON.parse(await page.evaluate(`(() => {
      const btns = [...document.querySelectorAll('.nui-dropdownBtn, [id^="_mail_button_"], .js-component-button')]
        .filter((e) => e.offsetParent && /标记为/.test((e.innerText || '').trim()));
      if (!btns.length) return JSON.stringify({ ok: false, err: 'no 标记为 button' });
      btns[0].click();
      return JSON.stringify({ ok: true });
    })()`)).catch(() => ({ ok: false, err: 'eval failed' }));
    if (dd.ok) {
      await page.waitForTimeout(900);
      await page.evaluate(`(() => {
        const items = [...document.querySelectorAll('.nui-menu-item, [class*="menu"] li, [class*="MenuItem"]')].filter((e) => e.offsetParent);
        const want = items.filter((e) => /^(标记为)?已读$/.test((e.innerText || '').trim()));
        if (want.length) want[0].click();
        return true;
      })()`).catch(() => {});
      await page.waitForTimeout(2200);
    }
  }

  // ③ 校验：还没变已读的，退化成「真点一下这一行」（列表里点击会进阅读区，126 会顺带标已读）
  const after = await unreadMap(mids).catch(() => ({}));
  const still = mids.filter((m) => after[m] === true);
  if (still.length) {
    await page.evaluate(`(() => {
      const want = new Set(${JSON.stringify(still)});
      for (const r of document.querySelectorAll('[class^="rF0"]')) {
        const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
        if (!m) continue;
        if (!want.has(m[1] + ':' + m[2])) continue;
        const link = r.querySelector('a') || r;
        link.click();
        break;
      }
      return true;
    })()`).catch(() => {});
    await page.waitForTimeout(3500);
  }

  const final = await unreadMap(mids).catch(() => ({}));
  for (const mid of mids) {
    if (final[mid] === false) marked.push({ mid, ok: true });
    else if (final[mid] === true) marked.push({ mid, ok: false, error: 'still unread' });
    else marked.push({ mid, ok: false, error: 'not in current list page' });
  }
  return marked;
}

async function downloadDirect(href, destDir, fileName) {
  const res = await fetch(href, {
    headers: {
      cookie: cookieHeader,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      referer: 'https://mail.126.com/js6/main.jsp',
      accept: '*/*',
    },
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || /text\/html/i.test(ct)) return { ok: false, error: `status=${res.status} ct=${ct}` };
  const len = Number(res.headers.get('content-length') || 0);
  const direct = path.join(destDir, fileName);
  if (len > 0 && fs.existsSync(direct) && fs.statSync(direct).size === len) {
    return { ok: true, dupOf: direct, bytes: len, MBps: 0 };
  }
  const target = uniqueTarget(destDir, fileName);
  const tmp = target + '.part';   // 同盘临时文件，避免 D:→E: rename EXDEV
  const hash = crypto.createHash('sha256');
  const ws = fs.createWriteStream(tmp);
  let bytes = 0;
  const started = Date.now();
  for await (const chunk of res.body) {
    bytes += chunk.length;
    hash.update(chunk);
    if (!ws.write(chunk)) await new Promise((r) => ws.once('drain', r));
  }
  await new Promise((r) => ws.end(r));
  const sec = Math.max(0.001, (Date.now() - started) / 1000);
  fs.renameSync(tmp, target);
  const sha = hash.digest('hex');
  if (bytes === 0) {
    try { fs.unlinkSync(target); } catch {}
    return { ok: false, error: 'empty response (0 bytes)' };
  }
  return { ok: true, file: target, bytes, sha256: sha, MBps: Math.round((bytes / 1048576 / sec) * 100) / 100 };
}

// ---- QQ 超大附件（126 邮件正文里只有「从QQ邮箱发来的超大附件 / 进入下载页面」）----
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

async function findQQBigLinks(mid) {
  const url = `https://mail.126.com/js6/read/readhtml3.jsp?mid=${encodeURIComponent(mid)}&userType=browser&moduleName=read.ReadModule_0&font=15&color=299E59`;
  const res = await fetch(url, { headers: { cookie: cookieHeader, 'user-agent': UA, referer: 'https://mail.126.com/js6/main.jsp' } }).catch(() => null);
  if (!res || !res.ok) return [];
  const html = (await res.text()).replace(/&amp;/g, '&');
  const out = [];
  const re = /https?:\/\/mail\.qq\.com\/cgi-bin\/ftnExs_download\?[^"'\s<>\\]+/g;
  let m;
  while ((m = re.exec(html))) {
    const link = m[0].replace(/&amp;/g, '&');
    if (!out.includes(link)) out.push(link);
  }
  return out;
}

async function resolveQQShare(link) {
  let cur = link;
  for (let i = 0; i < 6; i += 1) {
    const r = await fetch(cur, { headers: { 'user-agent': UA }, redirect: 'manual' });
    const loc = r.headers.get('location');
    if (!loc) return null;
    cur = new URL(loc, cur).href;
    if (/^https:\/\/wx\.mail\.qq\.com\/ftn\/download/.test(cur) && /[?&]key=/.test(cur)) return cur;
  }
  return null;
}

async function downloadQQBig(link, destDir, prefix) {
  const share = await resolveQQShare(link);
  if (!share) return { ok: false, error: 'cannot resolve QQ share url' };
  const su = new URL(share);
  const key = su.searchParams.get('key');
  const code = su.searchParams.get('code');
  const r1 = await fetch('https://wx.mail.qq.com/ftn/download', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, referer: share, origin: 'https://wx.mail.qq.com' },
    body: new URLSearchParams({ f: 'json', func: '3', key, code }).toString(),
  });
  const j = await r1.json().catch(() => null);
  const meta = j && j.body;
  if (!meta || !meta.url) return { ok: false, error: 'ftn api failed' };
  const name = sanitize(meta.name || 'qq-big-attachment');
  const early = path.join(destDir, `${prefix}${name}`);
  if (meta.size > 0 && fs.existsSync(early) && fs.statSync(early).size === meta.size) {
    return { ok: true, dupOf: early, bytes: meta.size, qqName: meta.name, via: 'qq-big' };
  }
  const hop = await fetch(meta.url, { headers: { 'user-agent': UA }, redirect: 'manual' });
  const setc = hop.headers.getSetCookie ? hop.headers.getSetCookie() : [hop.headers.get('set-cookie')].filter(Boolean);
  const cookie = (setc || []).map((c) => String(c).split(';')[0]).join('; ');
  const cdn = hop.headers.get('location');
  if (!cdn) return { ok: false, error: `no cdn location status=${hop.status}` };
  const target = uniqueTarget(destDir, `${prefix}${name}`);
  const tmp = target + '.part';
  const res = await fetch(cdn, { headers: { 'user-agent': UA, cookie } });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || /text\/html/i.test(ct)) return { ok: false, error: `cdn status=${res.status} ct=${ct}` };
  const hash = crypto.createHash('sha256');
  const ws = fs.createWriteStream(tmp);
  let bytes = 0;
  const started = Date.now();
  for await (const chunk of res.body) {
    bytes += chunk.length;
    hash.update(chunk);
    if (!ws.write(chunk)) await new Promise((r) => ws.once('drain', r));
  }
  await new Promise((r) => ws.end(r));
  const sec = Math.max(0.001, (Date.now() - started) / 1000);
  if (bytes === 0) { try { fs.unlinkSync(tmp); } catch {} return { ok: false, error: 'empty response (0 bytes)' }; }
  fs.renameSync(tmp, target);
  return { ok: true, file: target, bytes, qqName: meta.name, qqSize: meta.size, sha1: meta.sha, sha256: hash.digest('hex'), MBps: Math.round((bytes / 1048576 / sec) * 100) / 100, via: 'qq-big' };
}

// ---- 百度网盘：正文里给了 pan.baidu.com 分享链接就下载（复用浏览器里的百度登录态）----
const panJar = panCookieHeader(cookiesAll);

async function readPanLinks() {
  // 从当前已打开的阅读框取正文文本与 pan 链接（同源 iframe 可读）
  const raw = await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
    const box = boxes[boxes.length - 1];
    if (!box) return JSON.stringify({ text: '', links: [] });
    const parts = [box.innerText || ''];
    for (const f of box.querySelectorAll('iframe')) {
      try { parts.push((f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText) || ''); } catch {}
    }
    const text = parts.join('\\n');
    const links = [...new Set(text.match(/https?:\\/\\/pan\\.baidu\\.com\\/[^\\s"'<>]+/g) || [])];
    return JSON.stringify({ text: text.slice(0, 20000), links });
  })()`);
  return JSON.parse(raw);
}

const markQueue = [...seenUnread];
for (const row of candidates) {
  if (Date.now() - T0 > DEADLINE_MS) { result.aborted = 'deadline exceeded'; break; }
  state.pending[row.mid] = { subject: row.subject, from: row.from, time: row.time, at: new Date().toISOString() };
  save(STATE_PATH, state);

  if (!(await openByMid(row.mid, row.subject).catch(() => false))) {
    result.errors.push(`open failed: ${row.subject}`);
    continue;
  }
  const atts = await readAttachments().catch(() => []);
  // ROUTE_ONLY 生效时：本封邮件及其附件若都不属于该类材料，直接跳过（不下载、不写台账、保持未读）
  if (ROUTE_ONLY) {
    const hitOnly = atts.some((a) => route(row.subject, a.name).bucket === ROUTE_ONLY) || route(row.subject, '').bucket === ROUTE_ONLY;
    if (!hitOnly) {
      result.skipped.push(`${row.subject}（不属于 ${ROUTE_ONLY}，跳过）`);
      delete state.pending[row.mid];
      save(STATE_PATH, state);
      continue;
    }
  }
  const rec = { mid: row.mid, subject: row.subject, from: row.from, time: row.time, at: new Date().toISOString(), attachments: [] };
  const jobs = atts.filter((a) => a.href && a.name && (!ROUTE_ONLY || route(row.subject, a.name).bucket === ROUTE_ONLY)).map((a) => ({ kind: 'normal', name: a.name, href: a.href }));

  // 普通附件为空时，检查是否是可点进去的 QQ 超大附件
  if (!jobs.length) {
    const bigs = await findQQBigLinks(row.mid).catch(() => []);
    for (const link of bigs) jobs.push({ kind: 'qqbig', name: '', href: link });
    if (bigs.length) rec.bigLinks = bigs.length;
  }

  // 正文里给了百度网盘分享链接就打开下载（提取码从链接参数或正文「提取码：xxxx」取）
  const panInfo = ROUTE_ONLY ? { links: [], text: '' } : await readPanLinks().catch(() => ({ links: [], text: '' }));
  for (const pu of (panInfo.links || []).slice(0, 3)) {
    const parsed = parsePanLink(pu, panInfo.text);
    if (!parsed) continue;
    const guess = route(row.subject, '');
    const got = await downloadShare({ link: parsed.url, pwd: parsed.pwd, jar: panJar, destDir: guess.dir, prefix: `${sanitize(row.from)}__` })
      .catch((e) => ({ ok: false, error: e.message }));
    if (!got.ok) {
      const msg = `pan ${parsed.url.slice(0, 60)}: ${got.error || 'download failed'}`;
      result.errors.push(msg);
      rec.panFailed = [...(rec.panFailed || []), { url: parsed.url, pwd: parsed.pwd ? '有' : '无', error: got.error || 'download failed' }];
      continue;
    }
    for (const f of got.files || []) {
      if (!f.ok || !f.file) { result.errors.push(`pan file ${f.name}: ${f.error}`); continue; }
      const name = path.basename(f.file).split('__').slice(1).join('__') || path.basename(f.file);
      const prev = index.files[f.sha256];
      if (prev && prev.path && fs.existsSync(prev.path)) {
        result.duplicates.push({ name, sha256: f.sha256, existing: prev.path });
        try { fs.unlinkSync(f.file); } catch {}
        rec.attachments.push({ name, dup: true, path: prev.path });
        continue;
      }
      if (prev) delete index.files[f.sha256];
      index.files[f.sha256] = { path: f.file, name, at: new Date().toISOString(), mid: row.mid };
      save(INDEX_PATH, index);
      const r2 = route(row.subject, name);
      let finalPath = f.file;
      if (r2.dir !== guess.dir) {
        const moved = uniqueTarget(r2.dir, path.basename(f.file));
        try { fs.renameSync(f.file, moved); finalPath = moved; } catch {}
      }
      const item = { name, path: finalPath, bytes: f.bytes, sha256: f.sha256, MBps: f.MBps, bucket: r2.bucket, keyword: r2.keyword, via: 'baidu-pan' };
      pushItem(item);
      rec.attachments.push(item);
    }
  }

  for (const job of jobs) {
    let name = job.name;
    let r = null;
    let got = null;
    if (job.kind === 'normal') {
      r = route(row.subject, name);
      got = await downloadDirect(job.href, r.dir, `${sanitize(row.from)}__${sanitize(name)}`).catch((e) => ({ ok: false, error: e.message }));
    } else {
      // QQ 超大附件：先按主题定位目录，文件名等 API 返回后才知道
      const guess = route(row.subject, '');
      got = await downloadQQBig(job.href, guess.dir, `${sanitize(row.from)}__`).catch((e) => ({ ok: false, error: e.message }));
      if (got.ok) {
        // 拿到真实文件名后复核一次目录（附件名优先级更高），不一致就挪过去
        name = got.qqName || path.basename(got.file);
        r = route(row.subject, name);
        if (r.dir !== guess.dir) {
          const moved = uniqueTarget(r.dir, path.basename(got.file));
          try { fs.renameSync(got.file, moved); got.file = moved; } catch (e) { result.errors.push(`move ${name}: ${e.message}`); }
        }
      }
    }
    if (!got) continue;
    if (!got.ok) { result.errors.push(`download ${name || job.href.slice(0, 40)}: ${got.error}`); continue; }
    if (got.dupOf) {
      result.duplicates.push({ name, existing: got.dupOf, by: 'size' });
      rec.attachments.push({ name, dup: true, path: got.dupOf });
      continue;
    }
    const prev = index.files[got.sha256];
    if (prev && prev.path && fs.existsSync(prev.path)) {
      result.duplicates.push({ name, sha256: got.sha256, existing: prev.path });
      try { fs.unlinkSync(got.file); } catch {}
      rec.attachments.push({ name, dup: true, path: prev.path });
      continue;
    }
    if (prev) delete index.files[got.sha256]; // 索引记录的文件已被移走，重新落盘
    index.files[got.sha256] = { path: got.file, name, at: new Date().toISOString(), mid: row.mid };
    save(INDEX_PATH, index);
    const item = { name, path: got.file, bytes: got.bytes, sha256: got.sha256, MBps: got.MBps, bucket: r.bucket, keyword: r.keyword, via: got.via || 'direct' };
    pushItem(item);
    rec.attachments.push(item);
  }

  if (rec.attachments.length) fs.appendFileSync(LEDGER_PATH, JSON.stringify(rec) + '\n', 'utf8');
  else result.skipped.push(row.subject);

  state.seen[row.mid] = { subject: row.subject, from: row.from, time: row.time, at: new Date().toISOString(), count: rec.attachments.length };
  delete state.pending[row.mid];
  save(STATE_PATH, state);
  result.checked += 1;
  if (row.unread) markQueue.push({ mid: row.mid, subject: row.subject });
}

// 本轮真正读过（或明确判定为不采集）的邮件标成已读，避免下次再扫一遍
if (markQueue.length) {
  if (NO_MARK_READ) result.marked = markQueue.map((m) => ({ mid: m.mid, ok: false, error: 'disabled by --no-mark-read' }));
  else {
    const marked = await markReadBatch(markQueue).catch((e) => markQueue.map((m) => ({ mid: m.mid, ok: false, error: e.message })));
    result.marked = marked;
    const bad = marked.filter((m) => !m.ok);
    if (bad.length) result.errors.push(`mark-read failed: ${bad.length}/${marked.length} (${bad.map((b) => b.error).join(',')})`);
  }
}

result.finishedAt = new Date().toISOString();
result.elapsedSec = Math.round((Date.now() - T0) / 1000);
save(LAST_RUN, result);
console.log(JSON.stringify(result));
