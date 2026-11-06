import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const STATE_PATH = "D:\\dsh-workbench\\mail\\126\\state.json";
const HASH_PATH = "D:\\dsh-workbench\\mail\\126\\hash-index.json";
const RULES_PATH = "D:\\dsh-workbench\\mail-watch\\rules.json";
const FALLBACK_DIR = "D:\\dsh-workbench\\mail\\126\\待确认";
const SPACE = "dsh-126-watch";

const DEFAULT_RULES = {
  categories: [
    {
      id: "qianwen",
      dir: "E:\\桌面\\办公文件\\办公文档\\2026年\\10月\\千问账号发送",
      keywords: ["试用人员信息表", "信息表", "试用人员", "人员信息"],
    },
    {
      id: "kejian",
      dir: "E:\\桌面\\办公文件\\办公文档\\2026年\\10月\\课件15分钟",
      keywords: ["课件", "课例", "应用案例", "课间一刻钟", "教学案例", "教学设计"],
    },
  ],
  unknownDir: FALLBACK_DIR,
};

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}
function saveJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}
const rules = readJson(RULES_PATH, DEFAULT_RULES);
const unknownDir = rules.unknownDir || FALLBACK_DIR;

const safe = (s) =>
  String(s ?? "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const state = readJson(STATE_PATH, { seen: {}, downloads: [] });
state.seen = state.seen || {};
state.downloads = state.downloads || [];
const index = readJson(HASH_PATH, { files: {} });
index.files = index.files || {};

const result = {
  at: new Date().toISOString(),
  loggedIn: null,
  rows: 0,
  checked: 0,
  newMails: [],
  downloads: [],
  duplicates: [],
  needsConfirm: [],
  errors: [],
};

function saveState() {
  const keys = Object.keys(state.seen);
  if (keys.length > 1500) {
    state.seen = Object.fromEntries(keys.slice(-1500).map((k) => [k, state.seen[k]]));
  }
  if (state.downloads.length > 1500) state.downloads = state.downloads.slice(-1500);
  saveJson(STATE_PATH, state);
}

function route(subject, fileName) {
  const hay = `${subject} ${fileName}`.toLowerCase();
  const confirms = (rules.confirmKeywords || []).map((k) => String(k).toLowerCase());
  if (confirms.some((k) => k && hay.includes(k))) return { cat: null, dir: unknownDir, matched: false };
  for (const cat of rules.categories || []) {
    const kws = (cat.keywords || []).map((k) => String(k).toLowerCase());
    if (kws.some((k) => k && hay.includes(k))) return { cat, dir: cat.dir, matched: true };
  }
  return { cat: null, dir: unknownDir, matched: false };
}

function uniqueTarget(dir, baseName) {
  let target = join(dir, baseName);
  if (!existsSync(target)) return target;
  const dot = baseName.lastIndexOf(".");
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : "";
  for (let i = 2; i < 50; i += 1) {
    target = join(dir, `${stem} (${i})${ext}`);
    if (!existsSync(target)) return target;
  }
  return join(dir, `${stem}_${Date.now()}${ext}`);
}

const task = await taskSpace(SPACE);
const page = task.page("p1");
await page.goto("https://mail.126.com/js6/main.jsp");
await page.waitForTimeout(4500);

const probe = JSON.parse(
  await page.evaluate(`(() => JSON.stringify({
    hasLogin: !!document.querySelector('input[name=username]'),
    rows: document.querySelectorAll('[class="rF0 nui-txt-flag0"]').length
  }))()`),
);
result.loggedIn = !probe.hasLogin;

if (!probe.hasLogin) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const n = JSON.parse(
      await page.evaluate(`(() => JSON.stringify({ rows: document.querySelectorAll('[class="rF0 nui-txt-flag0"]').length }))()`),
    ).rows;
    if (n > 0) break;
    await page.evaluate(`(() => {
      const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
      if (c.length) c[c.length - 1].click();
      return true;
    })()`);
    await page.waitForTimeout(6000);
  }
}

const rows = JSON.parse(
  await page.evaluate(`(() => {
    return JSON.stringify([...document.querySelectorAll('[class="rF0 nui-txt-flag0"]')].map((el) => {
      const label = el.getAttribute('aria-label') || '';
      const m = /^(.*?)\\s*发件人\\s*[：:]\\s*(.*?)\\s*时间[：:]\\s*(.*)$/.exec(label);
      const subject = m ? m[1].trim() : label;
      const sender = m ? m[2].trim() : '';
      const time = m ? m[3].trim() : '';
      const idm = /^\\d+_(\\d+)(.+?)(\\d{13})Dom$/.exec(el.id);
      const mid = idm ? idm[1] + ':' + idm[2] : null;
      return { id: el.id, mid, key: mid || (sender + '|' + subject + '|' + time), subject, sender, time };
    }));
  })()`),
);
result.rows = rows.length;

const fresh = rows.filter((r) => r.mid && !state.seen[r.key]);

