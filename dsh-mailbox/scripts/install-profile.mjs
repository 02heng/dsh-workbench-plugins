// 把 dsh-mailbox 装进指定 DSH profile：dependencies link + bundles 追加 + node_modules junction。
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PLUGIN_NAME = "dsh-mailbox";
const PLUGIN_DIR = "D:/dsh-plugins/dsh-mailbox";
const PROFILES_ROOT = "C:/Users/HY/.dsh/profiles";
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const targets = argv.filter((item) => !item.startsWith("-"));
const list = targets.length ? targets : ["desktop", "web"];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function junction(source, target) {
  const win = (value) => value.replaceAll("/", "\\");
  execFileSync("cmd", ["/c", "mklink", "/J", win(target), win(source)], { stdio: "pipe" });
}

for (const target of list) {
  const dir = join(PROFILES_ROOT, target);
  const manifestPath = join(dir, "package.json");
  if (!existsSync(manifestPath)) {
    console.log("跳过 " + target + "：没有 package.json");
    continue;
  }
  const original = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(original);
  manifest.dependencies = manifest.dependencies || {};
  const before = manifest.dependencies[PLUGIN_NAME];
  manifest.dependencies[PLUGIN_NAME] = "link:" + PLUGIN_DIR;
  manifest.dsh = manifest.dsh || {};
  manifest.dsh.profile = manifest.dsh.profile || {};
  const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : [];
  const hasBundle = bundles.includes(PLUGIN_NAME);
  if (!hasBundle) bundles.push(PLUGIN_NAME);
  manifest.dsh.profile.bundles = bundles;
  const next = JSON.stringify(manifest, null, 2) + "\n";

  const linkPath = join(dir, "node_modules", PLUGIN_NAME);
  const existing = statSync(linkPath, { throwIfNoEntry: false });
  const linkOk = Boolean(existing && existing.isDirectory());

  if (dryRun) {
    console.log("[dry-run] " + target + "：dependencies=" + (before ?? "(none)") + " → link:" + PLUGIN_DIR
      + "；bundles " + (hasBundle ? "已有" : "追加") + "；junction " + (linkOk ? "已存在" : "待建"));
    continue;
  }

  if (next !== original) {
    const backup = manifestPath + ".bak-mailbox-" + stamp;
    copyFileSync(manifestPath, backup);
    writeFileSync(manifestPath, next, "utf8");
    console.log(target + "：manifest 已更新（备份 " + backup + "）");
  } else {
    console.log(target + "：manifest 已是目标状态");
  }

  if (!linkOk) {
    junction(PLUGIN_DIR, linkPath);
    console.log(target + "：已建 junction → " + PLUGIN_DIR);
  } else {
    console.log(target + "：junction 已存在 " + linkPath);
  }
  const patch = join(linkPath, "cordis.patch.yml");
  console.log(target + "：bundle patch " + (existsSync(patch) ? "可读 " + patch : "缺失！"));
}
