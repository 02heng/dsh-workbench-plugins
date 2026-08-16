import { readFileSync } from "node:fs"
import { join } from "node:path"
import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { registerCraft } from "./http.js"
import { gateAction, promptFor } from "./mode.js"
import { createCraftStore, searchRoots } from "./store.js"

export const name = "dsh-craft"
export const inject = ["tools", "systemPrompt"]
export const Config = z.object({
	root: z.string().default("D:/dsh-workbench/craft"),
	messengerRoot: z.string().default("D:/dsh-workbench/messenger"),
	docsRoot: z.string().default("D:/dsh-workbench/docs"),
	kbRoot: z.string().default("D:/dsh-kb"),
})

function asText(value) {
	return [{ type: "text", text: JSON.stringify(value, null, 2) }]
}

export function apply(ctx, config = {}) {
	const store = createCraftStore(config.root ?? "D:/dsh-workbench/craft")
	const searchDirs = [config.kbRoot ?? "D:/dsh-kb", `${config.docsRoot ?? "D:/dsh-workbench/docs"}/parsed`]

	ctx.effect(() => ctx.systemPrompt.context({
		name: "dsh-craft:mode",
		order: 40,
		text() {
			try {
				const snap = JSON.parse(readFileSync(join(store.root, "state.json"), "utf8"))
				return promptFor({
					mode: snap.mode || "craft",
					expert: snap.expert || "none",
					planConfirmed: Boolean(snap.planConfirmed),
				})
			} catch {
				return promptFor({ mode: "craft", expert: "none", planConfirmed: true })
			}
		},
	}), "dsh-craft:mode")

	ctx.tools.register(defineTool({
		name: "craft_state",
		description: "查看或切换问一问/想一想/做一做，以及公文/课题预审/值班专家。微信派活默认做一做。",
		parameters: {
			mode: { type: "string", description: "ask / plan / craft" },
			expert: { type: "string", description: "none / official / thesis / duty" },
			channel: { type: "string", description: "weixin 时强制 craft" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			if (args.mode) await store.setMode(args.mode, { channel: args.channel })
			if (args.expert) await store.setExpert(args.expert)
			return store.snapshot()
		},
	}))

	ctx.tools.register(defineTool({
		name: "craft_options",
		description: "想一想时记下 2～3 个做法。用户在派活台点选后才允许写盘。",
		parameters: {
			brief: { type: "string", required: true, description: "要做的事" },
			optionsJson: { type: "string", required: true, description: "[{title,summary},...] 2～3 条" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			const options = JSON.parse(args.optionsJson)
			return store.putOptions(args.brief, options)
		},
	}))

	ctx.tools.register(defineTool({
		name: "craft_goal",
		description: "挂起或完成长目标。课题预审、周报按做完没有续跑，不要只按点钟。",
		parameters: {
			action: { type: "string", required: true, description: "add / done / list" },
			title: { type: "string", description: "add 时必填" },
			id: { type: "string", description: "done 时必填" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			if (args.action === "add") return store.add(args.title)
			if (args.action === "done") return store.done(args.id)
			return store.snapshot()
		},
	}))

	ctx.tools.register(defineTool({
		name: "craft_pending",
		description: "读取用户在派活台圈选的待改段落。按 instruction 改写后用 craft_apply 写回。",
		parameters: {},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute() {
			const snap = await store.snapshot()
			return snap.pendingPatch ?? { empty: true }
		},
	}))

	ctx.tools.register(defineTool({
		name: "craft_apply",
		description: "把选区替换写回 D 盘文稿。问一问禁止；想一想须已点选做法。",
		parameters: {
			replacement: { type: "string", required: true, description: "替换选区的新文本，不要整篇重写" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			const snap = await store.snapshot()
			gateAction(snap.mode, "write", { planConfirmed: snap.planConfirmed })
			return store.applyPatch(args.replacement)
		},
	}))

	ctx.tools.register(defineTool({
		name: "craft_review",
		description: "记下成品审稿。只标确信的问题，不要重写全文。",
		parameters: {
			path: { type: "string", required: true, description: "D 盘文稿路径" },
			notes: { type: "string", required: true, description: "每行一条确信问题" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			return store.addReview(args.path, args.notes)
		},
	}))

	ctx.tools.register(defineTool({
		name: "craft_search",
		description: "在知识库和已解析文稿里按正文检索。适合「上周那份课题预审」。",
		parameters: {
			query: { type: "string", required: true, description: "自然语言或关键词" },
			limit: { type: "number", description: "最多条数，默认 8" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			return { hits: await searchRoots(searchDirs, args.query, args.limit) }
		},
	}))

	ctx.tools.register(defineTool({
		name: "craft_task",
		description: "把生成的 D 盘成品挂到任务卡，方便派活台和微信回文件。",
		parameters: {
			id: { type: "string", required: true, description: "任务编号，如 T-0816-01" },
			filesJson: { type: "string", required: true, description: "D 盘文件路径 JSON 数组" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			const snap = await store.snapshot()
			gateAction(snap.mode, "write", { planConfirmed: snap.planConfirmed })
			const files = JSON.parse(args.filesJson)
			return store.bindFiles(args.id, files)
		},
	}))

	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => {
			const webServer = webCtx.webServer
			return webServer === undefined ? () => {} : registerCraft(webServer, { ...config, store })
		}, "dsh-craft.desk")
	})
}
