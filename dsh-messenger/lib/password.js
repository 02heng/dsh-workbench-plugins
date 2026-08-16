const PREFIXES = ["任务:", "任务："]

export function parseInbound(text, kind = "text") {
	if (kind !== "text") return { action: "ignore", prompt: "" }
	const raw = String(text ?? "").trim()
	if (!raw) return { action: "record", prompt: "" }
	for (const prefix of PREFIXES) {
		if (!raw.startsWith(prefix)) continue
		const prompt = raw.slice(prefix.length).trim()
		if (!prompt) return { action: "empty-password", prompt: "" }
		return { action: "dispatch", prompt }
	}
	return { action: "record", prompt: raw }
}
