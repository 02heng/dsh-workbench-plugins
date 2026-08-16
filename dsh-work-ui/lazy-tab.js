export function cleanTabName(text) {
	return String(text || "").replace(/[×✕]/g, "").replace(/\(\d+\)/g, "").replace(/\s+/g, " ").trim()
}

const ATELIER = {
	书籍转技能: "book",
	轨迹: "trail",
	记忆: "memory",
	技能: "skills",
	待办: "todos",
}

export function atelierPageOf(name) {
	const label = cleanTabName(name)
	if (ATELIER[label]) return ATELIER[label]
	for (const key of Object.keys(ATELIER)) {
		if (label.startsWith(key)) return ATELIER[key]
	}
	return ""
}

export function isAtelierTab(name) {
	return Boolean(atelierPageOf(name))
}

export function isLiveListenTab(name) {
	const label = cleanTabName(name)
	return label === "信使" || label.startsWith("信使") || label.includes("微信")
}

export function shouldLoadPluginView(activeTab, viewLabel) {
	return cleanTabName(activeTab) === cleanTabName(viewLabel)
}

export function shouldHoldAtelier(activeTab) {
	return isAtelierTab(activeTab)
}

export function unloadFrame(frame) {
	if (!frame) return { src: "about:blank", page: "", session: "" }
	frame.src = "about:blank"
	if (frame.dataset) {
		frame.dataset.page = ""
		frame.dataset.session = ""
	}
	return {
		src: frame.src,
		page: frame.dataset?.page || "",
		session: frame.dataset?.session || "",
	}
}
