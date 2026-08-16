const WEIXIN = {
	recorded: "仅记录",
	"empty-password": "口令空",
	queued: "排队",
	running: "在跑",
	replied: "已回图",
	replying: "回图中",
	"dispatch-failed": "派活失败",
	failed: "失败",
	"shot-failed": "回图失败",
}

export function weixinLabel(status) {
	return WEIXIN[status] ?? (status || "仅记录")
}

function onD(path) {
	return /^[dD]:[\\/]/.test(String(path ?? ""))
}

export function attachFiles(item, files) {
	const seen = new Set()
	const next = []
	for (const file of [...(item.files ?? []), ...(files ?? [])]) {
		const path = String(file ?? "").trim()
		if (!path || !onD(path) || seen.has(path)) continue
		seen.add(path)
		next.push(path)
	}
	return { ...item, files: next }
}

export function taskCard(item = {}) {
	return {
		id: item.id ?? "",
		text: item.text || item.prompt || "",
		title: item.title || "",
		sessionId: item.sessionId || "",
		status: item.status || "recorded",
		weixin: weixinLabel(item.status),
		files: Array.isArray(item.files) ? item.files.filter(onD) : [],
		at: item.at || "",
	}
}
