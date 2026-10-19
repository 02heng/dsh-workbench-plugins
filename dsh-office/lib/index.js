import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { readExcel, writeExcel } from "./excel.js"
import { ingestExisting, loadIndex, readParsed, resolveDocsRoot, toKb } from "./inbox.js"
import { registerInbox } from "./inbox-http.js"
import {
	hasOfficeWriteCall,
	lastRoleText,
	materializeFromTurn,
	parseOfficeFence,
	slugName,
	wantsDocument,
} from "./materialize.js"
import { parseJson, resolveInsideWorkspace, sessionCwd } from "./paths.js"
import { readPpt, writePpt } from "./ppt.js"
import { readWord, writeWord } from "./word.js"

export const name = "dsh-office"
export const inject = ["tools"]
export const Config = z.object({
	docsRoot: z.string().default("D:/dsh-workbench/docs"),
	kbRoot: z.string().default("D:/dsh-kb"),
})

function asText(value) {
	return [{ type: "text", text: JSON.stringify(value, null, 2) }]
}

function paragraphsFromBody(body, paragraphsJson) {
	if (paragraphsJson !== undefined) {
		const parsed = parseJson("paragraphsJson", paragraphsJson, [])
		if (!Array.isArray(parsed)) throw new Error("paragraphsJson 必须是字符串数组")
		return parsed.map((item) => String(item))
	}
	if (typeof body === "string" && body.trim()) {
		return body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
	}
	throw new Error("请提供 body 或 paragraphsJson")
}

/**
 * @param {import("@deepseek-ai/cordis").Context} ctx
 */
