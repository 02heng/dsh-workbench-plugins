import { readFile } from "node:fs/promises"
import { join } from "node:path"
import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { parseVisual, visionStatus } from "./see.js"
import { mustBeOnD, resolveOnD } from "./paths.js"
import { installVisionBridge } from "./bridge.js"
import { toToolValue } from "./json-plain.js"

export const name = "dsh-vision"
export const inject = ["tools", "llm"]
export const Config = z.object({
	apiKeyEnv: z.string().default("VISION_API_KEY"),
	cursorApiKeyEnv: z.string().default("CURSOR_API_KEY"),
	cursorModel: z.string().default("composer-2.5"),
	scratch: z.string().default("D:/dsh-workbench/vision-scratch"),
	docsRoot: z.string().default("D:/dsh-workbench/docs"),
})

function asText(value) {
	return [{ type: "text", text: JSON.stringify(value, null, 2) }]
}

function sessionCwd(agent) {
	const cwd = agent?.session?.header?.cwd
	return typeof cwd === "string" && cwd.length > 0 ? cwd : "D:/dsh-workbench"
}

async function resolveTarget(args, agent, docsRoot) {
	if (args.id) {
		const index = JSON.parse(await readFile(join(mustBeOnD(docsRoot, "收件箱"), "index.json"), "utf8"))
		const doc = (index.docs ?? []).find((item) => item.id === args.id)
		if (!doc) throw new Error(`收件箱没有这份：${args.id}`)
		return mustBeOnD(doc.original)
	}
	return resolveOnD(sessionCwd(agent), args.path)
}

export function apply(ctx, config = {}) {
	const docsRoot = config.docsRoot || "D:/dsh-workbench/docs"
	const seeConfig = {
		apiKeyEnv: config.apiKeyEnv || "VISION_API_KEY",
		cursorApiKeyEnv: config.cursorApiKeyEnv || "CURSOR_API_KEY",
		cursorModel: config.cursorModel || "composer-2.5",
		scratch: config.scratch || "D:/dsh-workbench/vision-scratch",
	}

	ctx.effect(() => installVisionBridge(ctx, seeConfig), "dsh-vision.bridge")

	ctx.tools.register(defineTool({
		name: "vision_status",
		description: "查看视觉解析通道是否可用。主模型没有视觉时，用这条确认眼睛（OCR / Cursor / 外部 VL）。",
		parameters: {},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute() {
			return toToolValue({ ...visionStatus(seeConfig), hint: "看图用 vision_parse，不要用 read_image（那条要求主模型自己能看图）。" })
		},
	}))

	ctx.tools.register(defineTool({
		name: "vision_parse",
		description: "解析图片里的文字、界面和场景，返回文本。主模型没有视觉时必须用这个，不要用 read_image。path 为 D 盘图片，或用收件箱 id。",
		parameters: {
			path: { type: "string", description: "D 盘图片路径，如 D:/dsh-workbench/docs/inbox/xxx.png" },
			id: { type: "string", description: "文档收件箱 id，来自 docs_list" },
			question: { type: "string", description: "要从图里回答的具体问题，例如 这张表的合计是多少" },
			mode: { type: "string", description: "auto / ocr / describe。默认 auto：先 OCR，不够再走视觉模型" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args, exec) {
			if (!args.path && !args.id) throw new Error("请提供 path 或收件箱 id")
			const file = await resolveTarget(args, exec.agent, docsRoot)
			return toToolValue({
				path: file,
				...await parseVisual(file, {
					question: args.question,
					mode: args.mode || "auto",
					config: seeConfig,
					signal: exec.signal,
				}),
			})
		},
	}))
}
