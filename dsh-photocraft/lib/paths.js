// dsh-photocraft 路径与文件工具：工作目录、时间戳命名、文件名消毒、唯一化、输入收集。
// 只用 node: 内建模块，不引入任何依赖。
import { constants as FS } from "node:fs"
import { access, copyFile, mkdir, readdir, rename, stat } from "node:fs/promises"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT_WORK_ROOT = "D:/dsh-workbench/photocraft"
export const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif"]
const IMAGE_SET = new Set(IMAGE_EXTS)
const FORMAT_SET = new Set(["png", "jpg", "jpeg", "webp", "psd", "tif", "tiff", "bmp"])
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

// lib/ 的上一级就是插件根目录（sidecar/ 与 lib/ 同级）。
export const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)))

export function toPosix(value) {
	return String(value ?? "").replace(/\\/g, "/")
}

/**
 * 统一的日志出口。兼容两种调用方：
 * - cordis logger（有 info/warn 方法）
 * - 网页端 http.js 传进来的普通函数 logger(line)
 */
export function emitLog(logger, level, text) {
	if (!logger) return
	if (typeof logger === "function") {
		try { logger(String(text)) } catch { /* 日志失败不影响主流程 */ }
		return
	}
	const fn = logger[level] ?? logger.info ?? logger.log
	if (typeof fn === "function") {
		try { fn.call(logger, String(text)) } catch { /* 同上 */ }
	}
}

/** 决议工作根目录：config.workRoot 优先，其次默认 D:/dsh-workbench/photocraft。 */
export function resolveWorkRoot(config = {}) {
	const raw = typeof config?.workRoot === "string" && config.workRoot.trim() ? config.workRoot : DEFAULT_WORK_ROOT
	return toPosix(resolve(toPosix(raw)))
}

/** sidecar 脚本绝对路径；config.sidecarDir 可覆盖。 */
export function sidecarScript(name, config = {}) {
	const dir = typeof config?.sidecarDir === "string" && config.sidecarDir.trim()
		? resolve(toPosix(config.sidecarDir))
		: join(PLUGIN_ROOT, "sidecar")
	return join(dir, name)
}

export function timestamp(date = new Date()) {
	const pad = (value) => String(value).padStart(2, "0")
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/** Windows 文件名消毒：去掉非法字符与首尾点/空格，规避保留名，限制长度。 */
export function sanitizeName(name, fallback = "image") {
	let out = String(name ?? "")
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[.\s]+|[.\s]+$/g, "")
	if (!out) out = fallback
	if (RESERVED.test(out)) out = "_" + out
	if (out.length > 80) out = out.slice(0, 80)
	return out
}

export function baseNameOf(file) {
	const base = String(file ?? "").split(/[\\/]/).pop() ?? ""
	const ext = extname(base)
	return ext ? base.slice(0, -ext.length) : base
}

export function isImagePath(file) {
	return IMAGE_SET.has(extname(String(file ?? "")).toLowerCase())
}

/** format -> 扩展名（.png/.jpg/...），非法格式直接报错。 */
export function formatExt(format = "png") {
	const value = String(format || "png").toLowerCase().replace(/^\./, "")
	if (!FORMAT_SET.has(value)) {
		throw new Error(`不支持的输出格式：${format}（可用 png / jpg / webp / psd / tif）`)
	}
	return value === "jpeg" ? ".jpg" : "." + value
}

export async function exists(target) {
	try {
		await access(target, FS.F_OK)
		return true
	} catch {
		return false
	}
}

export async function ensureDir(dir) {
	await mkdir(dir, { recursive: true })
	return toPosix(dir)
}

/** 在 dir 下给 base+ext 找一个不覆盖已存在文件的名字（base.png -> base-1.png -> base-2.png）。 */
export async function uniqueFile(dir, base, ext) {
	const safe = sanitizeName(base)
	let candidate = join(dir, safe + ext)
	if (!(await exists(candidate))) return toPosix(candidate)
	for (let i = 1; i < 1000; i++) {
		candidate = join(dir, `${safe}-${i}${ext}`)
		if (!(await exists(candidate))) return toPosix(candidate)
	}
	throw new Error(`输出目录里同名文件过多：${dir}`)
}

/** 新建 <workRoot>/<yyyyMMdd-HHmmss>-<kind>/，已存在则追加 -2/-3。 */
export async function newJobDir(workRoot, kind = "job") {
	const stamp = timestamp()
	const safeKind = sanitizeName(kind, "job")
	let dir = join(workRoot, `${stamp}-${safeKind}`)
	for (let i = 2; await exists(dir); i++) dir = join(workRoot, `${stamp}-${safeKind}-${i}`)
	await ensureDir(dir)
	return toPosix(dir)
}

async function walkImages(dir, recursive, out) {
	const entries = await readdir(dir, { withFileTypes: true })
	for (const entry of entries) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (recursive) await walkImages(full, recursive, out)
			continue
		}
		if (entry.isFile() && isImagePath(entry.name)) out.push(toPosix(full))
	}
	return out
}

/** 输入可以是单文件或目录；目录默认只看第一层，recursive=true 递归。 */
export async function collectInputs(input, { recursive = false } = {}) {
	if (!input || typeof input !== "string") throw new Error("需要 input：单个图片文件或目录")
	const target = toPosix(resolve(toPosix(input)))
	let info
	try {
		info = await stat(target)
	} catch {
		throw new Error(`输入不存在：${target}`)
	}
	if (info.isFile()) {
		if (!isImagePath(target)) throw new Error(`输入不是支持的图片：${target}`)
		return [target]
	}
	if (!info.isDirectory()) throw new Error(`输入既不是文件也不是目录：${target}`)
	const files = (await walkImages(target, recursive, [])).sort()
	if (files.length === 0) throw new Error(`目录里没有可用图片：${target}`)
	return files
}

/**
 * 统一准备一批任务：
 * - output 是「单文件 + 图片扩展名」时视为精确输出文件，否则视为输出目录。
 * - 没给 output 时新建带时间戳的作业目录。
 */
export async function prepareJob({ kind, input, output, recursive = false, workRoot, ext }) {
	const files = await collectInputs(input, { recursive })
	const outRaw = output ? toPosix(resolve(toPosix(output))) : ""
	const asFile = files.length === 1 && outRaw !== "" && IMAGE_SET.has(extname(outRaw).toLowerCase())
	const dir = asFile ? dirname(outRaw) : outRaw || await newJobDir(workRoot, kind)
	await ensureDir(dir)
	return { files, dir: toPosix(dir), singleFile: asFile ? outRaw : null, ext }
}

/** 单个输入对应的输出路径：显式单文件输出时用它本身（已存在则加序号），否则在作业目录里唯一化。 */
export async function outputPathFor(job, file, ext) {
	if (job.singleFile) {
		if (!(await exists(job.singleFile))) return job.singleFile
		const base = baseNameOf(job.singleFile)
		const dir = dirname(job.singleFile)
		const targetExt = extname(job.singleFile) || ext
		return uniqueFile(dir, base, targetExt)
	}
	return uniqueFile(job.dir, baseNameOf(file), ext)
}

/** batch 的输出搬到最终位置（跨盘时退化为复制）。 */
export async function relocate(from, to) {
	await ensureDir(dirname(to))
	try {
		await rename(from, to)
	} catch {
		await copyFile(from, to)
	}
	return toPosix(to)
}
