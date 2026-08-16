import { resolvedCursorModel } from "./model-info.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const info = resolvedCursorModel("cursor", "grok-4.6")
if (info.provider !== "cursor" || info.id !== "grok-4.6" || info.name !== "Cursor Grok 4.6") {
	fail("identity", info)
}
if (info.context?.window !== undefined) fail("must not use context.window", info.context)
if (!Number.isInteger(info.context?.contextWindow) || info.context.contextWindow <= 0) {
	fail("contextWindow must be a positive integer", info.context)
}

console.log("PASS cursor-model-info")