for (const row of fresh.slice(0, 10)) {
  result.checked += 1;
  const record = { subject: row.subject, sender: row.sender, time: row.time, mid: row.mid, files: [], skipped: [], note: null };
  try {
    const hash =
      "#module=read.ReadModule%7C%7B%22area%22%3A%22normal%22%2C%22isThread%22%3Afalse%2C%22viewType%22%3A%22%22%2C%22id%22%3A%22" +
      encodeURIComponent(row.mid) +
      "%22%2C%22fid%22%3A1%7D";
    await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
    await page.waitForTimeout(5000);

    const openMid = JSON.parse(
      await page.evaluate(`(() => {
        const h = decodeURIComponent(location.hash || '');
        const m = /"id":"([^"]+)"/.exec(h);
        return JSON.stringify({ mid: m ? m[1] : null });
      })()`),
    ).mid;
    if (openMid !== row.mid) {
      record.note = "打开的不是这封邮件";
      state.seen[row.key] = stamp();
      saveState();
      result.newMails.push(record);
      continue;
    }

    const detail = JSON.parse(
      await page.evaluate(`(() => {
        const boxes = [...document.querySelectorAll('[id*="_dvModuleContainer_read"]')].filter((e) => e.offsetParent);
        const box = boxes[boxes.length - 1] || null;
        const text = box ? box.innerText : '';
        const uls = box ? [...box.querySelectorAll('[id$="_ulCommonAttachItem"]')].filter((u) => u.offsetParent) : [];
        const ul = uls[uls.length - 1] || null;
        const items = ul
          ? [...ul.querySelectorAll('li')].map((li, i) => ({ idx: i + 1, name: (li.querySelector('.cg0') || {}).innerText || '' }))
          : [];
        return JSON.stringify({ rendered: text.slice(0, 200), ulId: ul ? ul.id : null, items });
      })()`),
    );

    const shown = String(detail.rendered || "");
    const want = String(row.subject).replace(/\s+/g, "").slice(0, 8);
    if (!shown.replace(/\s+/g, "").includes(want)) {
      record.note = "页面未切到该邮件";
      state.seen[row.key] = stamp();
      saveState();
      result.newMails.push(record);
      continue;
    }

    if (!detail.items.length) {
      record.note = "无附件";
    } else {
      for (const item of detail.items) {
        const fileName = safe(item.name || `file-${item.idx}`);
        const href = JSON.parse(
          await page.evaluate(`(() => {
            const root = document.getElementById(${JSON.stringify(detail.ulId)});
            const li = root ? root.querySelectorAll('li')[${item.idx - 1}] : null;
            const a = li ? li.querySelector('a[target=downloadFrame]') : null;
            return JSON.stringify({ href: a ? a.href : null });
          })()`),
        ).href;
        if (!href) {
          record.note = "附件无下载地址";
          continue;
        }
        const fetched = JSON.parse(
          await page.evaluate(`(async () => {
            const r = await fetch(${JSON.stringify(href)}, { credentials: 'include' });
            if (!r.ok) return JSON.stringify({ ok: false, status: r.status });
            const buf = new Uint8Array(await r.arrayBuffer());
            let bin = '';
            const chunk = 0x8000;
            for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
            return JSON.stringify({ ok: true, size: buf.length, b64: btoa(bin) });
          })()`),
        );
        if (!fetched.ok) {
          record.note = `下载失败 HTTP ${fetched.status}`;
          continue;
        }

        const raw = Buffer.from(fetched.b64, "base64");
        const digest = sha256(raw);

        const previous = index.files[digest];
        if (previous && previous.name === fileName && existsSync(previous.path)) {
          record.skipped.push({ name: fileName, reason: "内容重复", previous: previous.path });
          result.duplicates.push({ name: fileName, subject: row.subject, previous: previous.path });
          continue;
        }

        const routed = route(row.subject, fileName);
        mkdirSync(routed.dir, { recursive: true });
        const baseName = safe(`${row.sender}__${fileName}`);
        const target = uniqueTarget(routed.dir, baseName);
        writeFileSync(target, raw);

        index.files[digest] = { path: target, name: fileName };
        const saved = { name: fileName, path: target, size: raw.length, category: routed.cat ? routed.cat.id : "unknown", dir: routed.dir };
        record.files.push(saved);
        state.downloads.push({ at: stamp(), subject: row.subject, sender: row.sender, name: fileName, path: target, size: raw.length });
        if (!routed.matched) result.needsConfirm.push({ subject: row.subject, sender: row.sender, name: fileName, path: target });
      }
    }
  } catch (err) {
    record.note = "失败: " + String((err && err.message) || err).slice(0, 200);
    result.errors.push({ subject: row.subject, error: record.note });
  }
  state.seen[row.key] = stamp();
  saveState();
  result.newMails.push(record);
}

saveState();
saveJson(HASH_PATH, index);
result.downloads = result.newMails.flatMap((m) => m.files);
result.skippedDuplicates = result.newMails.flatMap((m) => m.skipped);
console.log(JSON.stringify(result, null, 2));
