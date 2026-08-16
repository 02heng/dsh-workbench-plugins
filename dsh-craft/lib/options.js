export function recordOptions(brief, options) {
	const title = String(brief ?? "").trim()
	if (!title) throw new Error("请写下要做的事")
	const rows = (options ?? []).map((row) => ({
		title: String(row?.title ?? "").trim(),
		summary: String(row?.summary ?? "").trim(),
	})).filter((row) => row.title)
	if (rows.length < 2 || rows.length > 3) throw new Error("做法须 2～3 个")
	return { brief: title, options: rows, picked: null }
}

export function pickOption(record, index) {
	const i = Number(index)
	const options = record?.options ?? []
	if (!Number.isInteger(i) || i < 0 || i >= options.length) throw new Error("没有这个做法")
	return { ...record, picked: i }
}
