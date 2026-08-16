import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { registerBoard } from "./http.js"
import { DEVICE_TYPES, dutyStatus, loadInventory, resolveRoot, saveInventory, upsertDevice } from "./store.js"
import { loadTags, upsertTag } from "./tags.js"
import { deleteTask, listCheckins, loadTasks, manualCheckin, runDueTasks, upsertTask } from "./tasks.js"

export const name = "dsh-datacenter"
export const inject = ["tools"]
export const Config = z.object({
	root: z.string().default("D:/dsh-datacenter"),
})

function asText(value) {
	return [{ type: "text", text: JSON.stringify(value, null, 2) }]
}

function parseDevice(args) {
	let monitor
	if (args.monitorJson) {
		try { monitor = JSON.parse(args.monitorJson) } catch { throw new Error("monitorJson 不是合法 JSON") }
	}
	return {
		id: args.id,
		name: args.name,
		type: args.type,
		role: args.role,
		mgmtIp: args.mgmtIp,
		location: args.location,
		vendor: args.vendor,
		wired: args.wired,
		notes: args.notes,
		monitor,
		tags: args.tagsJson ? JSON.parse(args.tagsJson) : undefined,
	}
}

export function apply(ctx, config = {}) {
	const root = resolveRoot(config.root)
	const ready = loadInventory(root)

	ctx.tools.register(defineTool({
		name: "dc_inventory_list",
		description: "列出机房台账（服务器/交换机/防火墙）。这是清单，不是实时监控。设备未联通时不要根据本列表说设备在线。",
		parameters: {
			type: { type: "string", description: `可选过滤：${DEVICE_TYPES.join(" / ")}` },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			const data = await ready.then(() => loadInventory(root))
			const devices = args.type
				? data.devices.filter((item) => item.type === args.type)
				: data.devices
			return { root, updatedAt: data.updatedAt, count: devices.length, devices }
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_inventory_get",
		description: "按 id 读取一台设备的台账。",
		parameters: {
			id: { type: "string", required: true, description: "设备 id，如 srv-core-01" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			const data = await loadInventory(root)
			const device = data.devices.find((item) => item.id === args.id)
			if (!device) throw new Error(`没有这台设备：${args.id}`)
			return { root, device }
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_inventory_upsert",
		description: "新增或更新机房台账。只改清单，不会去 SSH/SNMP 设备。未真正接线时 wired 必须为 false。",
		parameters: {
			id: { type: "string", required: true, description: "稳定 id，如 sw-core-01" },
			name: { type: "string", description: "显示名" },
			type: { type: "string", description: DEVICE_TYPES.join(" / ") },
			role: { type: "string", description: "角色，如 核心交换 / 出口防火墙" },
			mgmtIp: { type: "string", description: "管理地址，未联通留空" },
			location: { type: "string", description: "机柜/U 位" },
			vendor: { type: "string", description: "厂商型号" },
			wired: { type: "boolean", description: "是否已实际联通，默认 false" },
			notes: { type: "string", description: "备注" },
			monitorJson: { type: "string", description: "如 {\"icmp\":false,\"ssh\":false,\"snmp\":false}" },
			tagsJson: { type: "string", description: "监控指标标签 JSON 数组，如 [\"fw-up\",\"fw-policy\"]" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			const data = await loadInventory(root)
			const next = await saveInventory(root, upsertDevice(data, parseDevice(args)))
			return { root, device: next.devices.find((item) => item.id === args.id), updatedAt: next.updatedAt }
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_duty_status",
		description: "机房值班状态。骨架阶段永远返回 not-probed，不会探测交换机或防火墙。需要 24 小时值守时，用 sentinel_watch 盯台账文件或以后的探测脚本，不要空转对话。",
		parameters: {},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute() {
			const data = await loadInventory(root)
			return { root, inventoryFile: `${root}\\inventory.json`, board: "/plugins/dsh-datacenter/board", ...dutyStatus(data) }
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_tag_list",
		description: "列出监控指标标签（交换机/防火墙/服务器/值班）。接线后的巡检按这些 tag 记录，现在不会真的去采数。",
		parameters: { group: { type: "string", description: "可选：switch / firewall / server / duty" } },
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			const catalog = await loadTags(root)
			const tags = args.group ? catalog.tags.filter((item) => item.group === args.group) : catalog.tags
			return { root, tags }
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_tag_upsert",
		description: "新增或修改一个监控指标标签。",
		parameters: {
			id: { type: "string", required: true, description: "kebab-case，如 fw-ids" },
			label: { type: "string", required: true, description: "显示名" },
			group: { type: "string", description: "switch / firewall / server / duty" },
			unit: { type: "string", description: "单位" },
			note: { type: "string", description: "说明" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			return upsertTag(root, args)
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_task_list",
		description: "列出循环任务（每天打卡、防火墙巡检等）。界面在 /plugins/dsh-datacenter/board。",
		parameters: {},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute() {
			const store = await loadTasks(root)
			return { root, board: "/plugins/dsh-datacenter/board", tasks: store.tasks, checkins: await listCheckins(root, 10) }
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_task_upsert",
		description: "新增或修改循环任务。kind=checkin 只在本机记值班打卡；kind=monitor 在未接线时返回 skipped-not-wired。",
		parameters: {
			id: { type: "string", description: "不填则自动生成" },
			title: { type: "string", required: true, description: "任务名" },
			kind: { type: "string", description: "checkin / monitor / custom" },
			every: { type: "string", description: "daily / weekdays / hourly" },
			at: { type: "string", description: "每天的时间，如 08:30" },
			enabled: { type: "boolean", description: "是否启用" },
			deviceId: { type: "string", description: "巡检绑定的设备 id" },
			tagsJson: { type: "string", description: "指标标签 JSON 数组" },
			note: { type: "string", description: "备注" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			return upsertTask(root, {
				...args,
				tags: args.tagsJson ? JSON.parse(args.tagsJson) : undefined,
			})
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_task_delete",
		description: "删除循环任务。",
		parameters: { id: { type: "string", required: true, description: "任务 id" } },
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			return deleteTask(root, args.id)
		},
	}))

	ctx.tools.register(defineTool({
		name: "dc_checkin",
		description: "立刻记一条本机值班打卡。不是外单位考勤系统打卡。",
		parameters: { note: { type: "string", description: "备注" } },
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			return manualCheckin(root, args.note ?? "")
		},
	}))

	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => {
			const webServer = webCtx.webServer
			return webServer === undefined ? () => {} : registerBoard(webServer, root)
		}, "dsh-datacenter.board")
	})

	ctx.effect(() => {
		const timer = setInterval(() => {
			runDueTasks(root).catch((error) => ctx.logger?.warn?.(`[datacenter] 任务调度失败：${error}`))
		}, 30_000)
		runDueTasks(root).catch(() => {})
		return () => clearInterval(timer)
	}, "dsh-datacenter.ticker")
}
