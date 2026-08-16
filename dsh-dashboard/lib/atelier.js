import { createApp, ref, computed, onMounted, watch } from "/plugins/dsh-dashboard/vue.esm-browser.js"

const PAGES = {
	book: { kicker: "Book atelier", title: "书籍转技能", lede: "本地书或检索入册，五段工序、三道人审。做成技能后可装进工作台。" },
	trail: { kicker: "Trace wall", title: "轨迹", lede: "本会话走过的提示、工具和回合，按时间铺开。不是监控大屏的示意数。" },
	memory: { kicker: "Memory ledger", title: "记忆", lede: "规则、用户档案、项目关键事实和日志。删除走两步确认，避免误抹一条。" },
	skills: { kicker: "Skill atelier", title: "技能", lede: "已装技能和待确认建议。停用不会删文件，只是先不注入对话。" },
	todos: { kicker: "Duty slips", title: "待办", lede: "生活 / 工作 / 本项目 / 今日四本册子。完成、改写、移除都在这张纸上。" },
	craft: { kicker: "Craft desk", title: "派活台", lede: "问一问 / 想一想 / 做一做，任务卡、选区改稿、目标挂起。" },
}

const BOOK_STAGES = [
	{ id: 1, label: "获取书籍" },
	{ id: 2, label: "解析分章" },
	{ id: 3, label: "深度阅读" },
	{ id: 4, label: "生成技能" },
	{ id: 5, label: "安装" },
]

const BOOK_STATUS = {
	pending: "待解析", fetching: "下载中", parsing: "解析中", parsed: "已解析",
	reading: "浅读中", awaiting_gate1: "门控1：等你", deep_reading: "深读中",
	drafting: "起草中", awaiting_gate2: "门控2：等你", installing: "安装中",
	awaiting_gate3: "门控3：等你", installed: "已安装", cancelled: "已取消", failed: "失败",
}

const TODO_TRACKS = [
	{ id: "life", label: "生活" },
	{ id: "work", label: "工作" },
	{ id: "project", label: "本项目" },
	{ id: "daily", label: "今日" },
]

const QUADS = [
	{ id: "q1", label: "重要且紧急" },
	{ id: "q2", label: "重要不紧急" },
	{ id: "q3", label: "紧急不重要" },
	{ id: "q4", label: "不紧急不重要" },
]

const ENTRY_DELIM = "\n§\n"

function pageFromHash() {
	const raw = (location.hash.replace(/^#\/?/, "") || new URLSearchParams(location.search).get("page") || "memory").split("?")[0]
	return PAGES[raw] ? raw : "memory"
}

function sessionId() {
	return new URLSearchParams(location.search).get("session")
		|| new URLSearchParams(location.hash.split("?")[1] || "").get("session")
		|| ""
}

async function json(url, init) {
	const res = await fetch(url, {
		...init,
		headers: { "content-type": "application/json", ...(init?.headers || {}) },
	})
	let body = {}
	try { body = await res.json() } catch { /* 空体 */ }
	if (!res.ok) throw new Error(body.message || body.error || `请求失败 ${res.status}`)
	return body
}

function parseEntries(row) {
	const prefix = row.key === "project"
		? /^\[(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}(?::\d{2})?)\]\s*/
		: row.key === "daily"
			? /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*/
			: /^\[(\d{4}-\d{2}-\d{2})\]\s*/
	const out = []
	for (const chunk of String(row.content || "").split(ENTRY_DELIM)) {
		let text = chunk.trim()
		if (!text) continue
		const raw = text
		let time = null
		const hit = prefix.exec(text)
		if (hit) {
			time = hit[1]
			text = text.slice(hit[0].length)
		}
		text = text.replace(/^\[git [^\]]+\]\s*/, "").replace(/\[dsh-only\]\s*/g, "").replace(/\[branch:[^\]]*\]\s*/, "")
		out.push({ time, text, raw })
	}
	return out
}

function eventKind(event) {
	const type = String(event?.type || event?.kind || "")
	if (/user|prompt/i.test(type)) return { tone: "user", label: "你" }
	if (/assistant|message/i.test(type)) return { tone: "ok", label: "回答" }
	if (/tool/i.test(type)) return { tone: "warn", label: "工具" }
	if (/error|fail/i.test(type)) return { tone: "danger", label: "失败" }
	return { tone: "muted", label: type || "事件" }
}

function eventText(event) {
	const raw = event?.message || event?.content || event?.text || event?.name || event?.tool || ""
	if (typeof raw === "string") return raw
	if (Array.isArray(raw)) {
		return raw.map((part) => part?.text || part?.content || "").filter(Boolean).join("\n")
	}
	try { return JSON.stringify(raw) } catch { return String(raw) }
}

