import { formatBeijingTime } from "../time.js"
import { itemsFingerprint } from "../ledger.js"
import { postJson, useArmed, useToast } from "./ui.js"

const { createElement: h, useEffect, useRef, useState } = window.React

const STATUS_LABEL = {
	recorded: "仅记录",
	"empty-password": "口令空",
	queued: "排队",
	running: "在跑",
	replied: "已回图",
	replying: "回图中",
	"dispatch-failed": "派活失败",
	failed: "失败",
	"shot-failed": "回图失败",
}

function stamped(item) {
	if (item.action === "dispatch") return "带口令"
	if (item.action === "empty-password") return "口令空"
	return "闲聊"
}

function listenChip(state) {
	const keysStatus = state.keysStatus || "missing"
	if (keysStatus === "collecting") return "采集中"
	if (keysStatus === "missing" || keysStatus === "invalid") return "未采密钥"
	return state.listen ? "在听" : "未在听"
}

function mailChip(state) {
	if (state.mailConfigured === false || state.mailError === "未配置 QQ 邮箱") return "未配置 QQ 邮箱"
	if (state.mailLoggedIn && state.mailbox) return state.mailbox
	return "接通信匣"
}

export function DeskPage({ active }) {
	const [state, setState] = useState({ items: [], mail: [] })
	const [openId, setOpenId] = useState("")
	const [mailId, setMailId] = useState("")
	const [letter, setLetter] = useState(null)
	const fp = useRef("")
	const { say, node: toast } = useToast()
	const { armed, arm } = useArmed()

	useEffect(() => {
		if (!active) return undefined
		let alive = true
		const pull = async () => {
			if (document.visibilityState === "hidden") return
			try {
				const res = await fetch("/plugins/dsh-messenger/state")
				const next = await res.json()
				if (!alive || next.error) return
				const nextFp = itemsFingerprint(next.items)
				if (nextFp === fp.current && (next.mail || []).length === (state.mail || []).length) {
					setState((cur) => ({ ...cur, ...next, items: cur.items }))
					return
				}
				fp.current = nextFp
				setState(next)
			} catch { /* 轮询失败下一轮再试 */ }
		}
		pull()
		const timer = setInterval(pull, 2000)
		return () => {
			alive = false
			clearInterval(timer)
		}
	}, [active])

	const items = state.items || []
	const mail = state.mail || []
	const keysStatus = state.keysStatus || "missing"
	const showCollect = keysStatus === "missing" || keysStatus === "invalid" || keysStatus === "collecting"
	const loggedIn = Boolean(state.mailLoggedIn)

	const delItem = async (id) => {
		if (!arm(id)) {
			say(`再点一次确认移除「${id}」`)
			return
		}
		try {
			await postJson("/plugins/dsh-messenger/item/delete", { id })
			say("已移除")
			fp.current = ""
		} catch (error) { say(error.message, false) }
	}

	const act = async (path, body, ok) => {
		try {
			await postJson(path, body)
			if (ok) say(ok)
			fp.current = ""
		} catch (error) { say(error.message, false) }
	}

	return h("div", { className: "wrap desk-page" },
		h("header", { className: "desk-mast" },
			h("div", null,
				h("p", { className: "kicker" }, "Paper courier"),
				h("h1", null, "信使"),
				h("p", { className: "lede" }, "黄山专线只入库本机消息；邮箱台走 QQ 邮箱 IMAP/SMTP，授权码不印在页上。"),
				h("p", { className: "warn" }, "个人微信自动化有风控，PC 微信须登录。"),
			),
			h("div", { className: "desk-meta" },
				h("span", { className: "chip" }, listenChip(state)),
				h("span", { className: "chip" }, mailChip(state)),
				h("button", {
					type: "button",
					className: "btn-quiet",
					onClick: async () => {
						try {
							const res = await fetch("/plugins/dsh-messenger/mail/list")
							const data = await res.json()
							if (data.error) throw new Error(data.error)
							say(loggedIn ? "已刷新信匣" : "正在接通")
							fp.current = ""
						} catch (error) { say(error.message, false) }
					},
				}, loggedIn ? "刷新信匣" : "接通信匣"),
			),
		),
		h("div", { className: "desk-grid" },
			h("section", { className: "lane" },
				h("div", { className: "lane-head" },
					h("h2", null, "微信台账"),
					showCollect ? h("button", {
						type: "button",
						className: "btn-soft",
						onClick: () => act("/plugins/dsh-messenger/wx/keys/collect", {}, "开始采集密钥"),
					}, "采集密钥") : h("button", {
						type: "button",
						className: "btn-quiet",
						onClick: () => {
							if (!arm("keys")) { say("再点一次确认清除密钥"); return }
							act("/plugins/dsh-messenger/wx/keys/clear", {}, "已清除密钥")
						},
					}, armed === "keys" ? "确认清除" : "清除密钥"),
				),
				h("div", { className: "ledger ledger-scroll", tabIndex: 0, "aria-label": "微信台账" },
					items.length === 0
						? h("p", { className: "empty" }, "专线还安静。黄山会话里开口令「任务:」就会派活，本机绿气泡也算；闲聊只入库。")
						: items.map((item) => h(Slip, {
							key: item.id,
							item,
							open: openId === item.id,
							armed: armed === item.id,
							onOpen: () => setOpenId((cur) => cur === item.id ? "" : item.id),
							onRetry: () => act("/plugins/dsh-messenger/task/retry", { id: item.id, mode: "dispatch" }, "已再派一次"),
							onReshot: () => act("/plugins/dsh-messenger/task/retry", { id: item.id, mode: "shot" }, "已再截再发"),
							onDelete: () => delItem(item.id),
						})),
				),
			),
			h("section", { className: "lane" },
				h("div", { className: "lane-head" }, h("h2", null, "QQ 信匣")),
				loggedIn ? h("div", { className: "mail-work" },
					h("div", { className: "mail-list paper-scroll", tabIndex: 0, "aria-label": "邮件" },
						mail.length === 0
							? h("p", { className: "empty" }, "信匣空着。接通 QQ 邮箱后，发件人、主题、时间会落在这本台账上。")
							: mail.map((item) => h("button", {
								key: item.id,
								type: "button",
								className: `task${mailId === item.id ? " is-open" : ""}`,
								onClick: async () => {
									setMailId(item.id)
									try {
										const res = await fetch(`/plugins/dsh-messenger/mail/read?id=${encodeURIComponent(item.id)}`)
										const data = await res.json()
										if (data.error) throw new Error(data.error)
										setLetter(data)
									} catch (error) { say(error.message, false) }
								},
							},
								h("strong", null, item.subject || "（无主题）"),
								h("em", null, `${item.from || ""} · ${formatBeijingTime(item.at, { seconds: false })}`),
							)),
					),
					letter ? h("article", { className: "letter" },
						h("h3", null, letter.subject || "（无主题）"),
						h("p", { className: "letter-meta" }, letter.from || ""),
						h("p", { className: "letter-body" }, letter.text || letter.body || ""),
					) : null,
				) : h(MailGate, { error: state.mailError, onLogin: async (user, auth) => {
					try {
						await postJson("/plugins/dsh-messenger/mail/login", { user, auth })
						say("信匣已接通")
						fp.current = ""
					} catch (error) { say(error.message, false) }
				} }),
			),
		),
		toast,
	)
}

