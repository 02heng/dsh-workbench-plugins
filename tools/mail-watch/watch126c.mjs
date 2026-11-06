// watch126c.mjs — 只收未读邮件的附件：Node 直连下载（跳过 base64 中转）+ 分流 + 去重 + 台账
// 设计原则：一次性执行、硬性上限、跑完即退，不做常驻循环。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'D:/dsh-workbench/mail/126';
const STATE_PATH = path.join(ROOT, 'state.json');
const INDEX_PATH = path.join(ROOT, 'hash-index.json');
const RULES_PATH = 'D:/dsh-workbench/mail-watch/rules.json';
const LEDGER_PATH = path.join(ROOT, 'ledger.jsonl');
const LAST_RUN = path.join(ROOT, 'last-run.json');
const TMP_DIR = path.join(ROOT, '_tmp');

const MAX_MAILS = 10;          // 单次最多处理 10 封未读
const DEADLINE_MS = 8 * 60 * 1000; // 单次运行最长 8 分钟，超时立刻收尾退出
const T0 = Date.now();

const load = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const save = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2), 'utf8');
const state = load(STATE_PATH, { seen: {}, pending: {} });
const index = load(INDEX_PATH, { files: {} });
const rules = load(RULES_PATH, { rules: [], confirmKeywords: [], unknownDir: path.join(ROOT, '待确认') });
fs.mkdirSync(TMP_DIR, { recursive: true });

const sanitize = (s) => String(s || '')
  .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 120) || 'unnamed';

function route(subject, fileName) {
  const hay = (subject + ' ' + fileName).toLowerCase();
  for (const kw of rules.confirmKeywords || []) {
    if (hay.includes(String(kw).toLowerCase())) {
      return { dir: rules.unknownDir, bucket: 'confirm', keyword: kw };
    }
  }
  for (const r of rules.rules || []) {
    for (const kw of r.keywords || []) {
      if (hay.includes(String(kw).toLowerCase())) {
        return { dir: r.dir, bucket: r.id || r.name, keyword: kw };
      }
    }
  }
  return { dir: rules.unknownDir, bucket: 'confirm', keyword: null };
}

function uniqueTarget(dir, fileName) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n += 1;
    if (n > 200) break;
  }
  return candidate;
}

const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");
const result = { startedAt: new Date().toISOString(), checked: 0, downloads: [], duplicates: [], needsConfirm: [], errors: [], aborted: null };

await page.goto('https://mail.126.com/js6/main.jsp');
await page.waitForTimeout(4500);

async function ensureInbox() {
  for (let i = 0; i < 4; i += 1) {
    const n = JSON.parse(await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class^="rF0"]').length }))()`)).rows;
    if (n > 0) return n;
    await page.evaluate(`(() => {
      const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
      if (c.length) c[c.length - 1].click();
      return true;
    })()`);
    await page.waitForTimeout(6000);
  }
  return 0;
}

const rowCount = await ensureInbox();
if (rowCount === 0) {
  result.errors.push('inbox list did not load');
  save(LAST_RUN, { ...result, finishedAt: new Date().toISOString() });
  console.log(JSON.stringify(result));
  process.exit(0);
}

const rows = JSON.parse(await page.evaluate(`(() => {
  const out = [];
  for (const r of document.querySelectorAll('[class^="rF0"]')) {
    const m = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(r.id || '');
    if (!m) continue;
    const label = r.getAttribute('aria-label') || '';
    const subject = (label.split(' 发件人')[0] || '').trim();
    const fm = /发件人\\s*[：:]\\s*([^\\s]+)/.exec(label);
    const tm = /时间\\s*[：:]\\s*(.+)$/.exec(label);
    out.push({
      mid: m[1] + ':' + m[2],
      id: r.id,
      subject,
      from: fm ? fm[1] : '',
      time: tm ? tm[1].trim() : '',
      unread: !!r.querySelector('.nui-ico-unread'),
      raw: (r.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160)
    });
  }
  return JSON.stringify(out);
})()`));

const candidates = rows
  .filter((r) => r.unread || state.pending[r.mid])
  .filter((r) => !state.seen[r.mid])
  .slice(0, MAX_MAILS);

// 拿到完整 cookie（含 httpOnly），供 Node 侧直连下载
const cookieList = await page.cdp('Network.getAllCookies', {});
const cookiesAll = (cookieList && (cookieList.cookies || (cookieList.result && cookieList.result.cookies))) || [];
const cookieHeader = cookiesAll
  .filter((c) => /(^|\.)(mail\.)?(126|163)\.com$/.test(String(c.domain || '')))
  .map((c) => `${c.name}=${c.value}`)
  .join('; ');

