import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const execFileAsync = promisify(execFile)
const script = fileURLToPath(new URL("./ocr-win.ps1", import.meta.url))

export async function ocrWindows(path) {
	const { stdout, stderr } = await execFileAsync(
		"powershell.exe",
		["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Path", path],
		{ windowsHide: true, timeout: 25000, maxBuffer: 2 * 1024 * 1024 },
	)
	const text = String(stdout ?? "").replace(/^\uFEFF/, "").trim()
	if (!text) {
		const err = String(stderr ?? "").trim()
		if (err) throw new Error(err)
	}
	return text
}
