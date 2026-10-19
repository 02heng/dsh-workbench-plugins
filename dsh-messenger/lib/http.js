import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createLive, loadFresh } from "../../dsh-work-ui/live.js"
import { handleInbound, retryTask } from "./dispatch.js"
import { draftBody } from "./draft.js"
import { createMail } from "./mail.js"
import { ackOut, takeOutbox } from "./outbox.js"
import { loadReplyCatalog, replySelection, selectedLabel } from "./reply-model.js"
import { createStore } from "./store.js"
import { SIDECAR_DIR, SIDECAR_PYTHON } from "./sidecar.js"
import { clearKeyFiles, launchCollect, readKeysStatus } from "./wx-keys.js"

const MESSENGER_ROOT = resolve("D:/dsh-workbench/messenger")

function resolveShotPng(root, id) {
	const raw = String(id ?? "")
	if (!raw || raw !== raw.trim() || /[\\/]/.test(raw) || raw.includes("..")) return null
	const shots = resolve(join(root, "shots"))
	const dest = resolve(shots, `${raw}.png`)
	const relShots = relative(shots, dest)
	const relMsg = relative(MESSENGER_ROOT, dest)
	if (!relShots || relShots.startsWith("..") || isAbsolute(relShots)) return null
	if (!relMsg || relMsg.startsWith("..") || isAbsolute(relMsg)) return null
	if (!dest.toLowerCase().endsWith(".png")) return null
	return dest
}

const here = dirname(fileURLToPath(import.meta.url))
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

function json(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
	res.end(JSON.stringify(body))
}

function sameOrigin(req) {
	const host = String(req.headers.host ?? "")
	const origin = String(req.headers.origin ?? "")
	const referer = String(req.headers.referer ?? "")
	const check = (value) => {
		if (!value) return false
		try { return new URL(value).host === host } catch { return false }
	}
	if (origin) return check(origin)
	if (referer) return check(referer)
	return Boolean(host)
}

async function readBody(req) {
	const chunks = []
	for await (const chunk of req) chunks.push(chunk)
	if (chunks.length === 0) return {}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function isLoopback(req) {
	return LOOPBACK.has(String(req.socket?.remoteAddress ?? ""))
}

function requestUrl(req) {
	const host = String(req.headers?.host ?? "127.0.0.1")
	try { return new URL(req.url || "/", `http://${host}`) } catch { return new URL("http://127.0.0.1/") }
}

let lastKnownMail = []

function isMailAuthError(error) {
	const msg = String(error?.message ?? error)
	if (msg.includes("未配置 QQ 邮箱")) return true
	if (msg.includes("QQ 邮箱登录失败")) return true
	if (msg.includes("接通信匣")) return true
	if (/invalid_grant/i.test(msg)) return true
	if (/\b401\b/.test(msg) || /unauthorized/i.test(msg)) return true
	return false
}

function withTimeout(promise, ms, fallback) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => resolve(fallback), ms)
		promise.then((value) => {
			clearTimeout(timer)
			resolve(value)
		}, (error) => {
			clearTimeout(timer)
			reject(error)
		})
	})
}

async function deskState(store, mail, opts = {}) {
	const config = await store.loadConfig()
	let snap = await mail.snapshot()
	if (snap.pending) {
		try {
			const polled = await mail.pollDeviceLogin()
			if (polled?.ok && polled.mailbox) await store.saveConfig({ mailbox: polled.mailbox })
			snap = await mail.snapshot()
		} catch {
			snap = await mail.snapshot()
		}
	}
	let letters = []
	let listError = ""
	if (!snap.loggedIn) {
		lastKnownMail = []
	} else if (opts.skipInbox) {
		letters = lastKnownMail
	} else {
		try {
			letters = await withTimeout(mail.listMail(20), 2500, lastKnownMail)
			lastKnownMail = letters
		} catch (error) {
			if (isMailAuthError(error)) {
				snap = { ...snap, loggedIn: false, mailbox: "", error: String(error?.message ?? error) }
				lastKnownMail = []
			} else {
				letters = lastKnownMail
				listError = String(error?.message ?? error)
			}
		}
	}
	const models = await loadReplyCatalog(opts.api, typeof opts.llm === "function" ? opts.llm() : opts.llm)
	const picked = replySelection(config)
	return {
		listen: Boolean(config.listen),
		listenError: config.listenError || "",
		keysStatus: await readKeysStatus(store.root, config),
		mailbox: snap.loggedIn ? (snap.mailbox || "") : "",
		contact: config.contact ?? "黄山",
		password: config.password ?? "任务:",
		lines: config.lines ?? [],
		activeLineId: config.activeLineId ?? "",
		items: await store.purgeStaleItems().then(() => store.listItems()),
		mail: letters,
		mailConfigured: snap.configured,
		mailLoggedIn: snap.loggedIn,
		mailPending: snap.pending,
		mailError: listError || snap.error || (snap.configured ? "" : "未配置 QQ 邮箱"),
		models,
		replyProvider: config.replyProvider || "",
		replyModel: config.replyModel || "",
		replyEffort: config.replyEffort || "",
		replyLabel: config.replyLabel || selectedLabel(models, picked, "工作台当前模型"),
	}
}

