export function routeChat(resolved = {}, _header = {}, config = {}) {
	const provider = config.provider || "cursor"
	const model = config.model || "grok-4.6"
	const next = resolved.provider === provider && resolved.model
		? { ...resolved, provider, model: resolved.model }
		: { ...resolved, provider, model }
	delete next.reasoningEffort
	return next
}
