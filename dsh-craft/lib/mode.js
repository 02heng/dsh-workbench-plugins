export const MODES = ["ask", "plan", "craft"]
export const EXPERTS = ["none", "official", "thesis", "duty"]

const MODE_LABEL = { ask: "问一问", plan: "想一想", craft: "做一做" }
const EXPERT_LABEL = { none: "", official: "公文", thesis: "课题预审", duty: "值班" }

const MODE_BODY = {
	ask: [
		"只答问题、只读知识库和文件。",
		"不写盘、不改知识库、不发微信。",
		"不要调用 office_*_write、craft_apply、craft_task，也不要发微信。",
	],
	plan: [
		"先出 2～3 个做法（标题+三句摘要），列出会动哪些文件，等用户点选。",
		"用 craft_options 记下做法。未确认前不写盘、不发微信。",
	],
	craft: [
		"可以写文件、改知识库、发微信。",
		"成品写到 D:/dsh-workbench/docs（docx / xlsx / pdf），不要只在对话里贴正文。",
		"写完用 craft_task 把成品挂到任务卡。",
	],
}

const EXPERT_BODY = {
	official: [
		"本回合专家：公文。",
		"按公文技能写：文号、主送、落款齐全，不整篇重写已定稿。",
		"文种、层次序数、成文日期按 GB/T 9704；版式跟全局记忆里最新的通知类公文版式。",
		"动手前读技能 D:/dsh-workbench/.dsh/skills/official-document-writing/SKILL.md。不要 caveman 压缩。",
	],
	thesis: [
		"本回合专家：课题预审。",
		"先对材料，再标缺口，不编造数据、不补假引用。材料不够就明说缺什么。",
		"长活用 craft_goal 挂起，做完再勾。",
	],
	duty: [
		"本回合专家：值班。",
		"按值班台账：只记已发生的事，机房细节走 dc_inventory_*。",
		"设备未联通时禁止说在线、离线或已监控。不要编造告警。",
		"动手前读技能 D:/dsh-workbench/.dsh/skills/datacenter-duty/SKILL.md。",
	],
}

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

function pickedLine(options) {
	if (!options || options.picked == null) return ""
	const item = options.options?.[options.picked]
	if (!item) return ""
	const title = String(item.title ?? "").trim()
	const summary = String(item.summary ?? "").trim()
	if (!title) return ""
	return `已选定做法：${title}。${summary}`.trim()
}

export function promptFor({ mode, expert = "none", planConfirmed = false, options = null } = {}) {
	const current = normalizeMode(mode)
	const who = normalizeExpert(expert)
	const lines = [`当前工作档：${MODE_LABEL[current]}。`]
	if (current === "plan" && planConfirmed) {
		lines.push("做法已确认，可以按选定做法写文件。未确认前不要另起炉灶。")
		const picked = pickedLine(options)
		if (picked) lines.push(picked)
	} else {
		lines.push(...MODE_BODY[current])
	}
	if (who !== "none") lines.push(...EXPERT_BODY[who])
	return lines.join("\n")
}

export { MODE_LABEL, EXPERT_LABEL }
