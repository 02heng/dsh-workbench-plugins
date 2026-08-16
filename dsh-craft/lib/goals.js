function nid() {
	return `G-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function addGoal(list, title) {
	const text = String(title ?? "").trim()
	if (!text) throw new Error("目标不能空")
	return [...(list ?? []), { id: nid(), title: text, done: false, at: new Date().toISOString() }]
}

export function completeGoal(list, id) {
	const key = String(id ?? "")
	let found = false
	const next = (list ?? []).map((row) => {
		if (row.id !== key) return row
		found = true
		return { ...row, done: true, doneAt: new Date().toISOString() }
	})
	if (!found) throw new Error("没有这条目标")
	return next
}

export function openGoals(list) {
	return (list ?? []).filter((row) => !row.done)
}
