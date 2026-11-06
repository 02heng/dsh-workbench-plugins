export function wantThinking(_model, effort) {
	const e = String(effort || "").toLowerCase()
	if (e === "off" || e === "disabled" || e === "none") return false
	return true
}

export function thinkingPayload(model, effort) {
	return { type: wantThinking(model, effort) ? "enabled" : "disabled" }
}
