import { access } from "node:fs/promises"
import { isAbsolute, resolve, sep } from "node:path"

export function sessionCwd(agent) {
	const cwd = agent?.session?.header?.cwd
	return typeof cwd === "string" && cwd.length > 0 ? cwd : process.cwd()
}

export function resolveInsideWorkspace(cwd, input) {
	if (typeof input !== "string" || !input.trim()) {
		throw new Error("缺少文件路径")
	}
	const root = resolve(cwd)
	const target = isAbsolute(input.trim()) ? resolve(input.trim()) : resolve(root, input.trim())
	const rootPrefix = root.toLowerCase()
	const targetPrefix = target.toLowerCase()
	if (targetPrefix !== rootPrefix && !targetPrefix.startsWith(rootPrefix + sep.toLowerCase())) {
		throw new Error(`路径必须位于当前工作区内：${root}`)
	}
	return target
}

export async function ensureExists(path) {
	await access(path)
	return path
}

export function parseJson(label, raw, fallback) {
	if (raw === undefined || raw === null || raw === "") return fallback
	if (typeof raw !== "string") return raw
	try {
		return JSON.parse(raw)
	} catch {
		throw new Error(`${label} 不是合法 JSON`)
	}
}
