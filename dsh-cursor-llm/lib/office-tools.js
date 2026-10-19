import { mkdir, readdir, readFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"

export const CURSOR_TOOLS = ["read", "edit", "ls", "mcp", "webSearch", "webFetch"]

const WORK_ROOT = "D:/dsh-workbench"
const KB_ROOT = "D:/dsh-kb"
const DOCS_ROOT = "D:/dsh-workbench/docs"
const SKIP = new Set(["node_modules", ".git", ".dsh", "shots", "wx-cache"])

async function loadOffice() {
	const word = await import(pathToFileURL("D:/dsh-plugins/dsh-office/lib/word.js").href)
	const excel = await import(pathToFileURL("D:/dsh-plugins/dsh-office/lib/excel.js").href)
	const paths = await import(pathToFileURL("D:/dsh-plugins/dsh-office/lib/paths.js").href)
	const inbox = await import(pathToFileURL("D:/dsh-plugins/dsh-office/lib/inbox.js").href)
	return { ...word, ...excel, ...paths, ...inbox }
}

async function loadKb() {
	return import(pathToFileURL("D:/dsh-plugins/dsh-edu-kb/lib/store.js").href)
}

async function loadCraft() {
	const store = await import(pathToFileURL("D:/dsh-plugins/dsh-craft/lib/store.js").href)
	return store
}

function paragraphsFrom(body, paragraphsJson) {
	if (paragraphsJson !== undefined && paragraphsJson !== null && paragraphsJson !== "") {
		const parsed = typeof paragraphsJson === "string" ? JSON.parse(paragraphsJson) : paragraphsJson
		if (!Array.isArray(parsed)) throw new Error("paragraphsJson 必须是数组")
		return parsed.map((item) => String(item))
	}
	if (typeof body === "string" && body.trim()) {
		return body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
	}
	throw new Error("请提供 body 或 paragraphsJson")
}

function rowsFrom(rowsJson) {
	if (rowsJson === undefined || rowsJson === null || rowsJson === "") return []
	const parsed = typeof rowsJson === "string" ? JSON.parse(rowsJson) : rowsJson
	if (!Array.isArray(parsed)) throw new Error("rowsJson 必须是数组")
	return parsed
}

function assertAllowedRoot(input) {
	const target = resolve(String(input || ""))
	const allowed = [WORK_ROOT, KB_ROOT].map((root) => resolve(root).toLowerCase())
	const lower = target.toLowerCase()
	if (!allowed.some((root) => lower === root || lower.startsWith(root + sep.toLowerCase()))) {
		throw new Error("路径必须位于 D:/dsh-workbench 或 D:/dsh-kb")
	}
	return target
}

function globToRegExp(pattern) {
	const normalized = String(pattern || "**/*").replace(/\\/g, "/")
	const escaped = normalized
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, "{{GLOBSTAR}}")
		.replace(/\*/g, "[^/]*")
		.replace(/{{GLOBSTAR}}/g, ".*")
	return new RegExp(`^${escaped}$`, "i")
}

async function walkFiles(dir, depth, acc) {
	if (depth > 8) return
	let entries
	try {
		entries = await readdir(dir, { withFileTypes: true })
	} catch {
		return
	}
	for (const ent of entries) {
		if (ent.name.startsWith(".") || SKIP.has(ent.name)) continue
		const full = join(dir, ent.name)
		if (ent.isDirectory()) {
			await walkFiles(full, depth + 1, acc)
			continue
		}
		if (ent.isFile()) acc.push(full)
	}
}

