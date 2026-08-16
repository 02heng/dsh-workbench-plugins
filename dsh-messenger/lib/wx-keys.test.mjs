import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileKeysStatus, readKeysStatus, clearKeyFiles, collectCommand } from "./wx-keys.js"

const root = "D:/dsh-workbench/messenger/_test-wx-keys-js"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

if (await fileKeysStatus(root) !== "missing") fail("missing")
await writeFile(join(root, "wx-keys.json"), "nope", "utf8")
if (await fileKeysStatus(root) !== "invalid") fail("invalid")
await writeFile(join(root, "wx-keys.json"), JSON.stringify({ "contact/contact.db": "ab".repeat(32) }), "utf8")
if (await fileKeysStatus(root) !== "ready") fail("ready")
const collecting = await readKeysStatus(root, { keysStatus: "collecting", keysCollectUntil: Date.now() + 5000 })
if (collecting !== "collecting") fail("collecting")
await mkdir(join(root, "wx-cache"), { recursive: true })
await writeFile(join(root, "wx-cache", "x.bin"), "x")
await writeFile(join(root, "inbox.jsonl"), "{}\n", "utf8")
await clearKeyFiles(root)
if (await fileKeysStatus(root) !== "missing") fail("cleared")
try {
	await writeFile(join(root, "inbox.jsonl"), "{}\n", "utf8")
} catch { fail("inbox vanished") }
const raw = JSON.stringify({ a: "ab".repeat(32) })
if (raw.includes("keysStatus")) fail("must not invent status in file")
const cmd = collectCommand({
	python: "D:/dsh-plugins/dsh-messenger/sidecar/.venv/Scripts/python.exe",
	script: "D:/dsh-plugins/dsh-messenger/sidecar/weixin_keys.py",
	cwd: "D:/dsh-plugins/dsh-messenger/sidecar",
})
if (!cmd.includes("RunAs") || !cmd.includes("--collect")) fail(`collect cmd ${cmd}`)
await rm(root, { recursive: true, force: true })
console.log("PASS wx-keys")
