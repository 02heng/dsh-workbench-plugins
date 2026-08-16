const STOP = new Set(["那份", "那个", "这个", "上周", "这周", "今天", "昨天", "的", "了", "和", "与"])

function termsOf(query) {
	const raw = String(query ?? "").trim()
	if (!raw) throw new Error("检索词不能空")
	const parts = raw.split(/[\s,，。？?、]+/).filter(Boolean)
	const extra = raw.replace(/[那这上下今昨周天份个]/g, " ").split(/\s+/).filter((t) => t.length >= 2)
	return [...new Set([...parts, ...extra])].filter((t) => !STOP.has(t))
}

function recentBonus(query, mtime, now) {
	if (!String(query).includes("上周") || !mtime) return 0
	const week = 7 * 24 * 60 * 60 * 1000
	const age = now - mtime
	if (age >= 0 && age <= week * 2) return 4
	return 0
}

export function scoreDoc(doc, query, now = Date.now()) {
	const terms = termsOf(query)
	const title = String(doc.title ?? "").toLowerCase()
	const body = String(doc.body ?? "").toLowerCase()
	const path = String(doc.path ?? "").toLowerCase()
	let score = recentBonus(query, doc.mtime, now)
	for (const term of terms) {
		const t = term.toLowerCase()
		if (title.includes(t)) score += 5
		if (path.includes(t)) score += 2
		if (body.includes(t)) score += 1
	}
	return score
}

export function searchCorpus(docs, query, limit = 8, now = Date.now()) {
	const terms = termsOf(query)
	const cap = Math.max(1, Math.min(Number(limit) || 8, 20))
	const hits = []
	for (const doc of docs ?? []) {
		const score = scoreDoc(doc, query, now)
		if (score <= 0) continue
		const hay = String(doc.body ?? "")
		const needle = terms.find((t) => hay.toLowerCase().includes(t.toLowerCase())) || terms[0]
		const idx = hay.toLowerCase().indexOf(String(needle).toLowerCase())
		const snippet = hay.replace(/\s+/g, " ").slice(Math.max(0, idx - 40), Math.max(0, idx) + 160)
		hits.push({ ...doc, score, snippet })
	}
	return hits.sort((a, b) => b.score - a.score).slice(0, cap)
}