function MailGate({ error, onLogin }) {
	const [user, setUser] = useState("")
	const [auth, setAuth] = useState("")
	return h("div", { className: "mail-gate" },
		h("p", { className: "kicker" }, "QQ 邮箱"),
		h("h3", null, "接通信匣"),
		h("p", { className: "hint" }, "QQ 邮箱设置里开启 IMAP/SMTP，用授权码接通。授权码不是登录密码，保存后不回显。"),
		error && error !== "未配置 QQ 邮箱" ? h("p", { className: "hint mail-gate-err" }, error) : null,
		h("form", {
			className: "compose mail-auth",
			onSubmit: (event) => {
				event.preventDefault()
				onLogin(user, auth)
			},
		},
			h("label", null, "邮箱 ", h("input", { type: "email", value: user, autoComplete: "username", placeholder: "你的QQ号@qq.com", onChange: (e) => setUser(e.target.value) })),
			h("label", null, "授权码 ", h("input", { type: "password", value: auth, autoComplete: "current-password", placeholder: "邮箱设置里生成的授权码", onChange: (e) => setAuth(e.target.value) })),
			h("button", { type: "submit", className: "btn-primary" }, "接通信匣"),
		),
	)
}

function Slip({ item, open, armed, onOpen, onRetry, onReshot, onDelete }) {
	const showShot = item.status === "replied" || item.status === "shot-failed" || item.status === "replying"
	return h("article", { className: `slip${open ? " is-open" : ""}` },
		h("button", { type: "button", className: "slip-toggle", "aria-expanded": open ? "true" : "false", onClick: onOpen },
			h("strong", null, item.id || "未编号"),
			h("em", null, formatBeijingTime(item.at)),
			h("span", { className: "stamp" }, stamped(item)),
			h("span", { className: "stamp" }, STATUS_LABEL[item.status] ?? (item.status || "仅记录")),
		),
		h("div", { className: "slip-more" },
			h("p", { className: "slip-text" }, h("span", { className: "kicker" }, "原文"), item.text || item.prompt || "（空）"),
			h("p", { className: "slip-title" }, h("span", { className: "kicker" }, "会话标题"), item.title || "尚未开会话"),
			h("p", { className: "kicker" }, "成品"),
			h("ul", { className: "files" },
				(item.files ?? []).length
					? (item.files ?? []).map((file) => h("li", { key: file }, file))
					: h("li", { className: "hint" }, "尚无成品"),
			),
			h("div", { className: "shot-box" },
				showShot
					? h("img", { className: "shot-thumb", src: `/plugins/dsh-messenger/shot?id=${encodeURIComponent(item.id)}`, alt: `回图 ${item.id}`, loading: "lazy" })
					: h("p", { className: "hint shot-miss" }, "尚无回图"),
			),
			h("div", { className: "actions" },
				h("button", { type: "button", className: "btn-soft", onClick: onRetry }, "再派一次"),
				h("button", { type: "button", className: "btn-quiet", onClick: onReshot }, "再截再发"),
				h("button", { type: "button", className: `btn-danger${armed ? " is-armed" : ""}`, onClick: onDelete }, armed ? "确认删除" : "移除"),
			),
		),
	)
}
