function newId(prefix) {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function prefixesOf(token) {
	const raw = String(token ?? "").trim()
	if (!raw) return []
	const hasColon = /[:：]$/u.test(raw)
	const base = raw.replace(/[:：]+$/u, "")
	if (!base) return []
	const set = hasColon
		? [raw, `${base}:`, `${base}：`]
		: [raw, `${base}:`, `${base}：`, base]
	return [...new Set(set)].sort((a, b) => b.length - a.length)
}

function cleanPassword(row) {
	const token = String(row?.token ?? "").trim()
	if (!token) return null
	return {
		id: String(row.id ?? "").trim() || newId("pw"),
		token,
		prompt: String(row.prompt ?? "{{input}}"),
	}
}

function cleanLine(row) {
	if (!row || typeof row !== "object") return null
	const name = String(row.name ?? "").trim()
	if (!name) return null
	const passwords = Array.isArray(row.passwords)
		? row.passwords.map(cleanPassword).filter(Boolean)
		: []
	if (!passwords.length) {
		passwords.push({ id: newId("pw"), token: "任务:", prompt: "{{input}}" })
	}
	return {
		id: String(row.id ?? "").trim() || newId("line"),
		name,
		passwords,
	}
}

export function defaultLine() {
	return {
		id: "line-1",
		name: "黄山",
		passwords: [{ id: "pw-1", token: "任务:", prompt: "{{input}}" }],
	}
}

export function normalizeLines(config = {}) {
	let lines = Array.isArray(config.lines) ? config.lines.map(cleanLine).filter(Boolean) : []
	if (!lines.length) {
		const name = String(config.contact ?? "").trim() || "黄山"
		const token = String(config.password ?? "").trim() || "任务:"
		lines = [{
			id: "line-1",
			name,
			passwords: [{ id: "pw-1", token, prompt: "{{input}}" }],
		}]
	}
	let activeLineId = String(config.activeLineId ?? "")
	if (!lines.some((line) => line.id === activeLineId)) activeLineId = lines[0].id
	const active = lines.find((line) => line.id === activeLineId) ?? lines[0]
	return {
		...config,
		lines,
		activeLineId,
		contact: active.name,
		password: active.passwords[0]?.token || "任务:",
	}
}

export function findLineByName(config, name) {
	const n = String(name ?? "").trim()
	return normalizeLines(config).lines.find((line) => line.name === n) ?? null
}

export function activeLine(config) {
	const next = normalizeLines(config)
	return next.lines.find((line) => line.id === next.activeLineId) ?? next.lines[0]
}

export function applyPromptTemplate(template, userText) {
	const input = String(userText ?? "")
	const tpl = String(template ?? "").trim() || "{{input}}"
	if (tpl.includes("{{input}}")) return tpl.split("{{input}}").join(input).trim()
	if (!input) return tpl
	return `${tpl}\n\n${input}`
}

export function allPrefixes(config) {
	const set = new Set()
	for (const line of normalizeLines(config).lines) {
		for (const password of line.passwords) {
			for (const prefix of prefixesOf(password.token)) set.add(prefix)
		}
	}
	return [...set]
}

export { newId }