export function mountAtelier(root) {
	const app = createApp({
		template: `
		<div class="atelier-wrap">
			<div class="atelier-mast">
				<div>
					<p class="kicker">{{ meta.kicker }}</p>
					<h1>{{ meta.title }}</h1>
					<p class="lede">{{ meta.lede }}</p>
					<nav class="nav">
						<a href="/plugins/dsh-dashboard/wall">数据大屏</a>
						<a href="/plugins/dsh-datacenter/board">循环任务</a>
						<a href="/plugins/dsh-docs/inbox">知识库</a>
					</nav>
				</div>
				<div class="atelier-tools">
					<button type="button" class="btn-soft" @click="reload">刷新台账</button>
				</div>
			</div>
			<div class="kpi-row">
				<button v-for="item in kpis" :key="item.id" type="button" class="kpi">
					<b>{{ item.value }}</b>
					<span>{{ item.label }}</span>
					<small>{{ item.hint }}</small>
				</button>
			</div>
			<book-page v-if="page==='book'" :busy="busy" @toast="say" @busy="setBusy" @stats="setStats"/>
			<trail-page v-else-if="page==='trail'" :session="session" @toast="say" @stats="setStats"/>
			<memory-page v-else-if="page==='memory'" :session="session" :busy="busy" @toast="say" @busy="setBusy" @stats="setStats"/>
			<skills-page v-else-if="page==='skills'" :session="session" :busy="busy" @toast="say" @busy="setBusy" @stats="setStats"/>
			<craft-page v-else-if="page==='craft'" @stats="setStats"/>
			<todos-page v-else :session="session" :busy="busy" @toast="say" @busy="setBusy" @stats="setStats"/>
			<div id="toast" class="toast" :class="{ show: toast.on, bad: toast.bad }" role="status">{{ toast.text }}</div>
		</div>
		`,
		setup() {
			const page = ref(pageFromHash())
			const session = ref(sessionId())
			const busy = ref(false)
			const stats = ref([])
			const toast = ref({ on: false, bad: false, text: "" })
			let toastTimer
			const meta = computed(() => PAGES[page.value])
			const kpis = computed(() => stats.value)

			function say(text, ok = true) {
				toast.value = { on: true, bad: !ok, text }
				clearTimeout(toastTimer)
				toastTimer = setTimeout(() => { toast.value = { ...toast.value, on: false } }, 2600)
			}
			function setBusy(next) { busy.value = Boolean(next) }
			function setStats(rows) { stats.value = rows || [] }
			function reload() { window.dispatchEvent(new Event("atelier-reload")) }

			onMounted(() => {
				window.addEventListener("hashchange", () => { page.value = pageFromHash() })
			})

			return { page, session, busy, toast, meta, kpis, say, setBusy, setStats, reload }
		},
	})

	app.component("book-page", {
		props: ["busy"],
		emits: ["toast", "busy", "stats"],
		template: `
		<div class="split wide-side">
			<aside class="rail card">
				<h2>新开一本</h2>
				<div class="drop" role="button" tabindex="0" @click="openBrowse" @keydown.enter.prevent="openBrowse">
					<div class="drop-mark">+</div>
					<p class="drop-title">选取文稿路径</p>
					<p class="drop-sub">写下 EPUB / PDF 的绝对路径，或点这里浏览本机目录。</p>
					<span class="btn btn-primary">浏览书架</span>
					<div class="drop-names">{{ bookPath || "尚未选取" }}</div>
				</div>
				<div class="field" style="margin-top:14px">
					<label>本机路径</label>
					<input v-model="bookPath" class="grow" placeholder="D:\\books\\某书.epub"/>
				</div>
				<div class="field">
					<label>书名（可选）</label>
					<input v-model="title" class="grow" placeholder="缺省取文件名"/>
				</div>
				<div class="field-row">
					<button type="button" class="btn-primary" :disabled="busy || (!bookPath && !title)" @click="create">创建任务</button>
					<button type="button" class="btn-quiet" @click="zlibOpen = !zlibOpen">{{ zlibOpen ? "收起检索" : "检索书目" }}</button>
				</div>
				<div v-if="zlibOpen" class="field" style="margin-top:12px">
					<div class="field-row">
						<input v-model="zlibQ" class="grow" placeholder="书名 / 作者 / ISBN" @keydown.enter.prevent="searchZlib"/>
						<button type="button" class="btn-soft" @click="searchZlib">检索</button>
					</div>
					<p v-if="zlibHint" class="hint">{{ zlibHint }}</p>
					<div class="slip-list paper-scroll" tabindex="0" aria-label="检索结果">
					<button v-for="(row, i) in zlibRows" :key="row.download + i" type="button" class="slip" :class="{ 'is-on': zlibPick===i }" @click="zlibPick = i">
						<strong>{{ row.title }}</strong>
						<em>{{ row.author }} · {{ row.year }} · {{ row.extension }}</em>
					</button>
					</div>
					<button v-if="zlibRows.length" type="button" class="btn-primary" :disabled="zlibPick===null || busy" @click="downloadZlib">下载并开册</button>
				</div>
				<h3>任务</h3>
				<p v-if="!jobs.length" class="empty">还没有册子。选一本书开始。</p>
				<div class="slip-list paper-scroll" tabindex="0" aria-label="册子任务">
					<button v-for="row in jobs" :key="row.id" type="button" class="slip" :class="{ 'is-on': selected===row.id }" @click="select(row.id)">
						<strong>{{ row.title }}</strong>
						<em>{{ statusOf(row.status) }} · 阶段 {{ row.stage }}</em>
					</button>
				</div>
			</aside>
			<section class="pane">
				<p v-if="!job" class="empty card">左侧选一本，看五段进度和人审。</p>
				<template v-else>
					<div class="card">
						<div class="atelier-mast" style="border:0;padding:0;margin:0 0 12px">
							<div>
								<p class="kicker">{{ job.id }}</p>
								<h2>{{ job.title || job.id }}</h2>
								<p class="lede">{{ statusOf(job.status) }}{{ job.error ? " · " + job.error : "" }}</p>
							</div>
							<button v-if="activeJob" type="button" class="btn-danger" :class="{ 'is-armed': armed }" :disabled="busy" @click="cancel">{{ armed ? "确认取消" : "移除任务" }}</button>
						</div>
						<div class="stage-row">
							<div v-for="stage in stages" :key="stage.id" class="stage" :class="stageClass(stage.id)">
								<b>{{ stage.id }}</b>
								<span>{{ stage.label }}</span>
							</div>
						</div>
					</div>
					<div class="card">
						<h2>本段详情</h2>
						<p v-if="job.book?.path"><code>{{ job.book.path }}</code> · {{ job.book.format || "未解析" }}</p>
						<div v-if="job.ocr && job.ocr.state!=='done'" class="progress" aria-hidden="true"><i :style="{ width: ocrPct + '%' }"></i></div>
						<p v-if="job.ocr" class="hint">OCR {{ job.ocr.page }}/{{ job.ocr.total }} {{ job.ocr.message || "" }}</p>
						<ul class="timeline paper-scroll" tabindex="0" aria-label="章节">
							<li v-for="ch in job.chapters || []" :key="ch.file">{{ ch.title }} · {{ ch.chars }} 字</li>
						</ul>
						<div v-if="job.gate1?.questions?.length" class="gate">
							<h3>门控 1 · 作答</h3>
							<div v-for="q in job.gate1.questions" :key="q.id" class="field">
								<label>{{ q.question }}</label>
								<p class="hint">{{ q.detail }}</p>
								<label v-for="opt in q.options" :key="opt.label" class="field-row">
									<input type="checkbox" :value="opt.label" v-model="answers[q.id]"/>
									<span>{{ opt.label }}</span>
								</label>
							</div>
							<button type="button" class="btn-primary" :disabled="busy" @click="submitGate1">提交作答</button>
						</div>
						<div v-if="job.skill?.draft" class="gate">
							<h3>门控 2 · 技能稿</h3>
							<textarea v-model="draft" rows="12" style="width:100%"></textarea>
							<div class="field-row" style="margin-top:10px">
								<button type="button" class="btn-primary" :disabled="busy" @click="decide('pass')">通过</button>
								<button type="button" class="btn-soft" :disabled="busy" @click="decide('regenerate')">重写</button>
							</div>
						</div>
						<div v-if="job.stage===5" class="gate">
							<h3>门控 3 · 安装</h3>
							<button type="button" class="btn-primary" :disabled="busy" @click="confirmInstall">确认安装</button>
						</div>
					</div>
				</template>
			</section>
			<div v-if="browse" class="modal-back" @click.self="browse=false">
				<div class="modal">
					<h2>浏览书架</h2>
					<div class="crumb-row">
						<button v-for="crumb in listing.crumbs || []" :key="crumb.path" type="button" class="crumb" @click="listDir(crumb.path)">{{ crumb.name }}/</button>
					</div>
					<ul class="dir-list">
						<li v-for="entry in listing.entries || []" :key="entry.path">
							<button type="button" @click="pickOrEnter(entry)">{{ entry.name }}</button>
						</li>
					</ul>
					<div class="field-row">
						<button type="button" class="btn-primary" @click="useDir">用这个目录</button>
						<button type="button" class="btn-quiet" @click="browse=false">取消</button>
					</div>
				</div>
			</div>
		</div>
		`,
		setup(props, { emit }) {
			const jobs = ref([])
			const selected = ref("")
			const job = ref(null)
			const bookPath = ref("")
			const title = ref("")
			const browse = ref(false)
			const listing = ref({ crumbs: [], entries: [] })
			const zlibOpen = ref(false)
			const zlibQ = ref("")
			const zlibRows = ref([])
			const zlibPick = ref(null)
			const zlibHint = ref("")
			const answers = ref({})
			const draft = ref("")
			const armed = ref(false)
			let armTimer
			const stages = BOOK_STAGES
			const activeJob = computed(() => job.value && !["installed", "cancelled", "failed"].includes(job.value.status))
			const ocrPct = computed(() => {
				const ocr = job.value?.ocr
				if (!ocr?.total) return 0
				return Math.min(100, Math.round((ocr.page / ocr.total) * 100))
			})

			function statusOf(status) { return BOOK_STATUS[status] || status }
			function stageClass(id) {
				if (!job.value) return ""
				if (id < job.value.stage) return "is-done"
				if (id === job.value.stage) return String(job.value.status || "").startsWith("awaiting") ? "is-on is-wait" : "is-on"
				return ""
			}
			function setStats() {
				const rows = jobs.value
				emit("stats", [
					{ id: "jobs", value: rows.length, label: "册子", hint: "已开任务" },
					{ id: "wait", value: rows.filter((row) => String(row.status).startsWith("awaiting")).length, label: "等人审", hint: "门控未过" },
					{ id: "done", value: rows.filter((row) => row.status === "installed").length, label: "已安装", hint: "可调用" },
					{ id: "fail", value: rows.filter((row) => row.status === "failed").length, label: "失败", hint: "需重开" },
					{ id: "run", value: rows.filter((row) => !["installed", "cancelled", "failed"].includes(row.status)).length, label: "在办", hint: "工序未完" },
				])
			}
			async function loadJobs() {
				const data = await json("/book2skill/jobs")
				jobs.value = data.jobs || []
				setStats()
			}
			async function select(id) {
				selected.value = id
				const data = await json(`/book2skill/jobs/${encodeURIComponent(id)}`)
				job.value = data.job
				draft.value = data.job?.skill?.draft || ""
				answers.value = {}
			}
			async function create() {
				emit("busy", true)
				try {
					const data = await json("/book2skill/jobs", { method: "POST", body: JSON.stringify({ bookPath: bookPath.value || undefined, title: title.value || undefined }) })
					await loadJobs()
					await select(data.job.id)
					emit("toast", "册子已开")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function cancel() {
				if (!armed.value) {
					armed.value = true
					clearTimeout(armTimer)
					armTimer = setTimeout(() => { armed.value = false }, 3000)
					return
				}
				armed.value = false
				emit("busy", true)
				try {
					const data = await json(`/book2skill/jobs/${encodeURIComponent(job.value.id)}/cancel`, { method: "POST" })
					job.value = data.job
					await loadJobs()
					emit("toast", "任务已取消")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function listDir(path) {
				const data = await json(`/book2skill/picker/list${path ? `?path=${encodeURIComponent(path)}` : ""}`)
				listing.value = data.listing || { crumbs: [], entries: [] }
			}
			async function openBrowse() {
				try {
					await listDir(bookPath.value || undefined)
					browse.value = true
				} catch (error) {
					emit("toast", error.message + "。请直接填写绝对路径。", false)
				}
			}
			function pickOrEnter(entry) {
				if (/\.(epub|pdf)$/i.test(entry.name)) {
					bookPath.value = entry.path
					browse.value = false
					return
				}
				listDir(entry.path)
			}
			function useDir() {
				bookPath.value = listing.value.path || bookPath.value
				browse.value = false
			}
			async function searchZlib() {
				const data = await json("/book2skill/zlib/search", { method: "POST", body: JSON.stringify({ query: zlibQ.value }) })
				if (data.needAuth) { zlibHint.value = data.hint || "需要登录"; zlibRows.value = []; return }
				zlibRows.value = data.rows || []
				zlibHint.value = zlibRows.value.length ? "" : "没有结果"
				zlibPick.value = null
			}
			async function downloadZlib() {
				const row = zlibRows.value[zlibPick.value]
				if (!row) return
				emit("busy", true)
				try {
					const created = await json("/book2skill/jobs", { method: "POST", body: JSON.stringify({ title: row.title }) })
					const data = await json("/book2skill/zlib/download", { method: "POST", body: JSON.stringify({ jobId: created.job.id, downloadPath: row.download }) })
					await loadJobs()
					await select(data.job.id)
					emit("toast", "已下载并开册")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function submitGate1() {
				const payload = (job.value.gate1.questions || []).map((q) => ({ id: q.id, selected: answers.value[q.id] || [] }))
				emit("busy", true)
				try {
					const data = await json(`/book2skill/jobs/${encodeURIComponent(job.value.id)}/gate1/answer`, { method: "POST", body: JSON.stringify({ answers: payload }) })
					job.value = data.job
					emit("toast", "门控 1 已交")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function decide(verdict) {
				emit("busy", true)
				try {
					const data = await json(`/book2skill/jobs/${encodeURIComponent(job.value.id)}/gate2/decision`, { method: "POST", body: JSON.stringify({ verdict, draft: draft.value }) })
					job.value = data.job
					emit("toast", verdict === "pass" ? "稿子已过" : "已请重写")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function confirmInstall() {
				emit("busy", true)
				try {
					const data = await json(`/book2skill/jobs/${encodeURIComponent(job.value.id)}/gate3/confirm`, { method: "POST" })
					job.value = data.job
					await loadJobs()
					emit("toast", "已确认安装")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}

			onMounted(async () => {
				try { await loadJobs() } catch (error) { emit("toast", error.message, false) }
				window.addEventListener("atelier-reload", () => { loadJobs().catch((error) => emit("toast", error.message, false)) })
			})

			return {
				jobs, selected, job, bookPath, title, browse, listing, zlibOpen, zlibQ, zlibRows, zlibPick, zlibHint,
				answers, draft, armed, stages, activeJob, ocrPct, statusOf, stageClass, select, create, cancel,
				listDir, openBrowse, pickOrEnter, useDir, searchZlib, downloadZlib, submitGate1, decide, confirmInstall,
			}
		},
	})

	app.component("trail-page", {
		props: ["session"],
		emits: ["toast", "stats"],
		template: `
		<div>
			<div class="card">
				<h2>本会话轨迹</h2>
				<div class="paper-scroll" tabindex="0" aria-label="本会话轨迹">
				<p v-if="!events.length" class="empty">{{ hint }}</p>
				<button v-for="item in events" :key="item.id" type="button" class="task" :class="'tone-' + item.tone">
					<span>
						<strong>{{ item.label }}</strong>
						<em>{{ item.at }} · {{ item.kind }}</em>
						<p class="hint" style="margin:8px 0 0">{{ item.text }}</p>
					</span>
					<span class="stamp">{{ item.seq }}</span>
				</button>
				</div>
			</div>
		</div>
		`,
		setup(props, { emit }) {
			const events = ref([])
			const hint = ref("正在读本会话日志…")

			function paint(rows) {
				events.value = rows
				emit("stats", [
					{ id: "all", value: rows.length, label: "事件", hint: "本会话" },
					{ id: "user", value: rows.filter((row) => row.tone === "user").length, label: "你的话", hint: "提示" },
					{ id: "tool", value: rows.filter((row) => row.tone === "warn").length, label: "工具", hint: "调用" },
					{ id: "ok", value: rows.filter((row) => row.tone === "ok").length, label: "回答", hint: "模型" },
					{ id: "bad", value: rows.filter((row) => row.tone === "danger").length, label: "失败", hint: "报错" },
				])
			}

			async function load() {
				const sid = props.session
				if (!sid) {
					hint.value = "还没有会话编号。回到对话页再说一句，再打开轨迹。"
					paint([])
					return
				}
				try {
					const res = await fetch(`/api/session.export?sessionId=${encodeURIComponent(sid)}`)
					if (!res.ok) throw new Error(`导出失败 ${res.status}`)
					const text = await res.text()
					const rows = []
					for (const line of text.split(/\r?\n/)) {
						if (!line.trim()) continue
						try {
							const event = JSON.parse(line)
							const kind = eventKind(event)
							rows.push({
								id: event.seq ?? event.id ?? rows.length,
								seq: event.seq ?? rows.length,
								at: event.at ? String(event.at).replace("T", " ").slice(0, 19) : "",
								kind: event.type || event.kind || "event",
								label: kind.label,
								tone: kind.tone,
								text: String(eventText(event)).slice(0, 280),
							})
						} catch { /* 非 JSON 行 */ }
					}
					if (!rows.length) hint.value = "这份日志还是空的，先在对话里走几步。"
					paint(rows.slice(-80).reverse())
				} catch (error) {
					hint.value = error.message
					paint([])
					emit("toast", error.message, false)
				}
			}

			onMounted(() => {
				load()
				window.addEventListener("atelier-reload", load)
			})
			watch(() => props.session, load)

			return { events, hint }
		},
	})

	app.component("memory-page", {
		props: ["session", "busy"],
		emits: ["toast", "busy", "stats"],
		template: `
		<div>
			<div class="filter-row">
				<button v-for="file in files" :key="file.key" type="button" class="chip" :class="{ 'is-on': track===file.key }" @click="track = file.key" style="cursor:pointer;border:1px solid var(--line)">
					{{ file.title }} · {{ counts[file.key] || 0 }}
				</button>
			</div>
			<div v-if="track==='key'" class="card">
				<h2>记一条关键事实</h2>
				<div class="field">
					<label>写入 KEY.md</label>
					<textarea v-model="fresh" rows="3" placeholder="只写已确认、可长期用的事实"></textarea>
				</div>
				<button type="button" class="btn-primary" :disabled="busy || !fresh.trim()" @click="addKey">入册</button>
			</div>
			<div class="card">
				<h2>{{ current?.title || "记忆" }}</h2>
				<div class="paper-scroll" tabindex="0" aria-label="记忆条目">
				<p v-if="!entries.length" class="empty">这条轨还是空的。</p>
				<article v-for="entry in entries" :key="entry.raw" class="entry">
					<header>
						<span class="stamp">{{ entry.time || "未标时" }}</span>
						<button type="button" class="btn-danger" :class="{ 'is-armed': armed===entry.raw }" @click="remove(entry)">{{ armed===entry.raw ? "确认删除" : "移除" }}</button>
					</header>
					<p>{{ entry.text }}</p>
				</article>
				</div>
			</div>
		</div>
		`,
		setup(props, { emit }) {
			const files = ref([])
			const track = ref("key")
			const fresh = ref("")
			const armed = ref("")
			let armTimer
			const counts = computed(() => {
				const map = {}
				for (const file of files.value) map[file.key] = parseEntries(file).length
				return map
			})
			const current = computed(() => files.value.find((file) => file.key === track.value))
			const entries = computed(() => current.value ? parseEntries(current.value) : [])

			function setStats() {
				const all = files.value.flatMap(parseEntries)
				emit("stats", [
					{ id: "all", value: all.length, label: "条目", hint: "各轨合计" },
					{ id: "key", value: counts.value.key || 0, label: "关键", hint: "KEY.md" },
					{ id: "daily", value: counts.value.daily || 0, label: "今日", hint: "日志" },
					{ id: "user", value: counts.value.user || 0, label: "用户", hint: "档案" },
					{ id: "mem", value: counts.value.memory || 0, label: "长期", hint: "MEMORY" },
				])
			}
			async function load() {
				const q = props.session ? `?sessionId=${encodeURIComponent(props.session)}` : ""
				const data = await json(`/memory-evolve/api/memory-files${q}`)
				files.value = data.files || []
				if (!files.value.some((file) => file.key === track.value) && files.value[0]) track.value = files.value[0].key
				setStats()
			}
			async function addKey() {
				emit("busy", true)
				try {
					await json("/memory-evolve/api/memory/key", { method: "POST", body: JSON.stringify({ sessionId: props.session, content: fresh.value.trim() }) })
					fresh.value = ""
					await load()
					emit("toast", "关键事实已入册")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function remove(entry) {
				if (armed.value !== entry.raw) {
					armed.value = entry.raw
					clearTimeout(armTimer)
					armTimer = setTimeout(() => { armed.value = "" }, 3000)
					return
				}
				armed.value = ""
				emit("busy", true)
				try {
					await json("/memory-evolve/api/memory/delete", { method: "POST", body: JSON.stringify({ sessionId: props.session, target: track.value, match: entry.raw }) })
					await load()
					emit("toast", "已删除这一条")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}

			onMounted(() => {
				load().catch((error) => emit("toast", error.message, false))
				window.addEventListener("atelier-reload", () => load().catch((error) => emit("toast", error.message, false)))
			})
			watch(() => props.session, () => load().catch((error) => emit("toast", error.message, false)))

			return { files, track, fresh, armed, counts, current, entries, addKey, remove }
		},
	})

	app.component("skills-page", {
		props: ["session", "busy"],
		emits: ["toast", "busy", "stats"],
		template: `
		<div class="split">
			<aside class="rail card">
				<h2>待确认</h2>
				<div class="paper-scroll" tabindex="0" aria-label="待确认技能">
				<p v-if="!pending.length" class="empty">没有待审技能。</p>
				<article v-for="item in pending" :key="item.name" class="entry">
					<header><strong>{{ item.name }}</strong></header>
					<p class="hint">{{ item.description || "无说明" }}</p>
					<div class="field-row">
						<button type="button" class="btn-soft" :disabled="busy" @click="approve(item)">采纳</button>
						<button type="button" class="btn-danger" :class="{ 'is-armed': armed===item.name }" :disabled="busy" @click="reject(item)">{{ armed===item.name ? "确认退回" : "移除" }}</button>
					</div>
				</article>
				</div>
			</aside>
			<section class="pane card">
				<h2>技能库</h2>
				<div class="filter-row">
					<input v-model="q" class="grow" placeholder="按名或说明筛选"/>
				</div>
				<div class="paper-scroll" tabindex="0" aria-label="技能库">
				<button v-for="skill in shown" :key="skill.name + skill.source" type="button" class="task" :class="skill.disabled ? 'tone-muted' : 'tone-ok'">
					<span>
						<strong>{{ skill.name }}</strong>
						<em>{{ skill.source }} · {{ skill.disabled ? "已停用" : "注入中" }}</em>
						<p class="hint" style="margin:8px 0 0">{{ skill.description || skill.whenToUse || "" }}</p>
					</span>
					<button type="button" class="btn-soft" :disabled="busy || skill.protected" @click.stop="toggle(skill)">{{ skill.disabled ? "启用" : "停用" }}</button>
				</button>
				</div>
			</section>
		</div>
		`,
		setup(props, { emit }) {
			const skills = ref([])
			const pending = ref([])
			const q = ref("")
			const armed = ref("")
			let armTimer
			const shown = computed(() => {
				const needle = q.value.trim().toLowerCase()
				return skills.value.filter((skill) => !needle || `${skill.name} ${skill.description || ""}`.toLowerCase().includes(needle))
			})

			function setStats() {
				emit("stats", [
					{ id: "all", value: skills.value.length, label: "技能", hint: "已扫描" },
					{ id: "on", value: skills.value.filter((skill) => !skill.disabled).length, label: "启用", hint: "会注入" },
					{ id: "off", value: skills.value.filter((skill) => skill.disabled).length, label: "停用", hint: "仍留盘" },
					{ id: "wait", value: pending.value.length, label: "待审", hint: "建议" },
					{ id: "prot", value: skills.value.filter((skill) => skill.protected).length, label: "受保护", hint: "不可关" },
				])
			}
			async function load() {
				const qid = props.session ? `?sessionId=${encodeURIComponent(props.session)}` : ""
				const [list, wait] = await Promise.all([
					json(`/skills-manager/api/skills${qid}`),
					json("/memory-evolve/api/pending-skills").catch(() => ({ entries: [] })),
				])
				skills.value = list.skills || []
				pending.value = wait.entries || []
				setStats()
			}
			async function toggle(skill) {
				emit("busy", true)
				try {
					const path = skill.disabled ? "/skills-manager/api/skills/enable" : "/skills-manager/api/skills/disable"
					await json(path, { method: "POST", body: JSON.stringify({ name: skill.name }) })
					await load()
					emit("toast", skill.disabled ? "已启用" : "已停用")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function approve(item) {
				emit("busy", true)
				try {
					await json("/memory-evolve/api/pending-skills/approve", { method: "POST", body: JSON.stringify({ name: item.name }) })
					await load()
					emit("toast", "已纳入技能库")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function reject(item) {
				if (armed.value !== item.name) {
					armed.value = item.name
					clearTimeout(armTimer)
					armTimer = setTimeout(() => { armed.value = "" }, 3000)
					return
				}
				armed.value = ""
				emit("busy", true)
				try {
					await json("/memory-evolve/api/pending-skills/reject", { method: "POST", body: JSON.stringify({ name: item.name }) })
					await load()
					emit("toast", "已退回这条建议")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}

			onMounted(() => {
				load().catch((error) => emit("toast", error.message, false))
				window.addEventListener("atelier-reload", () => load().catch((error) => emit("toast", error.message, false)))
			})

			return { skills, pending, q, armed, shown, toggle, approve, reject }
		},
	})

	app.component("craft-page", {
		emits: ["stats"],
		template: `
		<iframe class="craft-frame" src="/plugins/dsh-craft/desk" title="派活台" style="width:100%;min-height:70vh;border:0;border-radius:16px;background:#f4efe6"></iframe>
		`,
		setup(_props, { emit }) {
			onMounted(() => emit("stats", [
				{ id: "mode", value: "问想做", label: "工作档", hint: "输入栏也可切" },
				{ id: "task", value: "任务卡", label: "成果", hint: "原文 / 文件 / 微信" },
				{ id: "patch", value: "选区", label: "改稿", hint: "不整篇重写" },
				{ id: "goal", value: "目标", label: "挂起", hint: "做完再勾" },
			]))
			return {}
		},
	})

	app.component("todos-page", {
		props: ["session", "busy"],
		emits: ["toast", "busy", "stats"],
		template: `
		<div>
			<div class="card">
				<h2>新开一条</h2>
				<div class="field-row">
					<select v-model="draft.track">
						<option v-for="track in tracks" :key="track.id" :value="track.id">{{ track.label }}</option>
					</select>
					<select v-model="draft.quadrant">
						<option value="">未分象限</option>
						<option v-for="quad in quads" :key="quad.id" :value="quad.id">{{ quad.label }}</option>
					</select>
					<input v-model="draft.due" type="date"/>
					<input v-model="draft.text" class="grow" placeholder="要办的事" @keydown.enter.prevent="add"/>
					<button type="button" class="btn-primary" :disabled="busy || !draft.text.trim()" @click="add">入册</button>
				</div>
			</div>
			<div class="filter-row">
				<button v-for="track in [{id:'all',label:'全部'}, ...tracks]" :key="track.id" type="button" class="chip" style="cursor:pointer;border:1px solid var(--line)" :class="{ 'is-on': filter===track.id }" @click="filter = track.id">{{ track.label }}</button>
				<button type="button" class="btn-quiet" @click="board = !board">{{ board ? "列表" : "四象限" }}</button>
			</div>
			<div v-if="board" class="quad-grid">
				<section v-for="quad in quads" :key="quad.id" class="quad">
					<h3>{{ quad.label }}</h3>
					<article v-for="item in byQuad(quad.id)" :key="item.id" class="entry">
						<header>
							<span class="stamp">{{ trackLabel(item.target) }}</span>
							<button type="button" class="btn-soft" :disabled="busy" @click="done(item)">{{ item.status==='done' ? "已完成" : "完成" }}</button>
						</header>
						<p>{{ item.text }}</p>
					</article>
					<p v-if="!byQuad(quad.id).length" class="empty">这一格空着。</p>
				</section>
			</div>
			<div v-else class="card paper-scroll" tabindex="0" aria-label="待办列表">
				<p v-if="!shown.length" class="empty">没有未完事项。</p>
				<article v-for="item in shown" :key="item.id" class="entry">
					<header>
						<span class="stamp">{{ trackLabel(item.target) }} · {{ item.status }}{{ item.due ? " · " + item.due : "" }}</span>
						<div class="field-row">
							<button type="button" class="btn-soft" :disabled="busy || item.status==='done'" @click="done(item)">完成</button>
							<button type="button" class="btn-danger" :class="{ 'is-armed': armed===item.id }" :disabled="busy" @click="remove(item)">{{ armed===item.id ? "确认删除" : "移除" }}</button>
						</div>
					</header>
					<p>{{ item.text }}</p>
				</article>
			</div>
		</div>
		`,
		setup(props, { emit }) {
			const items = ref([])
			const filter = ref("all")
			const board = ref(true)
			const armed = ref("")
			const draft = ref({ track: "work", quadrant: "", due: "", text: "" })
			let armTimer
			const tracks = TODO_TRACKS
			const quads = QUADS
			const shown = computed(() => items.value.filter((item) => filter.value === "all" || item.target === filter.value))

			function trackLabel(id) { return tracks.find((track) => track.id === id)?.label || id }
			function byQuad(id) { return shown.value.filter((item) => (item.quadrant || "q2") === id && item.status !== "done") }
			function setStats() {
				emit("stats", [
					{ id: "all", value: items.value.length, label: "条目", hint: "当前视图" },
					{ id: "open", value: items.value.filter((item) => item.status !== "done" && item.status !== "cancelled").length, label: "未完", hint: "还在办" },
					{ id: "q1", value: items.value.filter((item) => item.quadrant === "q1" && item.status !== "done").length, label: "Q1", hint: "重要紧急" },
					{ id: "due", value: items.value.filter((item) => item.due).length, label: "有期", hint: "写了截止日期" },
					{ id: "done", value: items.value.filter((item) => item.status === "done").length, label: "完成", hint: "已勾" },
				])
			}
			async function load() {
				const params = new URLSearchParams({ all: "1" })
				if (props.session) params.set("sessionId", props.session)
				if (filter.value !== "all") params.set("target", filter.value)
				const data = await json(`/memory-evolve/api/todo?${params}`)
				items.value = data.items || []
				setStats()
			}
			async function add() {
				emit("busy", true)
				try {
					await json("/memory-evolve/api/todo", {
						method: "POST",
						body: JSON.stringify({
							action: "add",
							sessionId: props.session,
							target: draft.value.track,
							content: draft.value.text.trim(),
							quadrant: draft.value.quadrant || undefined,
							due: draft.value.due || undefined,
						}),
					})
					draft.value = { ...draft.value, text: "" }
					await load()
					emit("toast", "待办已入册")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function done(item) {
				if (item.status === "done") return
				emit("busy", true)
				try {
					await json("/memory-evolve/api/todo", { method: "POST", body: JSON.stringify({ action: "done", sessionId: props.session, target: item.target, id: item.id, date: item.day }) })
					await load()
					emit("toast", "已勾完")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}
			async function remove(item) {
				if (armed.value !== item.id) {
					armed.value = item.id
					clearTimeout(armTimer)
					armTimer = setTimeout(() => { armed.value = "" }, 3000)
					return
				}
				armed.value = ""
				emit("busy", true)
				try {
					await json("/memory-evolve/api/todo", { method: "POST", body: JSON.stringify({ action: "remove", sessionId: props.session, target: item.target, id: item.id, date: item.day }) })
					await load()
					emit("toast", "已移除")
				} catch (error) { emit("toast", error.message, false) }
				finally { emit("busy", false) }
			}

			onMounted(() => {
				load().catch((error) => emit("toast", error.message, false))
				window.addEventListener("atelier-reload", () => load().catch((error) => emit("toast", error.message, false)))
			})
			watch(filter, () => load().catch((error) => emit("toast", error.message, false)))
			watch(() => props.session, () => load().catch((error) => emit("toast", error.message, false)))

			return { items, filter, board, armed, draft, tracks, quads, shown, trackLabel, byQuad, add, done, remove }
		},
	})

	app.mount(root)
	return app
}
