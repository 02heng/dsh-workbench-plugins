function onD(path) {
	if (!/^[dD]:[\\/]/.test(String(path ?? ""))) throw new Error("只审 D 盘文稿")
	return String(path)
}

const SKIP = /^(猜测|也许|或许|可能|可以再|建议润色)/

export function parseReviewNotes(text) {
	const issues = []
	for (const line of String(text ?? "").split(/\r?\n/)) {
		const raw = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()
		if (!raw) continue
		if (raw === "确信：" || raw === "确信") continue
		if (SKIP.test(raw)) continue
		if (raw.startsWith("猜测")) continue
		issues.push(raw)
	}
	return issues
}

export function reviewPayload(path, notes) {
	return {
		path: onD(path),
		issues: parseReviewNotes(notes),
		rewritten: false,
	}
}
