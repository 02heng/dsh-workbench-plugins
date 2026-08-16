import { access } from "node:fs/promises"
import { extname, isAbsolute, resolve, sep } from "node:path"

export const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]

export function isImagePath(path) {
	return IMAGE_EXT.includes(extname(String(path ?? "")).toLowerCase())
}

export function mimeFor(path) {
	switch (extname(String(path ?? "")).toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg"
		case ".webp":
			return "image/webp"
		case ".gif":
			return "image/gif"
		case ".bmp":
			return "image/bmp"
		default:
			return "image/png"
	}
}

export function mustBeOnD(path, label = "图片") {
	const target = resolve(String(path ?? ""))
	if (!/^[dD]:[\\/]/.test(target)) {
		throw new Error(`${label}必须在 D 盘：${target}`)
	}
	return target
}

export function resolveOnD(cwd, input) {
	if (typeof input !== "string" || !input.trim()) throw new Error("缺少图片路径")
	const target = isAbsolute(input.trim()) ? resolve(input.trim()) : resolve(cwd || "D:/dsh-workbench", input.trim())
	return mustBeOnD(target)
}

export async function ensureFile(path) {
	await access(path)
	return path
}

export function sameTree(root, target) {
	const base = resolve(root).toLowerCase()
	const file = resolve(target).toLowerCase()
	return file === base || file.startsWith(base + sep.toLowerCase())
}
