import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative } from "node:path"
import { COLLECTIONS, resolveInside, toPosix } from "./paths.js"

const SEEDS = [
	{
		collection: "policies",
		file: "信息安全管理制度-模板.md",
		title: "信息安全管理制度（模板）",
		tags: ["制度", "安全"],
		body: `这是空白模板，不是本校已发布制度。把正式文本贴进来后保存。

## 适用范围

- 待填：适用部门、系统、人员

## 要点

- 账号与权限
- 数据分级与脱敏
- 机房与终端
- 事件报告

## 依据

- 待补文号，不要编造政策
`,
	},
	{
		collection: "dictionary",
		file: "学校数据字典-模板.md",
		title: "学校数据字典（模板）",
		tags: ["字典", "学籍", "成绩"],
		body: `字段口径先写在这里，检索学校数据时先查本篇。

| 字段 | 含义 | 取值 | 注意 |
|---|---|---|---|
| 学号 | 待填 | 待填 | 不要把真实学号写进示例 |
| 班级 | 待填 | 如 高一1班 | |
| 学期 | 待填 | 如 2025-2026-1 | |
`,
	},
	{
		collection: "recipes",
		file: "常用检索口径-模板.md",
		title: "常用检索口径（模板）",
		tags: ["检索", "成绩", "资产"],
		body: `## 成绩汇总

- 输入：学期、年级、科目
- 输出：班级均分、及格率
- 敏感：按班汇总，不在对话里展开全员名单

## 资产盘点

- 输入：房间/机柜
- 输出：设备清单
- 设备详情走 dc_inventory_*，不要在这里编造 IP
`,
	},
	{
		collection: "notes",
		file: "入库说明.md",
		title: "知识库怎么用",
		tags: ["说明"],
		body: `用 kb_search 找，kb_read 读全文，kb_write 写入。

分类：
- policies 制度
- dictionary 数据字典
- recipes 检索口径
- notes 备忘

机房台账不写在这里，用 dc_inventory_*。
`,
	},
]

function parseFrontmatter(raw) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
	if (!match) return { meta: {}, body: raw }
	const meta = {}
	for (const line of match[1].split(/\r?\n/)) {
		const idx = line.indexOf(":")
		if (idx < 1) continue
		const key = line.slice(0, idx).trim()
		let value = line.slice(idx + 1).trim()
		if (value.startsWith("[") && value.endsWith("]")) {
			try { value = JSON.parse(value.replace(/'/g, '"')) } catch { /* keep string */ }
		}
		meta[key] = value
	}
	return { meta, body: match[2].trim() }
}

function renderDoc({ title, collection, tags, body }) {
	const tagJson = JSON.stringify(tags ?? [])
	return `---\ntitle: ${title}\ncollection: ${collection}\ntags: ${tagJson}\n---\n\n${body.trim()}\n`
}

export async function ensureKb(root) {
	await mkdir(root, { recursive: true })
	for (const name of COLLECTIONS) {
		await mkdir(join(root, name), { recursive: true })
	}
	for (const seed of SEEDS) {
		const path = join(root, seed.collection, seed.file)
		try {
			await stat(path)
		} catch {
			await writeFile(path, renderDoc(seed), "utf8")
		}
	}
}

async function walkMarkdown(dir, acc = []) {
	let entries
	try {
		entries = await readdir(dir, { withFileTypes: true })
	} catch {
		return acc
	}
	for (const entry of entries) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			await walkMarkdown(full, acc)
			continue
		}
		if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) acc.push(full)
	}
	return acc
}

export async function listDocs(root, collection) {
	const dirs = collection ? [join(root, collection)] : COLLECTIONS.map((name) => join(root, name))
	const files = []
	for (const dir of dirs) files.push(...await walkMarkdown(dir))
	const docs = []
	for (const file of files) {
		const raw = await readFile(file, "utf8")
		const { meta, body } = parseFrontmatter(raw)
		docs.push({
			path: toPosix(relative(root, file)),
			title: String(meta.title ?? basename(file, ".md")),
			collection: String(meta.collection ?? basename(dirname(file))),
			tags: Array.isArray(meta.tags) ? meta.tags : [],
			bytes: Buffer.byteLength(raw, "utf8"),
			preview: body.slice(0, 160),
		})
	}
	return docs.sort((a, b) => a.path.localeCompare(b.path, "zh"))
}

export async function readDoc(root, relPath) {
	const file = resolveInside(root, relPath)
	const raw = await readFile(file, "utf8")
	const { meta, body } = parseFrontmatter(raw)
	return {
		path: toPosix(relative(root, file)),
		title: String(meta.title ?? basename(file, ".md")),
		collection: String(meta.collection ?? ""),
		tags: Array.isArray(meta.tags) ? meta.tags : [],
		body,
	}
}

export async function writeDoc(root, { collection, path, title, tagsJson, body }) {
	if (!COLLECTIONS.includes(collection)) {
		throw new Error(`collection 必须是 ${COLLECTIONS.join(" / ")}`)
	}
	if (typeof body !== "string" || !body.trim()) throw new Error("body 不能为空")
	const rel = path?.trim()
		? path.trim().replace(/\\/g, "/")
		: `${collection}/${String(title || "未命名").replace(/[\\/:*?"<>|]/g, "_")}.md`
	const file = resolveInside(root, rel)
	await mkdir(dirname(file), { recursive: true })
	const tags = tagsJson ? JSON.parse(tagsJson) : []
	await writeFile(file, renderDoc({
		title: title || basename(file, ".md"),
		collection,
		tags: Array.isArray(tags) ? tags : [],
		body,
	}), "utf8")
	return { path: toPosix(relative(root, file)), collection }
}

export async function searchDocs(root, query, collection, limit = 8) {
	const q = String(query ?? "").trim().toLowerCase()
	if (!q) throw new Error("query 不能为空")
	const terms = q.split(/\s+/).filter(Boolean)
	const docs = await listDocs(root, collection)
	const scored = []
	for (const doc of docs) {
		const full = await readDoc(root, doc.path)
		const hay = `${full.title}\n${full.tags.join(" ")}\n${full.body}`.toLowerCase()
		let score = 0
		for (const term of terms) {
			if (full.title.toLowerCase().includes(term)) score += 5
			if (hay.includes(term)) score += 1
		}
		if (score <= 0) continue
		const idx = hay.indexOf(terms[0])
		const snippet = full.body.replace(/\s+/g, " ").slice(Math.max(0, idx - 40), idx + 160)
		scored.push({ ...doc, score, snippet })
	}
	return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}