export function officeCustomTools(cwd = WORK_ROOT) {
	const root = cwd || WORK_ROOT
	return {
		office_word_write: {
			description: "在工作区生成 .docx。body 用空行分段，或用 paragraphsJson 传字符串数组。",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "输出 docx 路径" },
					title: { type: "string", description: "文档标题" },
					body: { type: "string", description: "正文，空行分段" },
					paragraphsJson: { type: "string", description: "段落 JSON 数组" },
				},
				required: ["path"],
			},
			async execute(args) {
				const office = await loadOffice()
				const path = office.resolveInsideWorkspace(root, String(args.path ?? ""))
				const paragraphs = paragraphsFrom(args.body, args.paragraphsJson)
				await mkdir(dirname(path), { recursive: true })
				return office.writeWord(path, args.title, paragraphs)
			},
		},
		office_excel_write: {
			description: "在工作区生成 .xlsx。rowsJson 为二维数组或对象数组。",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "输出 xlsx 路径" },
					sheet: { type: "string", description: "工作表名" },
					headersJson: { type: "string", description: "表头 JSON 数组" },
					rowsJson: { type: "string", description: "行 JSON 数组" },
				},
				required: ["path"],
			},
			async execute(args) {
				const office = await loadOffice()
				const path = office.resolveInsideWorkspace(root, String(args.path ?? ""))
				const headers = args.headersJson
					? (typeof args.headersJson === "string" ? JSON.parse(args.headersJson) : args.headersJson)
					: []
				await mkdir(dirname(path), { recursive: true })
				return office.writeExcel(path, args.sheet, headers, rowsFrom(args.rowsJson))
			},
		},
		docs_list: {
			description: "列出文档收件箱已解析文稿。",
			inputSchema: { type: "object", properties: {} },
			async execute() {
				const office = await loadOffice()
				const index = await office.loadIndex(DOCS_ROOT)
				return { root: DOCS_ROOT, docs: index.docs }
			},
		},
		docs_read: {
			description: "读取收件箱一份文档的解析文本。id 来自 docs_list。",
			inputSchema: {
				type: "object",
				properties: { id: { type: "string", description: "文档 id" } },
				required: ["id"],
			},
			async execute(args) {
				const office = await loadOffice()
				return office.readParsed(DOCS_ROOT, String(args.id ?? ""))
			},
		},
		kb_list: {
			description: "列出知识库文档。分类 policies / dictionary / recipes / notes。",
			inputSchema: {
				type: "object",
				properties: { collection: { type: "string", description: "可选分类" } },
			},
			async execute(args) {
				const kb = await loadKb()
				await kb.ensureKb(KB_ROOT)
				return { root: KB_ROOT, docs: await kb.listDocs(KB_ROOT, args.collection) }
			},
		},
		kb_search: {
			description: "在 D:/dsh-kb 按关键词检索。回答学校口径前先搜，不要编造文号。",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "关键词，如 平谷 学科" },
					collection: { type: "string", description: "可选分类" },
					limit: { type: "number", description: "最多条数" },
				},
				required: ["query"],
			},
			async execute(args) {
				const kb = await loadKb()
				await kb.ensureKb(KB_ROOT)
				return {
					root: KB_ROOT,
					query: args.query,
					hits: await kb.searchDocs(KB_ROOT, String(args.query ?? ""), args.collection, args.limit),
				}
			},
		},
		kb_read: {
			description: "读取知识库一篇 Markdown。path 来自 kb_list / kb_search。",
			inputSchema: {
				type: "object",
				properties: { path: { type: "string", description: "相对 D:/dsh-kb 的路径" } },
				required: ["path"],
			},
			async execute(args) {
				const kb = await loadKb()
				await kb.ensureKb(KB_ROOT)
				return kb.readDoc(KB_ROOT, String(args.path ?? ""))
			},
		},
		craft_search: {
			description: "在知识库和已解析文稿里检索。",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "自然语言或关键词" },
					limit: { type: "number", description: "最多条数" },
				},
				required: ["query"],
			},
			async execute(args) {
				const craft = await loadCraft()
				return {
					hits: await craft.searchRoots(
						[KB_ROOT, join(DOCS_ROOT, "parsed")],
						String(args.query ?? ""),
						args.limit,
					),
				}
			},
		},
		craft_task: {
			description: "把 D 盘成品挂到任务卡，方便微信回文件。",
			inputSchema: {
				type: "object",
				properties: {
					id: { type: "string", description: "任务编号，如 T-0817-04" },
					filesJson: { type: "string", description: "D 盘文件路径 JSON 数组" },
				},
				required: ["id", "filesJson"],
			},
			async execute(args) {
				const craft = await loadCraft()
				const store = craft.createCraftStore("D:/dsh-workbench/craft")
				const files = typeof args.filesJson === "string" ? JSON.parse(args.filesJson) : args.filesJson
				if (!Array.isArray(files)) throw new Error("filesJson 必须是数组")
				return store.bindFiles(String(args.id ?? ""), files)
			},
		},
		workspace_glob: {
			description: "按 glob 列出 D:/dsh-workbench 或 D:/dsh-kb 下的文件。不要用 Cursor 自带 grep/glob（本机 ripgrep 不可用）。",
			inputSchema: {
				type: "object",
				properties: {
					pattern: { type: "string", description: "如 **/*.md" },
					root: { type: "string", description: "默认 D:/dsh-workbench" },
				},
			},
			async execute(args) {
				const base = assertAllowedRoot(args.root || root)
				const rx = globToRegExp(args.pattern || "**/*")
				const files = []
				await walkFiles(base, 0, files)
				const matched = files
					.map((file) => file.replace(/\\/g, "/"))
					.filter((file) => rx.test(file) || rx.test(relative(base, file).replace(/\\/g, "/")))
					.slice(0, 80)
				return { root: base, files: matched }
			},
		},
		workspace_grep: {
			description: "在 D:/dsh-workbench 或 D:/dsh-kb 的文本文件里搜关键词。不要用 Cursor 自带 grep。",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "关键词" },
					root: { type: "string", description: "默认 D:/dsh-kb" },
				},
				required: ["query"],
			},
			async execute(args) {
				const q = String(args.query ?? "").trim()
				if (!q) throw new Error("query 不能为空")
				const base = assertAllowedRoot(args.root || KB_ROOT)
				const files = []
				await walkFiles(base, 0, files)
				const hits = []
				const needle = q.toLowerCase()
				for (const file of files) {
					if (!/\.(md|txt|json|csv|js|mjs)$/i.test(file)) continue
					let text = ""
					try { text = await readFile(file, "utf8") } catch { continue }
					const idx = text.toLowerCase().indexOf(needle)
					if (idx < 0) continue
					hits.push({
						path: file.replace(/\\/g, "/"),
						snippet: text.replace(/\s+/g, " ").slice(Math.max(0, idx - 40), idx + 160),
					})
					if (hits.length >= 30) break
				}
				return { root: base, query: q, hits }
			},
		},
	}
}
