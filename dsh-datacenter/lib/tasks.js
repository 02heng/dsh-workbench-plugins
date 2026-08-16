import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { randomBytes } from "node:crypto"
import { loadInventory } from "./store.js"

export const TASK_KINDS = ["checkin", "monitor", "custom"]
export const TASK_EVERY = ["daily", "weekdays", "hourly"]

const SEED_TASKS = [
	{
		id: "checkin-daily",
		title: "每日值班打卡",
		kind: "checkin",
		enabled: true,
		every: "daily",
		at: "08:30",
		tags: ["duty-checkin"],
		deviceId: "",
		note: "在本机记下值班到岗。不会登录外单位考勤网站。",
		lastRunAt: null,
		lastResult: null,
	},
	{
		id: "fw-security-daily",
		title: "每日防火墙安全巡检",
		kind: "monitor",
		enabled: true,
		every: "daily",
		at: "09:00",
		tags: ["fw-up", "fw-policy", "fw-threat", "fw-vpn"],
		deviceId: "fw-edge-01",
		note: "设备未联通时只记 skipped-not-wired，不编造告警。",
		lastRunAt: null,
		lastResult: null,
	},
	{
		id: "sw-health-daily",
		title: "每日交换机巡检",
		kind: "monitor",
		enabled: false,
		every: "daily",
		at: "09:10",
		tags: ["sw-uplink", "sw-cpu", "sw-port-err"],
		deviceId: "sw-core-01",
		note: "默认关闭。接线后再打开。",
		lastRunAt: null,
		lastResult: null,
	},
]

function tasksPath(root) {
	return resolve(root, "tasks.json")
}

function checkinsPath(root) {
	return resolve(root, "checkins.jsonl")
}

function nowStamp() {
	const d = new Date()
	const pad = (n) => String(n).padStart(2, "0")
	return {
		iso: d.toISOString(),
		date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
		hm: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
		weekday: d.getDay(),
		ms: d.getTime(),
	}
}

export async function loadTasks(root) {
	await mkdir(root, { recursive: true })
	const file = tasksPath(root)
	try {
		const data = JSON.parse(await readFile(file, "utf8"))
		if (!Array.isArray(data.tasks)) throw new Error("tasks.json 缺少 tasks")
		return data
	} catch (error) {
		if (error && error.code === "ENOENT") {
			const seed = { updatedAt: new Date().toISOString(), tasks: SEED_TASKS }
			await writeFile(file, JSON.stringify(seed, null, 2), "utf8")
			return seed
		}
		throw error
	}
}

export async function saveTasks(root, data) {
	const next = { ...data, updatedAt: new Date().toISOString() }
	await writeFile(tasksPath(root), JSON.stringify(next, null, 2), "utf8")
	return next
}

export async function upsertTask(root, patch) {
	const data = await loadTasks(root)
	const id = String(patch.id ?? `task-${randomBytes(3).toString("hex")}`)
	if (patch.kind && !TASK_KINDS.includes(patch.kind)) throw new Error(`kind 必须是 ${TASK_KINDS.join(" / ")}`)
	if (patch.every && !TASK_EVERY.includes(patch.every)) throw new Error(`every 必须是 ${TASK_EVERY.join(" / ")}`)
	const idx = data.tasks.findIndex((item) => item.id === id)
	const current = idx >= 0 ? data.tasks[idx] : {
		id,
		title: id,
		kind: "custom",
		enabled: true,
		every: "daily",
		at: "09:00",
		tags: [],
		deviceId: "",
		note: "",
		lastRunAt: null,
		lastResult: null,
	}
	const next = {
		...current,
		...patch,
		id,
		title: String(patch.title ?? current.title),
		kind: patch.kind ?? current.kind,
		enabled: patch.enabled === undefined ? current.enabled : Boolean(patch.enabled),
		every: patch.every ?? current.every,
		at: String(patch.at ?? current.at ?? "09:00"),
		tags: Array.isArray(patch.tags) ? patch.tags.map(String) : current.tags,
		deviceId: String(patch.deviceId ?? current.deviceId ?? ""),
		note: String(patch.note ?? current.note ?? ""),
	}
	if (idx >= 0) data.tasks[idx] = next
	else data.tasks.push(next)
	return { task: next, store: await saveTasks(root, data) }
}

export async function deleteTask(root, id) {
	const data = await loadTasks(root)
	const next = { ...data, tasks: data.tasks.filter((item) => item.id !== id) }
	if (next.tasks.length === data.tasks.length) throw new Error(`没有这个任务：${id}`)
	return saveTasks(root, next)
}

export function isDue(task, now = nowStamp()) {
	if (!task.enabled) return false
	if (task.every === "hourly") {
		if (!task.lastRunAt) return true
		return now.ms - Date.parse(task.lastRunAt) >= 60 * 60 * 1000
	}
	if (task.every === "weekdays" && (now.weekday === 0 || now.weekday === 6)) return false
	const lastDate = typeof task.lastRunAt === "string" ? task.lastRunAt.slice(0, 10) : ""
	if (lastDate === now.date) return false
	const at = String(task.at ?? "09:00")
	return now.hm >= at
}

async function runOne(root, task) {
	const now = nowStamp()
	if (task.kind === "checkin") {
		const row = { at: now.iso, taskId: task.id, title: task.title, kind: "checkin", ok: true }
		await appendFile(checkinsPath(root), `${JSON.stringify(row)}\n`, "utf8")
		return { status: "checked-in", at: now.iso, message: "已记本机值班打卡" }
	}
	if (task.kind === "monitor") {
		const inv = await loadInventory(root)
		const device = task.deviceId ? inv.devices.find((item) => item.id === task.deviceId) : undefined
		if (!device || device.wired !== true) {
			return {
				status: "skipped-not-wired",
				at: now.iso,
				message: "设备未联通，巡检未执行，没有编造告警",
				deviceId: task.deviceId || null,
				tags: task.tags,
			}
		}
		return {
			status: "probe-not-implemented",
			at: now.iso,
			message: "台账已标记接线，但探测尚未实现",
			deviceId: device.id,
			tags: task.tags,
		}
	}
	return { status: "recorded", at: now.iso, message: task.note || "自定义任务已到点记一笔" }
}

export async function runDueTasks(root) {
	const data = await loadTasks(root)
	const now = nowStamp()
	const ran = []
	for (const task of data.tasks) {
		if (!isDue(task, now)) continue
		const result = await runOne(root, task)
		task.lastRunAt = now.iso
		task.lastResult = result
		ran.push({ id: task.id, title: task.title, result })
	}
	if (ran.length > 0) await saveTasks(root, data)
	return { at: now.iso, ran }
}

export async function listCheckins(root, limit = 20) {
	try {
		const raw = await readFile(checkinsPath(root), "utf8")
		const lines = raw.trim().split(/\n/).filter(Boolean).map((line) => JSON.parse(line))
		return lines.slice(-limit).reverse()
	} catch (error) {
		if (error && error.code === "ENOENT") return []
		throw error
	}
}

export async function manualCheckin(root, note = "") {
	const now = nowStamp()
	const row = { at: now.iso, taskId: "manual", title: "手动打卡", kind: "checkin", ok: true, note }
	await appendFile(checkinsPath(root), `${JSON.stringify(row)}\n`, "utf8")
	return row
}
