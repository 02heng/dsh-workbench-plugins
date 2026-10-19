import { readFileSync } from "node:fs"
import { promptFor } from "../../dsh-craft/lib/mode.js"

const CRAFT_STATE = "D:/dsh-workbench/craft/state.json"

export function craftModePrompt(file = CRAFT_STATE) {
	try {
		const snap = JSON.parse(readFileSync(file, "utf8"))
		return promptFor({
			mode: snap.mode || "craft",
			expert: snap.expert || "none",
			planConfirmed: Boolean(snap.planConfirmed),
			options: snap.options ?? null,
		})
	} catch {
		return promptFor({ mode: "craft", expert: "none", planConfirmed: true })
	}
}
