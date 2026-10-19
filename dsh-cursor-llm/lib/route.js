export function routeChat(resolved = {}, _header = {}, config = {}) {
	if (resolved.provider && resolved.model) return { ...resolved }
	return {
		...resolved,
		provider: config.provider || "cursor",
		model: config.model || "grok-4.6",
	}
}
