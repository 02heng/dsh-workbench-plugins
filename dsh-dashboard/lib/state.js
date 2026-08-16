import { readFile } from "node:fs/promises"
import { loadInventory, dutyStatus } from "../../dsh-datacenter/lib/store.js"
import { listCheckins, loadTasks } from "../../dsh-datacenter/lib/tasks.js"
import { loadIndex } from "../../dsh-office/lib/inbox.js"
import { ensureKb, listDocs } from "../../dsh-edu-kb/lib/store.js"

const DONE = new Set(["checked-in", "ok", "success", "done"])

function openTask(task) {
	if (!task.enabled) return { reason: "未启用", tone: "muted" }
	const status = task.lastResult?.status
	if (!status) return { reason: "尚未执行", tone: "warn" }
	if (status === "skipped-not-wired") return { reason: "设备未联通", tone: "warn" }
	if (DONE.has(status)) return null
	return { reason: status, tone: "danger" }
}

async function loadSchool(path) {
	try {
		const raw = JSON.parse(await readFile(path, "utf8"))
		return {
			name: String(raw.name ?? "待填学校"),
			campus: String(raw.campus ?? "待填校区"),
			term: String(raw.term ?? "待填学期"),
			note: String(raw.note ?? ""),
			stats: Array.isArray(raw.stats) ? raw.stats : [],
		}
	} catch {
		return {
			name: "待填学校",
			campus: "待填校区",
			term: "待填学期",
			note: "还没有 D:\\dsh-workbench\\school.json",
			stats: [],
		}
	}
}

export async function dashboardState({ dcRoot, docsRoot, kbRoot, schoolPath }) {
	await ensureKb(kbRoot)
	const [inv, tasksFile, checkins, inbox, kbDocs, school] = await Promise.all([
		loadInventory(dcRoot),
		loadTasks(dcRoot),
		listCheckins(dcRoot, 8),
		loadIndex(docsRoot),
		listDocs(kbRoot),
		loadSchool(schoolPath),
	])
	const tasks = tasksFile.tasks ?? []
	const open = tasks.map((task) => {
		const gap = openTask(task)
		return gap ? { ...task, gap: gap.reason, tone: gap.tone } : null
	}).filter(Boolean)
	const docs = inbox.docs ?? []
	const pendingDocs = docs.filter((item) => !item.toKb)
	const byCollection = {}
	for (const doc of kbDocs) {
		byCollection[doc.collection] = (byCollection[doc.collection] ?? 0) + 1
	}
	const devices = inv.devices ?? []
	return {
		now: new Date().toISOString(),
		school,
		duty: dutyStatus(inv),
		kpis: [
			{ id: "open", label: "未完成任务", value: String(open.length), hint: "循环任务里未启用 / 未跑 / 未接线" },
			{ id: "tasks", label: "循环任务", value: String(tasks.length), hint: `${tasks.filter((item) => item.enabled).length} 开` },
			{ id: "devices", label: "台账设备", value: String(devices.length), hint: `${devices.filter((item) => item.wired).length} 已接线` },
			{ id: "docs", label: "收件文稿", value: String(docs.length), hint: `${pendingDocs.length} 未入库` },
			{ id: "kb", label: "知识库篇目", value: String(kbDocs.length), hint: "制度 / 字典 / 口径 / 备忘" },
		],
		openTasks: open,
		devices,
		checkins,
		pendingDocs: pendingDocs.slice(0, 8),
		kb: { total: kbDocs.length, byCollection, recent: kbDocs.slice(-6).reverse() },
		links: {
			wall: "/plugins/dsh-dashboard/wall",
			board: "/plugins/dsh-datacenter/board",
			inbox: "/plugins/dsh-docs/inbox",
		},
	}
}
