import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const STATE_PATH = "D:\\dsh-workbench\\mail\\126\\state.json";
const OUT_ROOT = "D:\\dsh-workbench\\mail\\126\\attachments";
const SPACE = "dsh-126-watch";

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { seen: {}, downloads: [] };
  }
}
function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  const keys = Object.keys(state.seen);
  if (keys.length > 800) {
    state.seen = Object.fromEntries(keys.slice(-800).map((k) => [k, state.seen[k]]));
  }
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}
const safe = (s) =>
  String(s)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const state = loadState();
const result = { at: new Date().toISOString(), loggedIn: null, rows: 0, checked: 0, newMails: [], downloads: [], errors: [] };

const task = await taskSpace(SPACE);
const page = task.page("p1");
await page.goto("https://mail.126.com/js6/main.jsp");
await page.waitForTimeout(4500);

let info = JSON.parse(
  await page.evaluate(`(() => {
    const hasLogin = !!document.querySelector('input[name=username]');
    const rows = document.querySelectorAll('[class="rF0 nui-txt-flag0"]');
    return JSON.stringify({ hasLogin, rows: rows.length });
  })()`),
);
result.loggedIn = !info.hasLogin;

if (!info.hasLogin && info.rows === 0) {
  await page.evaluate(`(() => {
    const c = [...document.querySelectorAll('a,div,span,li')].filter((e) => (e.innerText || '').trim() === '收件箱' && e.offsetParent);
    if (c.length) c[c.length - 1].click();
    return true;
  })()`);
  await page.waitForTimeout(6000);
}

const rows = JSON.parse(
  await page.evaluate(`(() => {
    return JSON.stringify([...document.querySelectorAll('[class="rF0 nui-txt-flag0"]')].map((el) => {
      const label = el.getAttribute('aria-label') || '';
      const m = /^(.*?)\\s*发件人\\s*[：:]\\s*(.*?)\\s*时间[：:]\\s*(.*)$/.exec(label);
      const subject = m ? m[1].trim() : label;
      const sender = m ? m[2].trim() : '';
      const time = m ? m[3].trim() : '';
      return { id: el.id, key: sender + '|' + subject + '|' + time, subject, sender, time };
    }));
  })()`),
);
result.rows = rows.length;

const fresh = rows.filter((r) => !state.seen[r.key]);

for (const row of fresh.slice(0, 8)) {
  result.checked += 1;
  const record = { subject: row.subject, sender: row.sender, time: row.time, files: [], note: null };
  try {
    await page.evaluate(`document.getElementById(${JSON.stringify(row.id)}).click()`);
    await page.waitForTimeout(4500);

    const detail = JSON.parse(
      await page.evaluate(`(() => {
        const hash = decodeURIComponent(location.hash || '');
        const mid = /"id":"([^"]+)"/.exec(hash);
        const ul = document.querySelector('[id$="_ulCommonAttachItem"]');
        const items = ul ? [...ul.querySelectorAll('li')].map((li, i) => ({
          idx: i + 1,
          name: (li.querySelector('.cg0') || {}).innerText || '',
        })) : [];
        return JSON.stringify({ mid: mid ? mid[1] : null, ulId: ul ? ul.id : null, items });
      })()`),
    );
    record.mid = detail.mid;

    if (!detail.items.length) {
      record.note = "无附件";
    } else {
      const day = (row.time.match(/(\d{1,2})月(\d{1,2})日/) || []).slice(1).join("-") || "unknown";
      const dir = join(OUT_ROOT, day, `${safe(row.sender)}_${safe(row.subject)}`);
      mkdirSync(dir, { recursive: true });
      for (const item of detail.items) {
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
        const name = safe(item.name || `file-${item.idx}`);
        const target = join(dir, name);
        writeFileSync(target, Buffer.from(fetched.b64, "base64"));
        record.files.push({ name, path: target, size: fetched.size });
        state.downloads.push({ at: stamp(), subject: row.subject, sender: row.sender, name, path: target, size: fetched.size });
      }
    }
  } catch (err) {
    record.note = "失败: " + String((err && err.message) || err).slice(0, 200);
    result.errors.push({ subject: row.subject, error: record.note });
  }
  state.seen[row.key] = stamp();
  saveState(state);
  result.newMails.push(record);
}

saveState(state);
result.downloads = result.newMails.flatMap((m) => m.files);
console.log(JSON.stringify(result, null, 2));
