function onD(path) {
	if (!/^[dD]:[\\/]/.test(String(path ?? ""))) throw new Error("只改 D 盘文稿")
	return String(path)
}

export function excerpt(text, start, end) {
	const raw = String(text ?? "")
	const from = Number(start)
	const to = Number(end)
	if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > raw.length || from >= to) {
		throw new Error("选区无效")
	}
	return raw.slice(from, to)
}

export function applySelection(text, start, end, replacement) {
	const raw = String(text ?? "")
	excerpt(raw, start, end)
	return raw.slice(0, start) + String(replacement ?? "") + raw.slice(end)
}

export function pendingPatch({ path, text, start, end, instruction }) {
	const excerptText = excerpt(text, start, end)
	const note = String(instruction ?? "").trim()
	if (!note) throw new Error("请写下怎么改这段")
	return {
		path: onD(path),
		start: Number(start),
		end: Number(end),
		excerpt: excerptText,
		instruction: note,
	}
}
