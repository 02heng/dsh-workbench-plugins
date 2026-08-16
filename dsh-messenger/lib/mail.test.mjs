import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createMail } from "./mail.js"

const root = "D:/dsh-workbench/messenger/_test-mail"
const credPath = join(root, "qq.json")
const defaultCred = "D:/dsh-workbench/messenger/qq.json"

await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })

let defaultBefore = null
try { defaultBefore = await readFile(defaultCred, "utf8") } catch { defaultBefore = null }

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

try {
	const mail = createMail({ env: {}, credPath })
	await mail.startDeviceLogin()
	fail("missing creds should throw")
} catch (error) {
	if (!String(error?.message ?? error).includes("未配置 QQ 邮箱")) {
		fail("missing creds message")
	}
}

const sent = []
const imap = {
	async probe() { return true },
	async list() {
		return [{ id: "1", subject: "值班", from: "src@example.com", at: "2026-08-15T12:00:00Z" }]
	},
	async read() {
		return { id: "1", subject: "值班", from: "src@example.com", at: "2026-08-15T12:00:00Z", body: "正文一段" }
	},
}
const smtp = {
	async send(_creds, draft) { sent.push(draft); return { ok: true } },
}

const mail = createMail({
	env: {},
	credPath,
	imap,
	smtp,
})

const started = await mail.startDeviceLogin({ user: "desk@qq.com", auth: "auth-code" })
if (started.ok !== true || started.mailbox !== "desk@qq.com" || !started.message) {
	fail("startDeviceLogin shape")
}

const polled = await mail.pollDeviceLogin()
if (polled.ok !== true || polled.mailbox !== "desk@qq.com") fail("pollDeviceLogin")

const listed = await mail.listMail(20)
if (!Array.isArray(listed) || listed[0]?.id !== "1" || listed[0]?.from !== "src@example.com") {
	fail("listMail")
}

const read = await mail.readMail("1")
if (read?.id !== "1" || read?.body !== "正文一段") {
	fail("readMail")
}

await mail.sendMail({ to: "dest@example.com", subject: "测试", body: "请查收" })
if (sent[0]?.to !== "dest@example.com" || sent[0]?.body !== "请查收") {
	fail("sendMail")
}

let credText = ""
try { credText = await readFile(credPath, "utf8") } catch { fail("cred missing in test root") }
if (!credText.includes("desk@qq.com") || !credText.includes("auth-code")) {
	fail("cred contents")
}
if (credText.includes("password") && !credText.includes("auth")) {
	fail("should store auth not password field")
}

let defaultAfter = null
try { defaultAfter = await readFile(defaultCred, "utf8") } catch { defaultAfter = null }
if (defaultBefore === null && defaultAfter !== null) {
	fail("cred written outside test root")
}
if (defaultBefore !== null && defaultAfter !== defaultBefore) {
	fail("default cred mutated")
}

const snap = await mail.snapshot()
if (!snap.configured || !snap.loggedIn || snap.mailbox !== "desk@qq.com" || snap.pending) {
	fail("snapshot logged in")
}

await mail.logout()
try {
	await readFile(credPath, "utf8")
	fail("logout should remove cred file")
} catch { /* expected */ }

const afterOut = await mail.snapshot()
if (afterOut.configured || afterOut.loggedIn || afterOut.mailbox) fail("snapshot after logout")

const envMail = createMail({
	env: { QQ_MAIL_USER: "env@qq.com", QQ_MAIL_AUTH: "env-auth" },
	credPath,
	imap,
	smtp,
})
const envStarted = await envMail.startDeviceLogin()
if (envStarted.mailbox !== "env@qq.com") fail("env creds")

await writeFile(credPath, JSON.stringify({ user: "file@qq.com", auth: "file-auth" }), "utf8")
const mixed = createMail({
	env: { QQ_MAIL_USER: "env@qq.com", QQ_MAIL_AUTH: "env-auth" },
	credPath,
	imap,
	smtp,
})
const mixedSnap = await mixed.snapshot()
if (mixedSnap.mailbox !== "file@qq.com") fail("file creds win over env")

const badImap = {
	async probe() { throw new Error("LOGIN failed") },
	async list() { throw new Error("LOGIN failed") },
	async read() { throw new Error("LOGIN failed") },
}
const bad = createMail({
	env: { QQ_MAIL_USER: "bad@qq.com", QQ_MAIL_AUTH: "wrong" },
	credPath: join(root, "bad.json"),
	imap: badImap,
	smtp,
})
try {
	await bad.startDeviceLogin()
	fail("bad login should throw")
} catch (error) {
	if (!String(error?.message ?? error).includes("QQ 邮箱登录失败")) {
		fail("bad login message")
	}
}

await rm(root, { recursive: true, force: true })
console.log("PASS mail")
