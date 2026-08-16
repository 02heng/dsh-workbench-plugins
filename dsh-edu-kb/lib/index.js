import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { COLLECTIONS, resolveKbRoot } from "./paths.js"
import { ensureKb, listDocs, readDoc, searchDocs, writeDoc } from "./store.js"

export const name = "dsh-edu-kb"
export const inject = ["tools"]
export const Config = z.object({
	root: z.string().default("D:/dsh-kb"),
})

function asText(value) {
	return [{ type: "text", text: JSON.stringify(value, null, 2) }]
}

export function apply(ctx, config = {}) {
	const root = resolveKbRoot(config.root)
	const ready = ensureKb(root)

	ctx.tools.register(defineTool({
		name: "kb_list",
		description: "列出智慧教育知识库文档。分类：policies 制度、dictionary 数据字典、recipes 检索口径、notes 备忘。机房台账用 dc_inventory_list。",
		parameters: {
			collection: { type: "string", description: `可选：${COLLECTIONS.join(" / ")}` },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			await ready
			return { root, collection: args.collection ?? "all", docs: await listDocs(root, args.collection) }
		},
	}))

	ctx.tools.register(defineTool({
		name: "kb_search",
		description: "在智慧教育知识库里按关键词检索制度、数据字典、检索口径。回答学校口径问题前先搜，不要编造制度条文。",
		parameters: {
			query: { type: "string", required: true, description: "关键词，如 学号 口径、信息安全" },
			collection: { type: "string", description: `可选：${COLLECTIONS.join(" / ")}` },
			limit: { type: "number", description: "最多条数，默认 8" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			await ready
			return { root, query: args.query, hits: await searchDocs(root, args.query, args.collection, args.limit) }
		},
	}))

	ctx.tools.register(defineTool({
		name: "kb_read",
		description: "读取知识库一篇 Markdown 全文。path 来自 kb_list / kb_search。",
		parameters: {
			path: { type: "string", required: true, description: "相对 D:/dsh-kb 的路径，如 policies/信息安全管理制度-模板.md" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			await ready
			return await readDoc(root, args.path)
		},
	}))

	ctx.tools.register(defineTool({
		name: "kb_write",
		description: "写入或覆盖知识库文档。只写 D:/dsh-kb。不要写入真实学生名单或未脱敏成绩。",
		parameters: {
			collection: { type: "string", required: true, description: COLLECTIONS.join(" / ") },
			title: { type: "string", required: true, description: "标题" },
			body: { type: "string", required: true, description: "Markdown 正文" },
			path: { type: "string", description: "相对路径，默认 collection/标题.md" },
			tagsJson: { type: "string", description: "标签 JSON 数组" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			await ready
			return await writeDoc(root, args)
		},
	}))
}
