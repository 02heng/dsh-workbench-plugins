export const CATALOG_STORE = "dsh.tab-shelf.catalog.v1"

export function cleanName(text) {
	return String(text || "").replace(/[×✕]/g, "").replace(/\s+/g, " ").trim()
}

export function isConversationCatalog(rows) {
	return Array.isArray(rows) && rows.some((row) => cleanName(row?.name) === "对话")
}

function normalize(rows) {
	const seen = new Set()
	const out = []
	for (const row of rows ?? []) {
		const name = cleanName(row?.name)
		if (!name || seen.has(name)) continue
		seen.add(name)
		out.push({ name, on: Boolean(row.on) })
	}
	return out
}

export function mergeCatalog(prev, next) {
	const before = normalize(prev)
	const incoming = normalize(next)
	if (!incoming.length) return before
	if (!isConversationCatalog(incoming)) return before
	return incoming
}

export function loadCatalog(storage = globalThis.localStorage) {
	try {
		const raw = JSON.parse(storage?.getItem?.(CATALOG_STORE) || "[]")
		return isConversationCatalog(raw) ? normalize(raw) : []
	} catch {
		return []
	}
}

export function saveCatalog(rows, storage = globalThis.localStorage) {
	const next = normalize(rows)
	if (!isConversationCatalog(next)) return
	storage?.setItem?.(CATALOG_STORE, JSON.stringify(next))
}
