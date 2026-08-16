export const MODES = ["ask", "plan", "craft"]
export const EXPERTS = ["none", "official", "thesis", "duty"]

const MODE_LABEL = { ask: "问一问", plan: "想一想", craft: "做一做" }
const EXPERT_LABEL = { none: "", official: "公文", thesis: "课题预审", duty: "值班" }

export function normalizeMode(value) {
	const mode = String(value ?? "").trim()
	if (!MODES.includes(mode)) throw new Error("模式须为 ask / plan / craft")
	return mode
}

export function normalizeExpert(value) {
	const expert = String(value ?? "").trim() || "none"
	if (!EXPERTS.includes(expert)) throw new Error("专家须为 none / official / thesis / duty")
	return expert
}

export function modeForChannel(channel) {
	return String(channel ?? "") === "weixin" ? "craft" : null
}

export function gateAction(mode, action, { planConfirmed = false } = {}) {
	const current = normalizeMode(mode)
	if (current === "ask" && (action === "write" || action === "weixin")) {
		throw new Error("问一问不能改文件或发微信")
	}
	if (current === "plan" && (action === "write" || action === "weixin") && !planConfirmed) {
		throw new Error("想一想须先确认做法")
	}
	return true
}

export function promptFor({ mode, expert = "none", planConfirmed = false } = {}) {
	const current = normalizeMode(mode)
	const who = normalizeExpert(expert)
	const lines = [`当前工作档：${MODE_LABEL[current]}。`]
	if (current === "ask") {
		lines.push("只答问题、只读知识库和文件。不写盘、不改知识库、不发微信。")
	} else if (current === "plan") {
		if (planConfirmed) {
			lines.push("做法已确认，可以按选定做法写文件。未确认前不要另起炉灶。")
		} else {
			lines.push("先出 2～3 个做法（标题+三句摘要），列出会动哪些文件，等用户点选。未确认前不写盘、不发微信。用 craft_options 记下做法。")
		}
	} else {
		lines.push("可以写文件、改知识库、发微信。写完用 craft_task 把成品挂到任务卡。")
	}
	if (who === "official") lines.push("按公文技能写：文号、主送、落款齐全，不整篇重写已定稿。")
	if (who === "thesis") lines.push("按课题预审口径：先对材料，再标缺口，不编造数据。")
	if (who === "duty") lines.push("按值班台账：只记已发生的事，机房细节走 dc_inventory_*。")
	return lines.join("")
}
