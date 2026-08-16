import { execFile } from "node:child_process"
import { mkdir, stat } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const ROOT = resolve("D:/dsh-workbench/messenger")

function destUnderRoot(destPng) {
	if (typeof destPng !== "string" || !isAbsolute(destPng)) return null
	const dest = resolve(destPng)
	const rel = relative(ROOT, dest)
	if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return null
	return dest
}

export async function captureScreen(destPng) {
	const dest = destUnderRoot(destPng)
	if (!dest) throw new Error("截屏失败")
	try {
		await mkdir(dirname(dest), { recursive: true })
		const script = [
			"Add-Type -AssemblyName System.Windows.Forms,System.Drawing",
			"$b = [System.Windows.Forms.SystemInformation]::VirtualScreen",
			"$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height",
			"$g = [System.Drawing.Graphics]::FromImage($bmp)",
			"$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)",
			"$bmp.Save($env:DSH_SHOT_DEST, [System.Drawing.Imaging.ImageFormat]::Png)",
			"$g.Dispose(); $bmp.Dispose()",
		].join("; ")
		await execFileAsync("powershell.exe", [
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy", "Bypass",
			"-WindowStyle", "Hidden",
			"-Command",
			script,
		], {
			env: { ...process.env, DSH_SHOT_DEST: dest },
			timeout: 60_000,
			windowsHide: true,
		})
		const info = await stat(dest)
		if (!info.isFile() || info.size < 1) throw new Error("empty")
		return { path: dest, bytes: info.size }
	} catch (error) {
		if (error?.message === "截屏失败") throw error
		throw new Error("截屏失败")
	}
}
