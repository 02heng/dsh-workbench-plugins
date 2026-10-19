import { spawn } from "node:child_process"
import { createWriteStream, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const SIDECAR_DIR = join(here, "..", "sidecar")
export const SIDECAR_PYTHON = join(SIDECAR_DIR, ".venv", "Scripts", "python.exe")
export const SIDECAR_SCRIPT = join(SIDECAR_DIR, "listen.py")
export const SIDECAR_LOG = "D:/dsh-workbench/messenger/sidecar.log"

const PROXY_KEYS = /^(https?|all|ftp)_proxy$/i

export function sidecarChildEnv(extra = {}) {
	const env = {
		...process.env,
		PYTHONIOENCODING: "utf-8",
		PYTHONUTF8: "1",
		DSH_MESSENGER: "http://127.0.0.1:3080",
		DSH_WX_CONTACT: "黄山",
		DSH_WX_CONFIG: "D:/dsh-workbench/messenger/config.json",
		DSH_WX_DATA_ROOT: "E:\\weixin",
		DSH_WX_KEYS: "D:\\dsh-workbench\\messenger\\wx-keys.json",
		DSH_WX_CACHE: "D:\\dsh-workbench\\messenger\\wx-cache",
		DSH_WX_CURSOR: "D:\\dsh-workbench\\messenger\\wx-cursor.json",
		DSH_WX_KEYS_ROOT: "D:\\dsh-workbench\\messenger",
		...extra,
	}
	for (const key of Object.keys(env)) {
		if (PROXY_KEYS.test(key)) delete env[key]
	}
	env.NO_PROXY = "127.0.0.1,localhost,::1"
	env.no_proxy = env.NO_PROXY
	return env
}

export function createSidecar(opts = {}) {
	const python = opts.python ?? SIDECAR_PYTHON
	const args = opts.args ?? [opts.script ?? SIDECAR_SCRIPT]
	const cwd = opts.cwd ?? SIDECAR_DIR
	const logPath = opts.logPath ?? SIDECAR_LOG
	const env = sidecarChildEnv(opts.env)

	let child = null
	let log = null

	function running() {
		return Boolean(child && child.exitCode == null && !child.killed)
	}

	function start() {
		if (running()) return { ok: true, pid: child.pid }
		mkdirSync(dirname(logPath), { recursive: true })
		log = createWriteStream(logPath, { flags: "a" })
		child = spawn(python, args, {
			cwd,
			env,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		})
		child.stdout?.on("data", (chunk) => { try { log.write(chunk) } catch { /* ignore */ } })
		child.stderr?.on("data", (chunk) => { try { log.write(chunk) } catch { /* ignore */ } })
		child.on("exit", () => {
			child = null
		})
		return { ok: true, pid: child.pid }
	}

	function stop() {
		return new Promise((resolve) => {
			if (!child) {
				try { log?.end() } catch { /* ignore */ }
				log = null
				return resolve({ ok: true })
			}
			const proc = child
			const pid = proc.pid
			let settled = false
			const finish = () => {
				if (settled) return
				settled = true
				child = null
				try { log?.end() } catch { /* ignore */ }
				log = null
				resolve({ ok: true })
			}
			proc.once("exit", finish)
			if (process.platform === "win32" && pid) {
				spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
					windowsHide: true,
					stdio: "ignore",
				})
			} else {
				proc.kill("SIGTERM")
			}
			setTimeout(finish, 4000)
		})
	}

	return {
		start,
		stop,
		running,
		get pid() { return child?.pid },
	}
}

export function startSidecarWhenReady(store, sidecar) {
	let disposed = false
	const done = Promise.resolve(store.loadConfig()).then((cfg) => {
		if (disposed) return { started: false }
		if (cfg.listen !== false) {
			sidecar.start()
			return { started: true }
		}
		return { started: false }
	})
	return {
		dispose() { disposed = true },
		done,
	}
}