export function apply(ctx, config = {}) {
	const docsRoot = resolveDocsRoot(config.docsRoot)
	const kbRoot = String(config.kbRoot ?? "D:/dsh-kb")
	ctx.tools.register(defineTool({
		name: "office_excel_read",
		description: "读取工作区内的 .xlsx，返回工作表名和行数据。处理学籍、成绩、资产、课表时用这个，不要自己解析 zip。",
		parameters: {
			path: { type: "string", required: true, description: "相对工作区的 xlsx 路径" },
			sheet: { type: "string", description: "工作表名，默认第一张" },
			maxRows: { type: "number", description: "最多返回行数，默认 500" },
		},
		output: {
			schema: { type: "object", additionalProperties: true },
			render: (_args, value) => asText(value),
		},
		async execute(args, exec) {
			const cwd = sessionCwd(exec.agent)
			const path = resolveInsideWorkspace(cwd, args.path)
			return readExcel(path, args.sheet, args.maxRows)
		},
	}))

	ctx.tools.register(defineTool({
		name: "office_excel_write",
		description: "在工作区写入或覆盖一个 .xlsx。rowsJson 为二维数组，或对象数组（配合 headersJson）。",
		parameters: {
			path: { type: "string", required: true, description: "输出 xlsx 路径" },
			sheet: { type: "string", description: "工作表名，默认 Sheet1" },
			headersJson: { type: "string", description: "表头 JSON 数组，如 [\"姓名\",\"班级\"]" },
			rowsJson: { type: "string", required: true, description: "行数据 JSON，如 [[\"张三\",\"高一1班\"]]" },
		},
		output: {
			schema: { type: "object", additionalProperties: true },
			render: (_args, value) => asText(value),
		},
		async execute(args, exec) {
			const cwd = sessionCwd(exec.agent)
			const path = resolveInsideWorkspace(cwd, args.path)
			const headers = parseJson("headersJson", args.headersJson, undefined)
			const rows = parseJson("rowsJson", args.rowsJson, [])
			if (!Array.isArray(rows)) throw new Error("rowsJson 必须是数组")
			await mkdir(dirname(path), { recursive: true })
			return writeExcel(path, args.sheet, headers, rows)
		},
	}))

	ctx.tools.register(defineTool({
		name: "office_word_read",
		description: "读取工作区内的 .docx 纯文本。",
		parameters: {
			path: { type: "string", required: true, description: "相对工作区的 docx 路径" },
		},
		output: {
			schema: { type: "object", additionalProperties: true },
			render: (_args, value) => asText(value),
		},
		async execute(args, exec) {
			const cwd = sessionCwd(exec.agent)
			return readWord(resolveInsideWorkspace(cwd, args.path))
		},
	}))

	ctx.tools.register(defineTool({
		name: "office_word_write",
		description: "在工作区生成 .docx。body 用空行分段，或用 paragraphsJson 传字符串数组。",
		parameters: {
			path: { type: "string", required: true, description: "输出 docx 路径" },
			title: { type: "string", description: "文档标题" },
			body: { type: "string", description: "正文，空行分段" },
			paragraphsJson: { type: "string", description: "段落 JSON 数组" },
		},
		output: {
			schema: { type: "object", additionalProperties: true },
			render: (_args, value) => asText(value),
		},
		async execute(args, exec) {
			const cwd = sessionCwd(exec.agent)
			const path = resolveInsideWorkspace(cwd, args.path)
			const paragraphs = paragraphsFromBody(args.body, args.paragraphsJson)
			await mkdir(dirname(path), { recursive: true })
			return writeWord(path, args.title, paragraphs)
		},
	}))

	ctx.tools.register(defineTool({
		name: "office_ppt_read",
		description: "提取工作区内 .pptx 各页文本。",
		parameters: {
			path: { type: "string", required: true, description: "相对工作区的 pptx 路径" },
		},
		output: {
			schema: { type: "object", additionalProperties: true },
			render: (_args, value) => asText(value),
		},
		async execute(args, exec) {
			const cwd = sessionCwd(exec.agent)
			return readPpt(resolveInsideWorkspace(cwd, args.path))
		},
	}))

	ctx.tools.register(defineTool({
		name: "office_ppt_write",
		description: "在工作区生成 .pptx。slidesJson 为 [{\"title\":\"页标题\",\"bullets\":[\"要点1\",\"要点2\"]}]",
		parameters: {
			path: { type: "string", required: true, description: "输出 pptx 路径" },
			title: { type: "string", description: "封面标题" },
			slidesJson: { type: "string", required: true, description: "幻灯片 JSON 数组" },
		},
		output: {
			schema: { type: "object", additionalProperties: true },
			render: (_args, value) => asText(value),
		},
		async execute(args, exec) {
			const cwd = sessionCwd(exec.agent)
			const path = resolveInsideWorkspace(cwd, args.path)
			const slides = parseJson("slidesJson", args.slidesJson, [])
			if (!Array.isArray(slides)) throw new Error("slidesJson 必须是数组")
			await mkdir(dirname(path), { recursive: true })
			return writePpt(path, args.title, slides)
		},
	}))

	ctx.tools.register(defineTool({
		name: "docs_list",
		description: "列出工作模式文档收件箱里已上传并解析的文档。界面在 /plugins/dsh-docs/inbox。",
		parameters: {},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute() {
			const index = await loadIndex(docsRoot)
			return { root: docsRoot, inbox: "/plugins/dsh-docs/inbox", docs: index.docs }
		},
	}))

	ctx.tools.register(defineTool({
		name: "docs_read",
		description: "读取收件箱里一份文档的解析文本。id 来自 docs_list。",
		parameters: {
			id: { type: "string", required: true, description: "文档 id，如 doc-xxx" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			return readParsed(docsRoot, args.id)
		},
	}))

	ctx.tools.register(defineTool({
		name: "docs_ingest",
		description: "把 D 盘上已有的文档解析进收件箱。path 必须在当前工作区或 D:\\dsh-workbench。",
		parameters: {
			path: { type: "string", required: true, description: "源文件路径" },
			toKb: { type: "boolean", description: "是否同时写入知识库备忘" },
			collection: { type: "string", description: "policies / dictionary / recipes / notes" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args, exec) {
			const cwd = sessionCwd(exec.agent)
			let file
			try {
				file = resolveInsideWorkspace(cwd, args.path)
			} catch {
				file = resolveInsideWorkspace("D:/dsh-workbench", args.path)
			}
			return ingestExisting(docsRoot, file, {
				toKb: Boolean(args.toKb),
				kbRoot,
				collection: args.collection || "notes",
			})
		},
	}))

	ctx.tools.register(defineTool({
		name: "docs_to_kb",
		description: "把收件箱已解析文档写入 D:\\dsh-kb。不要写入未脱敏的全员成绩或学籍名单。",
		parameters: {
			id: { type: "string", required: true, description: "文档 id" },
			collection: { type: "string", description: "policies / dictionary / recipes / notes，默认 notes" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			return toKb(docsRoot, kbRoot, args.id, args.collection || "notes")
		},
	}))

	const WEB_SERVER_KEYS = ["webServer", "httpServer"]
	// 0.2.1 前后内测两个通道的服务键曾出现 webServer / httpServer 两种命名（参照生态
	// dsh-agent-teams 的 WEB_SERVER_KEYS 写法）：惰性探测 + 服务绑定事件重试，服务确实
	// 缺失时留一条 warn，避免更新后静默丢掉整个工作台 UI。
	const readWebService = (key) => {
		try {
			const viaReflect = ctx.reflect?.get?.(key, false)
			if (viaReflect !== undefined) return viaReflect
		} catch {
			// ignore: 继续用 ctx.get 兜底
		}
		try {
			return ctx.get(key)
		} catch {
			return undefined
		}
	}
	let webSurfaceRegistered = false
	const registerWebSurface = () => {
		if (webSurfaceRegistered) return
		const webServer = WEB_SERVER_KEYS.map((key) => readWebService(key)).find((service) => service !== undefined)
		if (webServer === undefined) return
		webSurfaceRegistered = true
		ctx.effect(() => {
			return registerInbox(webServer, { root: docsRoot, kbRoot })
		}, "dsh-office.docs-inbox")
	}
	registerWebSurface()
	ctx.on("internal/service", (serviceName) => {
		if (WEB_SERVER_KEYS.includes(serviceName)) registerWebSurface()
	})
	ctx.on("ready", () => {
		registerWebSurface()
		if (!webSurfaceRegistered) ctx.logger?.warn?.("[office] 未找到 webServer/httpServer 服务，工作台 UI 未挂载")
	})

	ctx.on("session/event", async (session, event) => {
		if (event?.type !== "turn/end") return
		const reason = event.data?.reason?.kind ?? event.reason?.kind
		if (reason !== "completed") return
		const title = String(session?.header?.title ?? session?.title ?? "")
		if (title.startsWith("微信·")) return
		if (hasOfficeWriteCall(session)) return
		const userText = lastRoleText(session, "user")
		const assistantText = lastRoleText(session, "assistant")
		if (!wantsDocument(userText) && !parseOfficeFence(assistantText)) return
		try {
			await materializeFromTurn({
				userText,
				assistantText,
				destDir: docsRoot,
				basename: slugName(title || "会话稿"),
				title: title || undefined,
			})
		} catch {
			/* 落盘失败不挡对话 */
		}
	}, { global: true })
}
