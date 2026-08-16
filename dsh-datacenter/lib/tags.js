import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

export const SEED_TAGS = [
	{ id: "sw-uplink", label: "上联口", group: "switch", unit: "up/down", note: "核心/汇聚上联是否通" },
	{ id: "sw-cpu", label: "交换机 CPU", group: "switch", unit: "%", note: "" },
	{ id: "sw-mem", label: "交换机内存", group: "switch", unit: "%", note: "" },
	{ id: "sw-temp", label: "交换机温度", group: "switch", unit: "℃", note: "" },
	{ id: "sw-port-err", label: "端口错包", group: "switch", unit: "count", note: "CRC / 丢包" },
	{ id: "sw-stp", label: "生成树", group: "switch", unit: "ok/fail", note: "" },
	{ id: "fw-up", label: "防火墙在线", group: "firewall", unit: "up/down", note: "管理面可达，未接线不探测" },
	{ id: "fw-policy", label: "策略命中", group: "firewall", unit: "hits", note: "安全策略是否在生效" },
	{ id: "fw-vpn", label: "VPN 隧道", group: "firewall", unit: "up/down", note: "" },
	{ id: "fw-threat", label: "威胁拦截", group: "firewall", unit: "count", note: "IPS / 病毒 / 入侵" },
	{ id: "fw-session", label: "并发会话", group: "firewall", unit: "count", note: "" },
	{ id: "fw-cpu", label: "防火墙 CPU", group: "firewall", unit: "%", note: "" },
	{ id: "srv-up", label: "服务器存活", group: "server", unit: "up/down", note: "" },
	{ id: "srv-cpu", label: "服务器 CPU", group: "server", unit: "%", note: "" },
	{ id: "srv-mem", label: "服务器内存", group: "server", unit: "%", note: "" },
	{ id: "srv-disk", label: "磁盘空间", group: "server", unit: "%", note: "" },
	{ id: "duty-checkin", label: "值班打卡", group: "duty", unit: "ok", note: "本地值班记录，不是外单位考勤系统" },
]

function tagsPath(root) {
	return resolve(root, "tags.json")
}

export async function loadTags(root) {
	await mkdir(root, { recursive: true })
	const file = tagsPath(root)
	try {
		const data = JSON.parse(await readFile(file, "utf8"))
		if (!Array.isArray(data.tags)) throw new Error("tags.json 缺少 tags")
		return data
	} catch (error) {
		if (error && error.code === "ENOENT") {
			const seed = { updatedAt: new Date().toISOString(), tags: SEED_TAGS }
			await writeFile(file, JSON.stringify(seed, null, 2), "utf8")
			return seed
		}
		throw error
	}
}

export async function saveTags(root, data) {
	const next = { ...data, updatedAt: new Date().toISOString() }
	await writeFile(tagsPath(root), JSON.stringify(next, null, 2), "utf8")
	return next
}

export async function upsertTag(root, patch) {
	if (!patch.id) throw new Error("缺少 tag id")
	const id = String(patch.id).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")
	const data = await loadTags(root)
	const idx = data.tags.findIndex((item) => item.id === id)
	const current = idx >= 0 ? data.tags[idx] : { id, label: id, group: "other", unit: "", note: "" }
	const next = {
		...current,
		...patch,
		id,
		label: String(patch.label ?? current.label),
		group: String(patch.group ?? current.group ?? "other"),
		unit: String(patch.unit ?? current.unit ?? ""),
		note: String(patch.note ?? current.note ?? ""),
	}
	if (idx >= 0) data.tags[idx] = next
	else data.tags.push(next)
	return { tag: next, catalog: await saveTags(root, data) }
}
