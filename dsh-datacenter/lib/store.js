import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

export const DEVICE_TYPES = ["server", "switch", "firewall", "other"]

const SEED = {
	updatedAt: null,
	wired: false,
	note: "设备尚未联通。只能维护台账，禁止报告在线/离线/流量/告警。",
	devices: [
		{
			id: "srv-core-01",
			name: "核心服务器（待填）",
			type: "server",
			role: "待填",
			mgmtIp: "",
			location: "待填机柜",
			vendor: "",
			wired: false,
			monitor: { icmp: false, ssh: false, snmp: false },
			tags: ["srv-cpu", "srv-mem", "srv-disk", "srv-up"],
			notes: "联通后再填管理地址，不要编造 IP",
		},
		{
			id: "sw-core-01",
			name: "核心交换机（待填）",
			type: "switch",
			role: "待填",
			mgmtIp: "",
			location: "待填机柜",
			vendor: "",
			wired: false,
			monitor: { icmp: false, ssh: false, snmp: false },
			tags: ["sw-uplink", "sw-cpu", "sw-mem", "sw-port-err"],
			notes: "",
		},
		{
			id: "fw-edge-01",
			name: "出口防火墙（待填）",
			type: "firewall",
			role: "待填",
			mgmtIp: "",
			location: "待填机柜",
			vendor: "",
			wired: false,
			monitor: { icmp: false, ssh: false, snmp: false },
			tags: ["fw-up", "fw-policy", "fw-vpn", "fw-threat", "fw-session"],
			notes: "",
		},
	],
}

export function resolveRoot(configRoot) {
	const raw = typeof configRoot === "string" && configRoot.trim() ? configRoot.trim() : "D:/dsh-datacenter"
	const root = resolve(raw)
	if (!/^[dD]:[\\/]/.test(root)) {
		throw new Error(`机房台账必须放在 D 盘，当前配置：${root}`)
	}
	return root
}

function inventoryPath(root) {
	return resolve(root, "inventory.json")
}

export async function loadInventory(root) {
	await mkdir(root, { recursive: true })
	const file = inventoryPath(root)
	try {
		const raw = await readFile(file, "utf8")
		const data = JSON.parse(raw)
		if (!Array.isArray(data.devices)) throw new Error("inventory.json 缺少 devices 数组")
		const seedById = Object.fromEntries(SEED.devices.map((item) => [item.id, item]))
		data.devices = data.devices.map((item) => ({
			...item,
			tags: Array.isArray(item.tags) && item.tags.length > 0
				? item.tags
				: (seedById[item.id]?.tags ?? []),
		}))
		return data
	} catch (error) {
		if (error && error.code === "ENOENT") {
			const seed = { ...SEED, updatedAt: new Date().toISOString() }
			await writeFile(file, JSON.stringify(seed, null, 2), "utf8")
			return seed
		}
		throw error
	}
}

export async function saveInventory(root, data) {
	const next = {
		...data,
		updatedAt: new Date().toISOString(),
		wired: Array.isArray(data.devices) && data.devices.some((item) => item.wired === true),
	}
	await mkdir(root, { recursive: true })
	await writeFile(inventoryPath(root), JSON.stringify(next, null, 2), "utf8")
	return next
}

export function dutyStatus(data) {
	const devices = data.devices ?? []
	const wired = devices.filter((item) => item.wired === true)
	return {
		mode: "skeleton",
		message: wired.length === 0
			? "机房设备尚未联通。当前只能维护台账，不能报在线、离线、端口或流量。"
			: "台账里有标记 wired=true 的设备，但探测尚未实现，仍然不能报运行状态。",
		total: devices.length,
		wiredCount: wired.length,
		probeImplemented: false,
		updatedAt: data.updatedAt ?? null,
		devices: devices.map((item) => ({
			id: item.id,
			name: item.name,
			type: item.type,
			wired: Boolean(item.wired),
			status: "not-probed",
		})),
	}
}

export function upsertDevice(data, patch) {
	if (!patch.id || typeof patch.id !== "string") throw new Error("缺少设备 id")
	if (patch.type && !DEVICE_TYPES.includes(patch.type)) {
		throw new Error(`type 必须是 ${DEVICE_TYPES.join(" / ")}`)
	}
	const devices = [...(data.devices ?? [])]
	const idx = devices.findIndex((item) => item.id === patch.id)
	const current = idx >= 0 ? devices[idx] : {
		id: patch.id,
		name: patch.id,
		type: "other",
		role: "",
		mgmtIp: "",
		location: "",
		vendor: "",
		wired: false,
		monitor: { icmp: false, ssh: false, snmp: false },
		tags: [],
		notes: "",
	}
	const next = {
		...current,
		...patch,
		monitor: { ...current.monitor, ...(patch.monitor ?? {}) },
		tags: Array.isArray(patch.tags) ? [...new Set(patch.tags.map(String))] : (current.tags ?? []),
		wired: patch.wired === true ? true : patch.wired === false ? false : Boolean(current.wired),
	}
	if (idx >= 0) devices[idx] = next
	else devices.push(next)
	return { ...data, devices }
}
