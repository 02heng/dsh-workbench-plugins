import { rm, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { spawn } from "node:child_process"

export const KEYS_NAME = "wx-keys.json"
export const CACHE_NAME = "wx-cache"
const HEX64 = /^[0-9a-fA-F]{64}$/

export function keysPath(root) {
	return join(root, KEYS_NAME)
}

export function cachePath(root) {
	return join(root, CACHE_NAME)
}

export async function fileKeysStatus(root) {
	try {
		const raw = await readFile(keysPath(root), "utf8")
		const data = JSON.parse(raw)
		if (!data || typeof data !== "object" || Array.isArray(data)) return "invalid"
		const values = Object.values(data)
		if (!values.length) return "invalid"
		for (const value of values) {
			if (typeof value !== "string" || !HEX64.test(value)) return "invalid"
		}
		return "ready"
	} catch (error) {
		if (error?.code === "ENOENT") return "missing"
		return "invalid"
	}
}

export async function readKeysStatus(root, config = {}) {
	if (config.keysStatus === "collecting") {
		const until = Number(config.keysCollectUntil || 0)
		if (until && Date.now() < until) return "collecting"
	}
	return fileKeysStatus(root)
}

export async function clearKeyFiles(root) {
	await rm(keysPath(root), { force: true })
	await rm(cachePath(root), { recursive: true, force: true })
	try { await stat(join(root, "inbox.jsonl")) } catch { /* inbox may not exist */ }
	return { ok: true }
}

export function collectCommand(opts = {}) {
	const python = opts.python
	const script = opts.script
	const cwd = opts.cwd
	if (!python || !script || !cwd) throw new Error("采集脚本未配置")
	const args = [script, "--collect"].map((item) => `'${String(item).replace(/'/g, "''")}'`).join(",")
	return `Start-Process -FilePath ${JSON.stringify(python)} -WorkingDirectory ${JSON.stringify(cwd)} -ArgumentList ${args} -Verb RunAs`
}

export function launchCollect(opts = {}) {
	const child = spawn("powershell.exe", ["-NoProfile", "-Command", collectCommand(opts)], {
		windowsHide: true,
		stdio: "ignore",
	})
	return { ok: true, pid: child.pid }
}
