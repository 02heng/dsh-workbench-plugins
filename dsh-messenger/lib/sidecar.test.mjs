import { mkdir, readFile, rm } from "node:fs/promises"
import { createSidecar } from "./sidecar.js"

const root = "D:/dsh-workbench/messenger/_test-sidecar"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const logPath = `${root}/sidecar.log`

const sidecar = createSidecar({
	python: "D:/DevTools/Python312/python.exe",
	args: ["-c", "import sys, time; print('sidecar-hi', flush=True); sys.stderr.write('sidecar-err\\n'); time.sleep(30)"],
	cwd: root,
	logPath,
	env: { ...process.env, DSH_MESSENGER: "http://127.0.0.1:3080", DSH_WX_CONTACT: "黄山" },
})

try {
	const started = sidecar.start()
	if (!started?.ok || !sidecar.running() || !sidecar.pid) {
		console.error("FAIL start", started, sidecar.running(), sidecar.pid)
		process.exit(1)
	}
	await new Promise((resolve) => setTimeout(resolve, 800))
	const log = await readFile(logPath, "utf8")
	if (!log.includes("sidecar-hi") || !log.includes("sidecar-err")) {
		console.error("FAIL log", log)
		process.exit(1)
	}
	await sidecar.stop()
	await new Promise((resolve) => setTimeout(resolve, 400))
	if (sidecar.running()) {
		console.error("FAIL still running after stop")
		process.exit(1)
	}
	await rm(root, { recursive: true, force: true })
	console.log("PASS sidecar")
} catch (error) {
	try { await sidecar.stop() } catch { /* ignore */ }
	throw error
}
