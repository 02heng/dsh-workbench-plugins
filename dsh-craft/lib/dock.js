const HIDE = [
	"记忆",
	"技能",
	"待办",
	"轨迹",
	"书籍转技能",
	"派活台",
	"数据大屏",
	"信使",
	"上下文",
]

export function shouldShowCraftDock(tabName) {
	const label = String(tabName || "")
		.replace(/[×✕]/g, "")
		.replace(/\(\d+\)/g, "")
		.replace(/\s+/g, " ")
		.trim()
	if (!label || label === "对话" || label.startsWith("对话")) return true
	if (HIDE.some((name) => label === name || label.startsWith(name))) return false
	return true
}