function publicState(state) {
	return {
		listen: state.listen,
		listenError: state.listenError || "",
		keysStatus: state.keysStatus || "missing",
		contact: state.contact,
		password: state.password,
		lines: state.lines || [],
		activeLineId: state.activeLineId || "",
		mailbox: state.mailbox,
		items: state.items,
		mail: state.mail,
		mailConfigured: state.mailConfigured,
		mailLoggedIn: state.mailLoggedIn,
		mailPending: state.mailPending,
		mailError: state.mailError,
		models: state.models || [],
		replyProvider: state.replyProvider || "",
		replyModel: state.replyModel || "",
		replyEffort: state.replyEffort || "",
		replyLabel: state.replyLabel || "工作台当前模型",
	}
}

function resolveApi(api) {
	return typeof api === "function" ? api() : api
}

export function registerDesk(webServer, config = {}, api) {
	const store = config.store ?? createStore(config.root ?? "D:/dsh-workbench/messenger")
	const mail = config.mail ?? createMail({
		credPath: config.credPath ?? config.tokenPath ?? "D:/dsh-workbench/messenger/qq.json",
	})
	const stops = []
	const live = createLive({
		dirs: [here],
		path: "/plugins/dsh-messenger/live",
	})
	stops.push(live.register(webServer))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/desk",
		handler: async (_req, res) => {
			try {
				const { deskHtml } = await loadFresh(new URL("./desk.js", import.meta.url).href)
				const html = live.withLive(deskHtml(await deskState(store, mail, { skipInbox: true, api, llm: config.getLlm })))
				res.writeHead(200, {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				})
				res.end(html)
			} catch (error) {
				res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
				res.end(String(error?.message ?? error))
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/state",
		handler: async (_req, res) => {
			try { json(res, 200, publicState(await deskState(store, mail, { api, llm: config.getLlm }))) }
			catch (error) { json(res, 500, { error: String(error?.message ?? error) }) }
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/wx/inbound",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!isLoopback(req)) return json(res, 403, { error: "localhost only" })
				const result = await handleInbound(store, await readBody(req), resolveApi(api))
				json(res, 200, result)
			} catch (error) {
				const message = String(error?.message ?? error)
				if (message.includes("未登记的联系人") || message.includes("只收黄山")) return json(res, 403, { error: message })
				json(res, 400, { error: message })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/task/retry",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const result = await retryTask(store, await readBody(req), resolveApi(api))
				json(res, 200, result)
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/wx/outbox",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "GET") return json(res, 405, { error: "GET only" })
				if (!isLoopback(req)) return json(res, 403, { error: "localhost only" })
				json(res, 200, await takeOutbox(store))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/wx/outbox/ack",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!isLoopback(req)) return json(res, 403, { error: "localhost only" })
				const body = await readBody(req)
				json(res, 200, await ackOut(store, body.id, body.ok, body.error))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	const sidecar = config.sidecar
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/wx/listen",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const body = await readBody(req)
				const on = Boolean(body.on)
				if (on) sidecar?.start()
				else await sidecar?.stop?.()
				await store.saveConfig(on
					? { listen: true, listenError: undefined }
					: { listen: false, listenError: undefined })
				json(res, 200, { on, running: Boolean(sidecar?.running?.()) })
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/wx/model",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const body = await readBody(req)
				const provider = String(body.provider ?? "").trim()
				const model = String(body.model ?? "").trim()
				if (!provider || !model) return json(res, 400, { error: "请选择模型" })
				const effort = String(body.effort ?? "").trim()
				const label = String(body.label ?? "").trim()
				await store.saveConfig({
					replyProvider: provider,
					replyModel: model,
					replyEffort: effort,
					replyLabel: label || `${provider}/${model}`,
				})
				json(res, 200, { ok: true, provider, model, effort, label })
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/wx/health",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!isLoopback(req)) return json(res, 403, { error: "localhost only" })
				const body = await readBody(req)
				const ok = Boolean(body.ok)
				await store.saveConfig(ok
					? { listen: true, listenError: undefined }
					: { listen: false, listenError: String(body.error ?? "") })
				json(res, 200, { ok, error: body.error })
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/wx/keys/collect",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				await store.saveConfig({
					keysStatus: "collecting",
					keysCollectUntil: Date.now() + 90_000,
				})
				const launched = (config.launchCollect ?? launchCollect)({
					python: config.python ?? SIDECAR_PYTHON,
					script: config.collectScript ?? join(SIDECAR_DIR, "weixin_keys.py"),
					cwd: SIDECAR_DIR,
				})
				json(res, 200, { ok: true, collecting: true, pid: launched.pid })
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/wx/keys/clear",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				await clearKeyFiles(store.root)
				await sidecar?.stop?.()
				await store.saveConfig({
					listen: false,
					keysStatus: "missing",
					keysCollectUntil: 0,
					listenError: undefined,
				})
				json(res, 200, { ok: true })
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/mail/login",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const started = await mail.startDeviceLogin(await readBody(req))
				if (started?.mailbox) await store.saveConfig({ mailbox: started.mailbox })
				json(res, 200, started)
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/mail/list",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "GET") return json(res, 405, { error: "GET only" })
				json(res, 200, { ok: true, mail: await mail.listMail(20) })
			} catch (error) {
				json(res, 400, { ok: false, error: String(error?.message ?? error), mail: [] })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/mail/read",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "GET") return json(res, 405, { error: "GET only" })
				const id = requestUrl(req).searchParams.get("id") || ""
				if (!id) return json(res, 400, { error: "缺少 id" })
				json(res, 200, await mail.readMail(id))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/mail/draft",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const body = await readBody(req)
				json(res, 200, { ok: true, ...(await draftBody({ to: body.to, subject: body.subject, notes: body.notes })) })
			} catch (error) {
				json(res, 400, { ok: false, error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/mail/send",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const body = await readBody(req)
				const draft = { to: body.to ?? "", subject: body.subject ?? "", body: body.body ?? "" }
				try {
					await mail.sendMail(draft)
					json(res, 200, { ok: true })
				} catch (error) {
					json(res, 200, { ok: false, error: String(error?.message ?? error), draft })
				}
			} catch (error) {
				json(res, 400, { ok: false, error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/mail/logout",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				lastKnownMail = []
				json(res, 200, await mail.logout())
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/line/save",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				json(res, 200, await store.upsertLine(await readBody(req)))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/line/select",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				json(res, 200, await store.selectLine(String((await readBody(req)).id ?? "").trim()))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/line/delete",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				json(res, 200, await store.deleteLine(String((await readBody(req)).id ?? "").trim()))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/password/save",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const body = await readBody(req)
				json(res, 200, await store.upsertPassword(String(body.lineId ?? "").trim(), body))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/password/delete",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const body = await readBody(req)
				json(res, 200, await store.deletePassword(String(body.lineId ?? "").trim(), String(body.id ?? "").trim()))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/item/delete",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "same origin only" })
				const id = String((await readBody(req)).id ?? "").trim()
				if (!id) return json(res, 400, { error: "没有任务" })
				json(res, 200, await store.deleteItem(id))
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-messenger/shot",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "GET") return json(res, 405, { error: "GET only" })
				const dest = resolveShotPng(store.root, requestUrl(req).searchParams.get("id") || "")
				if (!dest) return json(res, 400, { error: "没有截图" })
				const buf = await readFile(dest)
				res.writeHead(200, {
					"content-type": "image/png",
					"cache-control": "no-store",
				})
				res.end(buf)
			} catch (error) {
				const message = String(error?.message ?? error)
				if (error?.code === "ENOENT" || message.includes("ENOENT")) {
					return json(res, 404, { error: "没有截图" })
				}
				json(res, 400, { error: message })
			}
		},
	}))
	return () => { for (const stop of stops) stop?.() }
}
