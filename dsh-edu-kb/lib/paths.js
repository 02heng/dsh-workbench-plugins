import { isAbsolute, relative, resolve, sep } from "node:path"

export const COLLECTIONS = ["policies", "dictionary", "recipes", "notes"]

export function resolveKbRoot(configRoot) {
	const raw = typeof configRoot === "string" && configRoot.trim() ? configRoot.trim() : "D:/dsh-kb"
	const root = resolve(raw)
	if (!/^[dD]:[\\/]/.test(root)) {
		throw new Error(`知识库必须放在 D 盘，当前配置：${root}`)
	}
	return root
}

export function resolveInside(root, input) {
	if (typeof input !== "string" || !input.trim()) throw new Error("缺少路径")
	const base = resolve(root)
	const target = isAbsolute(input.trim()) ? resolve(input.trim()) : resolve(base, input.trim())
	const rel = relative(base, target)
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(`路径必须位于知识库内：${base}`)
	}
	return target
}

export function toPosix(relPath) {
	return relPath.split(sep).join("/")
}
