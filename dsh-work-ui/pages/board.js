import { postJson, useArmed, useToast } from "./ui.js"

const { createElement: h, useEffect, useState } = window.React

const GROUPS = ["switch", "firewall", "server", "duty", "other"]

export function BoardPage({ active }) {
	const [state, setState] = useState({ tags: [], tasks: [], devices: [], checkins: [] })
	const [tag, setTag] = useState({ id: "", label: "", group: "firewall" })
	const [task, setTask] = useState({ title: "", kind: "checkin", every: "daily", at: "08:30", deviceId: "", tags: "" })
	const [devId, setDevId] = useState("")
	const [devTags, setDevTags] = useState("")
	const { say, node: toast } = useToast()
	const { armed, arm } = useArmed(3200)

	const load = async () => {
		const res = await fetch("/plugins/dsh-datacenter/api/state")
		const data = await res.json()
		setState(data)
		if (!devId && data.devices?.[0]) setDevId(data.devices[0].id)
	}

	useEffect(() => {
		if (!active) return undefined
		load().catch(() => say("循环任务读失败", false))
		return undefined
	}, [active])

	const run = async (path, body, ok) => {
		try {
			await postJson(path, body)
			if (ok) say(ok)
			await load()
		} catch (error) { say(error.message, false) }
	}

	const tags = state.tags || []
	const devices = state.devices || []
	const tasks = state.tasks || []
	const checkins = state.checkins || []

	return h("div", { className: "wrap" },
		h("p", { className: "kicker" }, "Work ledger"),
		h("h1", null, "循环任务"),
		h("p", { className: "lede" }, "机房值班台账。数据在 D:\\dsh-datacenter。设备未联通时，巡检只记「未接线」。"),
		state.duty?.message ? h("p", { className: "warn" }, state.duty.message) : null,
		h("div", { className: "card" },
			h("h2", null, "监控指标标签"),
			GROUPS.map((group) => {
				const items = tags.filter((item) => item.group === group)
				if (!items.length) return null
				return h("div", { key: group },
					h("h3", null, group),
					h("div", { className: "chips" }, items.map((item) => h("span", { key: item.id, className: "chip", title: item.note }, `${item.label} `, h("code", null, item.id)))),
				)
			}),
			h("div", { className: "row" },
				h("input", { placeholder: "新标签 id，如 fw-ids", value: tag.id, onChange: (e) => setTag({ ...tag, id: e.target.value }) }),
				h("input", { placeholder: "显示名", value: tag.label, onChange: (e) => setTag({ ...tag, label: e.target.value }) }),
				h("select", { value: tag.group, onChange: (e) => setTag({ ...tag, group: e.target.value }) },
					["firewall", "switch", "server", "duty"].map((g) => h("option", { key: g }, g)),
				),
				h("button", { type: "button", onClick: () => run("/plugins/dsh-datacenter/api/tag", tag, "已加标签") }, "添加标签"),
			),
		),
		h("div", { className: "card" },
			h("h2", null, "设备与已挂标签"),
			h("div", { className: "paper-scroll", tabIndex: 0, "aria-label": "设备台账" },
				h("table", null,
					h("thead", null, h("tr", null, h("th", null, "id"), h("th", null, "名称"), h("th", null, "类型"), h("th", null, "接线"), h("th", null, "标签"))),
					h("tbody", null, devices.map((item) => h("tr", { key: item.id },
						h("td", null, item.id), h("td", null, item.name), h("td", null, item.type),
						h("td", null, item.wired ? "已接线" : "未联通"),
						h("td", null, (item.tags ?? []).map((t) => h("code", { key: t }, t))),
					))),
				),
			),
			h("div", { className: "row" },
				h("select", { value: devId, onChange: (e) => setDevId(e.target.value) },
					devices.map((item) => h("option", { key: item.id, value: item.id }, item.id)),
				),
				h("input", { placeholder: "标签，逗号分隔", style: { minWidth: 280 }, value: devTags, onChange: (e) => setDevTags(e.target.value) }),
				h("button", { type: "button", onClick: () => run("/plugins/dsh-datacenter/api/device-tags", { id: devId, tags: devTags.split(",").map((s) => s.trim()).filter(Boolean) }, "已保存设备标签") }, "保存设备标签"),
			),
		),
		h("div", { className: "card" },
			h("h2", null, "循环任务"),
			h("div", { className: "paper-scroll", tabIndex: 0, "aria-label": "循环任务" },
				h("table", null,
					h("thead", null, h("tr", null, h("th", null, "任务"), h("th", null, "类型"), h("th", null, "状态"), h("th", null, "周期"), h("th", null, "设备"), h("th", null, "上次"), h("th", null, ""))),
					h("tbody", null, tasks.map((item) => h("tr", { key: item.id },
						h("td", null, item.title), h("td", null, item.kind), h("td", null, item.enabled ? "开" : "关"),
						h("td", null, `${item.every} ${item.at ?? ""}`), h("td", null, item.deviceId || "—"),
						h("td", null, item.lastResult?.status ?? "未跑"),
						h("td", { className: "actions" },
							h("button", { type: "button", className: "btn-soft", onClick: () => run("/plugins/dsh-datacenter/api/task", { id: item.id, enabled: !item.enabled }) }, item.enabled ? "停用" : "启用"),
							h("button", {
								type: "button",
								className: `btn-danger${armed === item.id ? " is-armed" : ""}`,
								onClick: () => {
									if (!arm(item.id)) { say(`再点一次确认移除「${item.title}」`); return }
									run("/plugins/dsh-datacenter/api/task/delete", { id: item.id }, "已移除")
								},
							}, armed === item.id ? "确认删除" : "移除"),
						),
					))),
				),
			),
			h("div", { className: "row" },
				h("input", { placeholder: "任务名，如 每天自动打卡", value: task.title, onChange: (e) => setTask({ ...task, title: e.target.value }) }),
				h("select", { value: task.kind, onChange: (e) => setTask({ ...task, kind: e.target.value }) },
					h("option", { value: "checkin" }, "打卡"), h("option", { value: "monitor" }, "巡检"), h("option", { value: "custom" }, "自定义"),
				),
				h("select", { value: task.every, onChange: (e) => setTask({ ...task, every: e.target.value }) },
					h("option", { value: "daily" }, "每天"), h("option", { value: "weekdays" }, "工作日"), h("option", { value: "hourly" }, "每小时"),
				),
				h("input", { value: task.at, style: { width: 80 }, onChange: (e) => setTask({ ...task, at: e.target.value }) }),
				h("input", { placeholder: "设备 id，巡检用", value: task.deviceId, onChange: (e) => setTask({ ...task, deviceId: e.target.value }) }),
				h("input", { placeholder: "指标标签，逗号分隔", value: task.tags, onChange: (e) => setTask({ ...task, tags: e.target.value }) }),
				h("button", { type: "button", onClick: () => run("/plugins/dsh-datacenter/api/task", { ...task, tags: task.tags.split(",").map((s) => s.trim()).filter(Boolean), enabled: true }, "已添加任务") }, "添加任务"),
				h("button", { type: "button", className: "btn-quiet", onClick: () => run("/plugins/dsh-datacenter/api/checkin", { note: "manual" }, "已打卡") }, "现在打卡"),
			),
		),
		toast,
		h("div", { className: "card" },
			h("h2", null, "打卡记录"),
			h("ul", { className: "timeline paper-scroll", tabIndex: 0, "aria-label": "打卡记录" },
				checkins.length ? checkins.map((item, i) => h("li", { key: `${item.at}-${i}` }, `${item.at} · ${item.title}`)) : h("li", null, "还没有打卡记录"),
			),
		),
	)
}
