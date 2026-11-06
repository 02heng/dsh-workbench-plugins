import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, copyFileSync, readdirSync, rmdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

const STATE_PATH = "D:\\dsh-workbench\\mail\\126\\state.json";
const HASH_PATH = "D:\\dsh-workbench\\mail\\126\\hash-index.json";
const RULES_PATH = "D:\\dsh-workbench\\mail-watch\\rules.json";
const ROOT = "D:\\dsh-workbench\\mail\\126\\attachments";

const readJson = (p, f) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return f;
  }
};
const saveJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2), "utf8");
};
const safe = (s) =>
  String(s ?? "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

const rules = readJson(RULES_PATH, { categories: [], unknownDir: "D:\\dsh-workbench\\mail\\126\\待确认" });
const state = readJson(STATE_PATH, { seen: {}, downloads: [] });
const index = readJson(HASH_PATH, { files: {} });
index.files = index.files || {};

function route(subject, fileName) {
  const hay = `${subject} ${fileName}`.toLowerCase();
  for (const cat of rules.categories || []) {
    const kws = (cat.keywords || []).map((k) => String(k).toLowerCase());
    if (kws.some((k) => k && hay.includes(k))) return { cat, dir: cat.dir, matched: true };
  }
  return { cat: null, dir: rules.unknownDir || "D:\\dsh-workbench\\mail\\126\\待确认", matched: false };
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

const moved = [];
const missing = [];
const unknown = [];

for (const entry of state.downloads || []) {
  const src = entry.path;
  if (!src || !existsSync(src)) {
    missing.push(entry);
    continue;
  }
  const buf = readFileSync(src);
  const digest = createHash("sha256").update(buf).digest("hex");
  const routed = route(entry.subject || "", entry.name || "");
  mkdirSync(routed.dir, { recursive: true });
  const target = uniqueTarget(routed.dir, safe(`${entry.sender || ""}__${entry.name || "file"}`));
  if (target !== src) {
    copyFileSync(src, target);
    unlinkSync(src);
  }
  entry.path = target;
  entry.dir = routed.dir;
  entry.category = routed.cat ? routed.cat.id : "unknown";
  index.files[digest] = { path: target, name: entry.name || "" };
  moved.push({ name: entry.name, target, category: entry.category });
  if (!routed.matched) unknown.push({ name: entry.name, target });
}

saveJson(STATE_PATH, state);
saveJson(HASH_PATH, index);

// 清理空目录
function prune(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return true;
  }
  let empty = true;
  for (const e of entries) {
    if (e.isDirectory()) {
      if (prune(join(dir, e.name))) {
        try {
          rmdirSync(join(dir, e.name));
        } catch {}
      }
      empty = false;
    } else empty = false;
  }
  return empty;
}
try {
  prune(ROOT);
} catch {}

console.log(JSON.stringify({ moved, missing: missing.map((m) => m.path), unknown }, null, 2));
