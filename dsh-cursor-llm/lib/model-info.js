const NAMES = {
	"grok-4.6": "Cursor Grok 4.6",
	"composer-2.5": "Composer 2.5",
	auto: "Cursor Auto",
}

export function resolvedCursorModel(provider, id, fallbackId = "grok-4.6") {
	return {
		provider,
		id,
		name: NAMES[id] || (id === fallbackId ? "Cursor Grok 4.6" : id),
		context: { contextWindow: 128000 },
		inputModalities: ["text"],
	}
}
