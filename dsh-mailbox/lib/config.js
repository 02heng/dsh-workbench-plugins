import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

export const CONFIG_FILE = "config.json";
export const SECRET_FILE = "secret.json";
export const STATE_FILE = "state.json";

export const DEFAULT_CONFIG = {
  version: 1,
  mailbox: {
    address: "example@126.com",
    imapHost: "imap.126.com",
    imapPort: 993,
    smtpHost: "smtp.126.com",
    smtpPort: 465,
    folder: "INBOX",
    markSeen: true,
  },
  paths: {
    archiveRoot: "E:/桌面/办公文件/办公文档/2026年/10月",
    incomingDir: "",
  },
  naming: {
    template: "{学校}－{姓名}－{学段}－{学科}－{课例名称}",
    separator: "－",
    archiveTemplate: "{学校名称}－{事项}",
  },
  unpack: {
    toSameNameFolder: true,
    keepArchive: true,
    gbkFallback: true,
    flattenSingle: true,
    maxMB: 800,
    maxFiles: 600,
  },
  rules: [],
  fallbackTarget: "inbox/待人工",
  schedule: {
    enabled: true,
    times: ["08:30", "17:00"],
    runOnReady: true,
    minGapMinutes: 15,
  },
  notify: { onFinish: true },
  pii: { maskMobile: true, maskIdCard: true },
  fetch: { maxPerRun: 40, onlyUnseen: false },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeDeep(base, patch) {
  if (!isPlainObject(patch)) return Array.isArray(patch) ? patch.slice() : patch;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) { delete out[key]; continue; }
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeDeep(out[key], value) : value;
  }
  return out;
}

export function ensureRoot(root) {
  return mkdir(root, { recursive: true });
}

export async function readJson(file, fallback) {
  try {
    const text = await readFile(file, "utf8");
    return JSON.parse(text.replace(/^\uFEFF/, "")) ?? fallback;
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await mkdir(join(file, ".."), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

export async function loadConfig(root) {
  const raw = await readJson(join(root, CONFIG_FILE), {});
  const merged = mergeDeep(DEFAULT_CONFIG, raw);
  if (!Array.isArray(merged.rules)) merged.rules = [];
  return merged;
}

export async function saveConfig(root, config) {
  await ensureRoot(root);
  const clean = { ...config };
  delete clean.__secret;
  await writeJson(join(root, CONFIG_FILE), clean);
  return clean;
}

export async function loadSecret(root) {
  return readJson(join(root, SECRET_FILE), {});
}

export async function saveSecret(root, secret) {
  await ensureRoot(root);
  const merged = mergeDeep(await loadSecret(root), secret);
  await writeJson(join(root, SECRET_FILE), merged);
  return merged;
}

export async function loadState(root) {
  return readJson(join(root, STATE_FILE), {});
}

export async function saveState(root, state) {
  await ensureRoot(root);
  await writeJson(join(root, STATE_FILE), state);
}

export function redactConfig(config, secret = {}) {
  return {
    ...config,
    mailbox: { ...config.mailbox, password: secret.password ? "******" : "", hasPassword: Boolean(secret.password) },
  };
}

export function publicStatus(config, secret, state) {
  const configured = Boolean(secret.password) && Boolean(config?.mailbox?.address);
  return {
    configured,
    address: config?.mailbox?.address ?? "",
    imap: `${config?.mailbox?.imapHost ?? ""}:${config?.mailbox?.imapPort ?? 993}`,
    smtp: `${config?.mailbox?.smtpHost ?? ""}:${config?.mailbox?.smtpPort ?? 465}`,
    rules: (config?.rules ?? []).length,
    archiveRoot: config?.paths?.archiveRoot ?? "",
    schedule: config?.schedule ?? {},
    lastRunAt: state?.lastRunAt ?? "",
    lastRunResult: state?.lastRunResult ?? null,
    lastUid: state?.imap?.lastUid ?? 0,
  };
}

export function addRule(config, rule) {
  const id = String(rule?.id ?? "").trim() || `rule-${Date.now()}`;
  const next = { ...rule, id, enabled: rule?.enabled !== false };
  const index = (config.rules ?? []).findIndex((item) => item.id === id);
  const rules = Array.isArray(config.rules) ? config.rules.slice() : [];
  if (index >= 0) rules[index] = { ...rules[index], ...next }; else rules.push(next);
  return { ...config, rules };
}
