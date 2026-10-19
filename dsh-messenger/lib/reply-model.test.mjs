import { flattenModelCatalog, replySelection, selectedLabel } from "./reply-model.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const rows = flattenModelCatalog([
	{
		id: "deepseek-official",
		name: "DeepSeek",
		models: [{
			id: "deepseek-v4-flash",
			name: "DeepSeek-V4-Flash",
			reasoning: {
				efforts: [
					{ id: "low", name: "Low" },
					{ id: "high", name: "High" },
				],
			},
		}],
	},
	{
		id: "cursor",
		name: "Cursor",
		models: [{ id: "grok-4.6", name: "Cursor Grok 4.6" }],
	},
])
if (rows.length !== 3) fail("flatten count", rows)
if (rows[1].provider !== "deepseek-official" || rows[1].model !== "deepseek-v4-flash" || rows[1].effort !== "high") {
	fail("effort row", rows[1])
}
if (rows[1].label !== "DeepSeek-V4-Flash High") fail("effort label", rows[1])
if (rows[2].provider !== "cursor" || rows[2].effort) fail("plain cursor row", rows[2])

const picked = replySelection({
	replyProvider: "deepseek-official",
	replyModel: "deepseek-v4-flash",
	replyEffort: "high",
})
if (!picked || picked.provider !== "deepseek-official" || picked.reasoningEffort !== "high") {
	fail("replySelection", picked)
}
if (replySelection({}) || replySelection({ replyProvider: "cursor" })) {
	fail("empty selection must be null")
}

if (selectedLabel(rows, picked) !== "DeepSeek-V4-Flash High") {
	fail("selectedLabel", selectedLabel(rows, picked))
}

const listed = await (await import("./reply-model.js")).loadReplyCatalog({
	llm: {
		async models() {
			return { result: { ok: true, value: { groups: [{ id: "cursor", models: [{ id: "auto", name: "Cursor Auto" }] }] } } }
		},
	},
})
if (listed.length !== 1 || listed[0].model !== "auto") fail("loadReplyCatalog", listed)

const fromLlm = await (await import("./reply-model.js")).loadReplyCatalog(null, {
	listProviders() {
		return [{ id: "deepseek-official", name: "DeepSeek" }]
	},
	async listModels() {
		return [{ id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash" }]
	},
	async resolveModelInfo() {
		return {
			id: "deepseek-v4-flash",
			name: "DeepSeek-V4-Flash",
			reasoning: { efforts: [{ id: "high", name: "High" }] },
		}
	},
})
if (!fromLlm.some((row) => row.label === "DeepSeek-V4-Flash High")) {
	fail("catalog from ctx.llm", fromLlm)
}

console.log("PASS reply-model")
