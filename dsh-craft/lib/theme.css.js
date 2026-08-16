import { readFileSync } from "node:fs"

export function workThemeCss() {
	return readFileSync("D:/dsh-plugins/dsh-work-ui/theme.css", "utf8")
}