async function openByMid(mid, subject) {
  const hashMid = mid.replace(':', '%3A');
  await page.evaluate(`(() => {
    location.hash = '#module=read.ReadModule%7C%7B%22id%22%3A%22${hashMid}%22%7D';
    return true;
  })()`);
  for (let i = 0; i < 3; i += 1) {
    await page.waitForTimeout(3200);
    const ok = JSON.parse(await page.evaluate(`(() => {
      const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
      const box = boxes[boxes.length - 1];
      const text = box ? box.innerText : '';
      return JSON.stringify({ has: !!box, match: text.includes(${JSON.stringify(String(subject).slice(0, 8))}) });
    })()`));
    if (ok.has && ok.match) return true;
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
      const nameEl = li.querySelector('.cg0, .name, a');
      out.push({ name: ((nameEl && nameEl.innerText) || '').trim(), href: a.href });
    }
    return JSON.stringify(out);
  })()`));
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
  if (!res.ok || /text\/html/i.test(ct)) {
    return { ok: false, error: `status=${res.status} ct=${ct}` };
  }
  const target = uniqueTarget(destDir, fileName);
  const tmp = path.join(TMP_DIR, `${Date.now()}-${sanitize(fileName)}`);
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(tmp);
  let bytes = 0;
  const started = Date.now();
  for await (const chunk of res.body) {
    bytes += chunk.length;
    hash.update(chunk);
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
  }
  await new Promise((r) => out.end(r));
  const sec = Math.max(0.001, (Date.now() - started) / 1000);
  fs.renameSync(tmp, target);
  return { ok: true, file: target, bytes, sha256: hash.digest('hex'), sec: Math.round(sec * 10) / 10, MBps: Math.round((bytes / 1048576 / sec) * 100) / 100 };
}

for (const row of candidates) {
  if (Date.now() - T0 > DEADLINE_MS) {
    result.aborted = 'deadline exceeded';
    break;
  }
  state.pending[row.mid] = { subject: row.subject, from: row.from, time: row.time, at: new Date().toISOString() };
  save(STATE_PATH, state);

  let opened = false;
  try {
    opened = await openByMid(row.mid, row.subject);
  } catch (e) {
    result.errors.push(`open ${row.subject}: ${e.message}`);
  }
  if (!opened) {
    result.errors.push(`open failed: ${row.subject}`);
    continue;
  }

  const atts = await readAttachments().catch((e) => {
    result.errors.push(`list ${row.subject}: ${e.message}`);
    return [];
  });

  const mailRecord = {
    mid: row.mid,
    subject: row.subject,
    from: row.from,
    time: row.time,
    at: new Date().toISOString(),
    attachments: [],
  };

  for (const att of atts) {
    if (!att.href || !att.name) continue;
    const r = route(row.subject, att.name);
    const fileName = `${sanitize(row.from)}__${sanitize(att.name)}`;
    let got;
    try {
      got = await downloadDirect(att.href, r.dir, fileName);
    } catch (e) {
      got = { ok: false, error: e.message };
    }
    if (!got.ok) {
      result.errors.push(`download ${att.name}: ${got.error}`);
      continue;
    }
    const prev = index.files[got.sha256];
    if (prev && path.basename(prev.path) === path.basename(got.file)) {
      result.duplicates.push({ name: att.name, sha256: got.sha256, existing: prev.path });
      try { fs.unlinkSync(got.file); } catch {}
      mailRecord.attachments.push({ name: att.name, dup: true, sha256: got.sha256, path: prev.path });
      continue;
    }
    index.files[got.sha256] = { path: got.file, name: att.name, at: new Date().toISOString(), mid: row.mid };
    save(INDEX_PATH, index);
    const item = {
      name: att.name, path: got.file, bytes: got.bytes, sha256: got.sha256,
      MBps: got.MBps, bucket: r.bucket, keyword: r.keyword,
    };
    if (r.bucket === 'confirm') result.needsConfirm.push(item); else result.downloads.push(item);
    mailRecord.attachments.push(item);
  }

  mailRecord.attachments.length
    ? fs.appendFileSync(LEDGER_PATH, JSON.stringify(mailRecord) + '\n', 'utf8')
    : result.errors.push(`no attachment: ${row.subject}`);

  state.seen[row.mid] = { subject: row.subject, from: row.from, time: row.time, at: new Date().toISOString(), count: mailRecord.attachments.length };
  delete state.pending[row.mid];
  save(STATE_PATH, state);
  result.checked += 1;
}

result.finishedAt = new Date().toISOString();
result.elapsedSec = Math.round((Date.now() - T0) / 1000);
save(LAST_RUN, result);
console.log(JSON.stringify(result));
