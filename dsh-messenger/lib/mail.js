import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { connect as tlsConnect } from "node:tls"

const DEFAULT_CRED = "D:/dsh-workbench/messenger/qq.json"
const IMAP_HOST = "imap.qq.com"
const IMAP_PORT = 993
const SMTP_HOST = "smtp.qq.com"
const SMTP_PORT = 465
const MISSING = "未配置 QQ 邮箱"
const AUTH_FAIL = "QQ 邮箱登录失败"

function quoteImap(value) {
	return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`
}

function decodeMimeWord(raw) {
	return String(raw ?? "").replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_all, charset, enc, payload) => {
		try {
			const bytes = enc.toUpperCase() === "B"
				? Buffer.from(payload, "base64")
				: Buffer.from(payload.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))), "binary")
			return new TextDecoder(String(charset || "utf-8")).decode(bytes)
		} catch {
			return payload
		}
	})
}

function parseAddress(raw) {
	const text = decodeMimeWord(raw).trim()
	const angle = /<([^>]+)>/.exec(text)
	if (angle) return angle[1].trim()
	const email = /[\w.+-]+@[\w.-]+/.exec(text)
	return email ? email[0] : text
}

function parseHeaders(block) {
	const folded = String(block ?? "").replace(/\r\n[ \t]+/g, " ")
	const headers = {}
	for (const line of folded.split(/\r?\n/)) {
		const cut = line.indexOf(":")
		if (cut < 1) continue
		const key = line.slice(0, cut).trim().toLowerCase()
		headers[key] = line.slice(cut + 1).trim()
	}
	return headers
}

function stripHtml(raw) {
	return String(raw ?? "")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function encodeSubject(text) {
	const value = String(text ?? "")
	if (/^[\x20-\x7E]*$/.test(value)) return value
	return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

function openTls(host, port, timeoutMs = 20_000) {
	return new Promise((resolve, reject) => {
		const sock = tlsConnect({ host, port, servername: host }, () => resolve(sock))
		sock.setTimeout(timeoutMs, () => {
			sock.destroy()
			reject(new Error("QQ 邮箱连接超时"))
		})
		sock.once("error", reject)
	})
}

class LineBuf {
	constructor(sock) {
		this.sock = sock
		this.buf = Buffer.alloc(0)
		this.lines = []
		this.waiters = []
		sock.on("data", (chunk) => {
			this.buf = Buffer.concat([this.buf, chunk])
			this.drain()
		})
	}

	drain() {
		while (this.buf.length) {
			const nl = this.buf.indexOf("\r\n")
			if (nl < 0) break
			const line = this.buf.subarray(0, nl).toString("utf8")
			this.buf = this.buf.subarray(nl + 2)
			if (this.waiters.length) this.waiters.shift()(line)
			else this.lines.push(line)
		}
	}

	nextLine() {
		if (this.lines.length) return Promise.resolve(this.lines.shift())
		return new Promise((resolve) => this.waiters.push(resolve))
	}

	async nextLiteral(size) {
		while (this.buf.length < size) {
			await new Promise((resolve, reject) => {
				const onData = () => {
					this.sock.off("error", onErr)
					resolve()
				}
				const onErr = (error) => reject(error)
				this.sock.once("data", onData)
				this.sock.once("error", onErr)
			})
		}
		const slice = this.buf.subarray(0, size)
		this.buf = this.buf.subarray(size)
		this.drain()
		return slice.toString("utf8")
	}
}

async function imapSession(creds, work) {
	const sock = await openTls(IMAP_HOST, IMAP_PORT)
	const io = new LineBuf(sock)
	let n = 0
	try {
		await io.nextLine()
		const cmd = async (line) => {
			n += 1
			const tag = `A${n}`
			sock.write(`${tag} ${line}\r\n`)
			const lines = []
			for (;;) {
				let row = await io.nextLine()
				const lit = /\{(\d+)\}\s*$/.exec(row)
				if (lit) {
					const payload = await io.nextLiteral(Number(lit[1]))
					const rest = await io.nextLine()
					row += "\n" + payload + rest
				}
				lines.push(row)
				if (row.startsWith(`${tag} `)) {
					if (!row.startsWith(`${tag} OK`)) throw new Error(AUTH_FAIL)
					return lines
				}
			}
		}
		await cmd(`LOGIN ${quoteImap(creds.user)} ${quoteImap(creds.auth)}`)
		const result = await work(cmd)
		try { await cmd("LOGOUT") } catch { /* closing */ }
		return result
	} finally {
		sock.destroy()
	}
}

function parseFetchHeaders(lines) {
	const items = []
	let current = null
	for (const line of lines) {
		const uid = /\bUID\s+(\d+)/i.exec(line)
		if (uid) {
			if (current) items.push(current)
			current = { id: uid[1], subject: "", from: "", at: "", body: "" }
		}
		if (!current) continue
		if (line.includes("BODY[TEXT]") || line.includes("BODY.PEEK[TEXT]")) continue
		const headers = parseHeaders(line)
		if (headers.subject) current.subject = decodeMimeWord(headers.subject)
		if (headers.from) current.from = parseAddress(headers.from)
		if (headers.date) {
			const at = new Date(headers.date)
			if (!Number.isNaN(at.getTime())) current.at = at.toISOString()
		}
	}
	if (current) items.push(current)
	return items
}

async function defaultImapList(creds, top) {
	return imapSession(creds, async (cmd) => {
		await cmd("SELECT INBOX")
		const search = await cmd("UID SEARCH ALL")
		const ids = []
		for (const line of search) {
			if (!line.startsWith("* SEARCH")) continue
			for (const part of line.slice(8).trim().split(/\s+/)) {
				if (/^\d+$/.test(part)) ids.push(part)
			}
		}
		const pick = ids.slice(-Math.max(1, Number(top) || 20))
		if (pick.length === 0) return []
		const fetched = await cmd(`UID FETCH ${pick.join(",")} (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`)
		const rows = parseFetchHeaders(fetched)
		const order = new Map(pick.map((id, index) => [id, index]))
		return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).reverse()
	})
}

async function defaultImapRead(creds, id) {
	const uid = String(id ?? "").trim()
	if (!/^\d+$/.test(uid)) throw new Error("读信失败")
	return imapSession(creds, async (cmd) => {
		await cmd("SELECT INBOX")
		const fetched = await cmd(`UID FETCH ${uid} (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[TEXT])`)
		const [row] = parseFetchHeaders(fetched)
		if (!row) throw new Error("读信失败")
		const textParts = []
		for (const line of fetched) {
			if (line.includes("BODY[TEXT]") || line.includes("BODY.PEEK[TEXT]")) {
				const cut = line.indexOf("\n")
				if (cut >= 0) textParts.push(line.slice(cut + 1))
			}
		}
		row.body = stripHtml(textParts.join("\n"))
		return row
	})
}

async function defaultImapProbe(creds) {
	await imapSession(creds, async (cmd) => {
		await cmd("SELECT INBOX")
	})
	return true
}

async function readSmtp(sock) {
	let buf = ""
	for (;;) {
		const chunk = await new Promise((resolve, reject) => {
			sock.once("data", resolve)
			sock.once("error", reject)
		})
		buf += chunk.toString("utf8")
		if (buf.includes("\r\n")) {
			const lines = buf.split(/\r\n/).filter(Boolean)
			const last = lines.at(-1) ?? ""
			if (/^\d{3}[\s-]/.test(last) && !/^\d{3}-/.test(last)) return { code: Number(last.slice(0, 3)), text: buf }
		}
	}
}

async function smtpTalk(sock, expect, line) {
	if (line !== undefined) sock.write(`${line}\r\n`)
	const reply = await readSmtp(sock)
	if (reply.code !== expect) throw new Error(reply.code === 535 ? AUTH_FAIL : `发出失败 ${reply.code}`)
	return reply
}

async function defaultSmtpSend(creds, draft) {
	const sock = await openTls(SMTP_HOST, SMTP_PORT)
	try {
		await smtpTalk(sock, 220)
		await smtpTalk(sock, 250, "EHLO dsh")
		await smtpTalk(sock, 334, "AUTH LOGIN")
		await smtpTalk(sock, 334, Buffer.from(creds.user, "utf8").toString("base64"))
		await smtpTalk(sock, 235, Buffer.from(creds.auth, "utf8").toString("base64"))
		await smtpTalk(sock, 250, `MAIL FROM:<${creds.user}>`)
		await smtpTalk(sock, 250, `RCPT TO:<${String(draft.to ?? "").trim()}>`)
		await smtpTalk(sock, 354, "DATA")
		const body = [
			`From: ${creds.user}`,
			`To: ${String(draft.to ?? "").trim()}`,
			`Subject: ${encodeSubject(draft.subject)}`,
			"MIME-Version: 1.0",
			"Content-Type: text/plain; charset=utf-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			String(draft.body ?? "").replace(/^\./gm, ".."),
			".",
		].join("\r\n")
		sock.write(`${body}\r\n`)
		await smtpTalk(sock, 250)
		try { await smtpTalk(sock, 221, "QUIT") } catch { /* closing */ }
		return { ok: true }
	} finally {
		sock.destroy()
	}
}

export function createMail(opts = {}) {
	const env = opts.env ?? process.env
	const credPath = opts.credPath ?? opts.tokenPath ?? DEFAULT_CRED
	const imap = {
		probe: opts.imap?.probe ?? defaultImapProbe,
		list: opts.imap?.list ?? defaultImapList,
		read: opts.imap?.read ?? defaultImapRead,
	}
	const smtp = {
		send: opts.smtp?.send ?? defaultSmtpSend,
	}

	function envCreds() {
		const user = String(env.QQ_MAIL_USER ?? "").trim()
		const auth = String(env.QQ_MAIL_AUTH ?? env.QQ_MAIL_CODE ?? "").trim()
		if (!user || !auth) return null
		return { user, auth }
	}

	async function loadFile() {
		try {
			const raw = JSON.parse(await readFile(credPath, "utf8"))
			const user = String(raw.user ?? "").trim()
			const auth = String(raw.auth ?? "").trim()
			if (!user || !auth) return null
			return { user, auth }
		} catch {
			return null
		}
	}

	async function loadCreds() {
		return (await loadFile()) ?? envCreds()
	}

	async function requireCreds() {
		const creds = await loadCreds()
		if (!creds) throw new Error(MISSING)
		return creds
	}

	async function saveCreds(next) {
		await mkdir(dirname(credPath), { recursive: true })
		await writeFile(credPath, JSON.stringify({ user: next.user, auth: next.auth }), "utf8")
		return next
	}

	async function startDeviceLogin(input = {}) {
		const user = String(input.user ?? "").trim()
		const auth = String(input.auth ?? "").trim()
		if (user && auth) await saveCreds({ user, auth })
		const creds = await requireCreds()
		try {
			await imap.probe(creds)
		} catch (error) {
			const msg = String(error?.message ?? error)
			throw new Error(msg.includes(MISSING) ? MISSING : AUTH_FAIL)
		}
		return { ok: true, mailbox: creds.user, message: "信匣已接通" }
	}

	async function pollDeviceLogin() {
		const creds = await loadCreds()
		if (!creds) return { pending: false }
		return { ok: true, mailbox: creds.user }
	}

	async function listMail(top = 20) {
		return imap.list(await requireCreds(), top)
	}

	async function readMail(id) {
		return imap.read(await requireCreds(), id)
	}

	async function sendMail(draft) {
		const to = String(draft?.to ?? "").trim()
		if (!to.includes("@")) throw new Error("发出失败")
		return smtp.send(await requireCreds(), {
			to,
			subject: String(draft?.subject ?? ""),
			body: String(draft?.body ?? ""),
		})
	}

	async function logout() {
		try { await unlink(credPath) } catch { /* already gone */ }
		return { ok: true }
	}

	async function snapshot() {
		const creds = await loadCreds()
		if (!creds) {
			return { configured: false, loggedIn: false, mailbox: "", error: MISSING, pending: null }
		}
		return {
			configured: true,
			loggedIn: true,
			mailbox: creds.user,
			error: "",
			pending: null,
		}
	}

	return {
		startDeviceLogin,
		pollDeviceLogin,
		listMail,
		readMail,
		sendMail,
		logout,
		snapshot,
	}
}
