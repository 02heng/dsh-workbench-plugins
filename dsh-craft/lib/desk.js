import { workThemeCss } from "./theme.css.js"

function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

const MODE_BTN = [
	{ id: "ask", label: "问一问", hint: "只答不改盘" },
	{ id: "plan", label: "想一想", hint: "先出做法" },
	{ id: "craft", label: "做一做", hint: "才写才发" },
]

const EXPERT_BTN = [
	{ id: "none", label: "不指定" },
	{ id: "official", label: "公文" },
	{ id: "thesis", label: "课题预审" },
	{ id: "duty", label: "值班" },
]

function chips(items, current, act) {
	return items.map((item) => `<button type="button" class="mode-pill${item.id === current ? " is-on" : ""}" data-act="${act}" data-id="${item.id}">
		<strong>${esc(item.label)}</strong>
		${item.hint ? `<em>${esc(item.hint)}</em>` : ""}
	</button>`).join("")
}

function cardRows(cards) {
	if (!cards.length) {
		return `<p class="empty">还没有任务卡。微信口令「任务:」或对话里派活后会出现在这里。</p>`
	}
	return cards.map((item) => {
		const files = (item.files ?? []).map((file) => `<li>${esc(file)}</li>`).join("") || `<li class="muted">尚无成品</li>`
		return `<article class="slip" data-id="${esc(item.id)}">
			<button type="button" class="slip-toggle" data-act="open" data-id="${esc(item.id)}" aria-expanded="false">
				<strong>${esc(item.id || "未编号")}</strong>
				<span class="stamp">${esc(item.weixin)}</span>
			</button>
			<div class="slip-more">
				<p class="slip-text"><span class="kicker">原文</span>${esc(item.text || "（空）")}</p>
				<p class="slip-title"><span class="kicker">会话</span>${esc(item.title || item.sessionId || "尚未开会话")}</p>
				<p class="kicker">成品</p>
				<ul class="files">${files}</ul>
			</div>
		</article>`
	}).join("")
}

function goalRows(goals) {
	const open = (goals ?? []).filter((row) => !row.done)
	if (!open.length) return `<p class="empty">没有挂起的目标。课题预审、周报这类长活记在这里，做完再勾掉。</p>`
	return open.map((row) => `<article class="goal" data-id="${esc(row.id)}">
		<strong>${esc(row.title)}</strong>
		<button type="button" class="btn-soft" data-act="goal-done" data-id="${esc(row.id)}">做完了</button>
		<button type="button" class="btn-danger" data-act="del" data-id="${esc(row.id)}" data-name="${esc(row.title)}">移除</button>
	</article>`).join("")
}

function optionRows(options) {
	if (!options?.options?.length) {
		return `<p class="empty">想一想时，对话会先出 2～3 个做法。点选一个才允许写盘。</p>`
	}
	return options.options.map((row, i) => `<button type="button" class="option${options.picked === i ? " is-on" : ""}" data-act="pick" data-id="${i}">
		<strong>${esc(row.title)}</strong>
		<em>${esc(row.summary)}</em>
	</button>`).join("")
}

function reviewRows(reviews) {
	if (!reviews?.length) return `<p class="empty">审一档只标确信的问题，不重写全文。</p>`
	return reviews.map((row) => `<article class="review">
		<p class="kicker">${esc(row.path)}</p>
		<ul>${(row.issues ?? []).map((issue) => `<li>${esc(issue)}</li>`).join("") || "<li>没有确信的问题</li>"}</ul>
	</article>`).join("")
}

function docOptions(docs) {
	return (docs ?? []).map((doc) => `<option value="${esc(doc.path)}">${esc(doc.title || doc.name || doc.path)}</option>`).join("")
}

const EXTRA = `
.mode-rail,.expert-rail{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 16px}
.mode-pill{
  appearance:none;display:flex;flex-direction:column;align-items:flex-start;gap:2px;
  min-width:132px;padding:12px 16px;border-radius:18px;cursor:pointer;
  border:1px solid var(--line);background:var(--card);color:var(--ink);
  box-shadow:var(--shadow);transition:transform .16s ease,background .16s ease,border-color .16s ease;
}
.mode-pill:hover{transform:translateY(-1px);border-color:var(--accent)}
.mode-pill:active{transform:scale(.98)}
.mode-pill:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.mode-pill.is-on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.mode-pill strong{font:600 18px/1.2 "Cormorant Garamond","Noto Serif SC",serif}
.mode-pill em{font-style:normal;font-size:12px;opacity:.82}
.desk-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:16px}
.slip,.goal,.option,.review{
  background:linear-gradient(180deg,#fffef9,#f8f1e4);border:1px solid var(--line);
  border-radius:16px;padding:12px 14px;margin:0 0 10px;
}
.slip-toggle{appearance:none;width:100%;display:flex;gap:8px;align-items:center;background:transparent;border:0;padding:0;cursor:pointer;font:inherit;color:inherit;text-align:left}
.slip-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.slip-more{display:none;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
.slip.is-open .slip-more{display:block}
.files{margin:0;padding-left:18px}
.muted,.empty{color:var(--muted)}
.goal{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.goal strong{flex:1}
.option{display:block;width:100%;text-align:left;cursor:pointer}
.option.is-on{border-color:var(--accent);background:var(--accent-soft)}
.paper{
  min-height:220px;max-height:min(42vh,320px);overflow:auto;padding:14px 16px;
  border:1px solid var(--line);border-radius:14px;background:#fffdf8;
  white-space:pre-wrap;font:14px/1.65 "IBM Plex Sans","Noto Sans SC",sans-serif;
}
.paper:focus{outline:2px solid var(--accent);outline-offset:2px}
.search-hits{display:flex;flex-direction:column;gap:8px}
.search-hits button{text-align:left}
@media (max-width:900px){.desk-grid{grid-template-columns:1fr}}
`

export function deskHtml(state = {}) {
	const mode = state.mode || "craft"
	const expert = state.expert || "none"
	return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/>
<title>派活台</title>
<style>${workThemeCss()}${EXTRA}</style>
</head>
<body>
<div class="wrap">
<p class="kicker">Craft desk</p>
<h1>派活台</h1>
<p class="lede">问一问只答，想一想先出做法，做一做才写文件、才发微信。微信口令默认走做一做。</p>
<nav class="nav">
  <a href="/plugins/dsh-dashboard/wall">数据大屏</a>
  <a href="/plugins/dsh-messenger/desk">信使</a>
  <a href="/plugins/dsh-docs/inbox">知识库</a>
</nav>

<div class="card">
  <p class="kicker">工作档</p>
  <div class="mode-rail">${chips(MODE_BTN, mode, "mode")}</div>
  <p class="kicker">专家</p>
  <div class="expert-rail">${chips(EXPERT_BTN, expert, "expert")}</div>
</div>

<div class="desk-grid">
  <div class="card">
    <h2>任务卡</h2>
    <div class="paper-scroll" tabindex="0" aria-label="任务卡">${cardRows(state.cards ?? [])}</div>
  </div>
  <div class="card">
    <h2>目标挂起</h2>
    <form class="row" id="goal-form">
      <input id="goal-title" placeholder="课题预审 / 周报" autocomplete="off"/>
      <button type="submit" class="btn-primary">挂上</button>
    </form>
    <div class="paper-scroll" tabindex="0" aria-label="目标">${goalRows(state.goals ?? state.openGoals ?? [])}</div>
  </div>
</div>

<div class="card">
  <h2>先出做法</h2>
  <p class="hint">${state.options?.brief ? `针对：${esc(state.options.brief)}` : "想一想时会出现 2～3 个做法。"}</p>
  <div class="options">${optionRows(state.options)}</div>
</div>

<div class="card">
  <h2>知识库检索</h2>
  <form class="row" id="search-form">
    <input id="q" placeholder="上周那份课题预审" autocomplete="off"/>
    <button type="submit" class="btn-primary">检索</button>
  </form>
  <div class="search-hits" id="hits">${(state.hits ?? []).map((hit) => `<button type="button" class="task" data-act="open-doc" data-path="${esc(hit.path)}"><strong>${esc(hit.title)}</strong><em>${esc(hit.snippet)}</em></button>`).join("")}</div>
</div>

<div class="card">
  <h2>选区改稿</h2>
  <p class="hint">圈一段，写下怎么改，不要整篇重做。</p>
  <div class="row">
    <select id="doc">${docOptions(state.docs)}</select>
    <button type="button" class="btn-soft" data-act="load-doc">打开文稿</button>
  </div>
  <div id="paper" class="paper" tabindex="0" role="textbox" aria-label="文稿正文">${esc(state.docs?.[0]?.body || "先打开一篇文稿，再圈选要改的句子。")}</div>
  <form class="row" id="patch-form">
    <input id="instruction" placeholder="这段改成调研口径" autocomplete="off"/>
    <button type="submit" class="btn-primary">改这段</button>
  </form>
</div>

<div class="card">
  <h2>成品审稿</h2>
  <form class="compose" id="review-form">
    <label>确信的问题
      <textarea id="review-notes" placeholder="每行一条。不要写「也许」「猜测」。"></textarea>
    </label>
    <button type="submit" class="btn-soft">记入审稿</button>
  </form>
  <div class="paper-scroll">${reviewRows(state.reviews)}</div>
</div>
</div>
<div id="toast" class="toast" role="status"></div>
<script>
const toast = document.getElementById("toast")
let toastTimer, armed
function say(text, ok=true){
  toast.textContent = text
  toast.className = "toast show" + (ok ? "" : " bad")
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600)
}
async function api(path, body){
  const res = await fetch(path, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(body||{}) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new Error(json.error || json.message || "请求失败")
  return json
}
function reload(){ location.reload() }
document.querySelectorAll("[data-act=mode]").forEach((btn) => btn.addEventListener("click", async () => {
  try { await api("/plugins/dsh-craft/api/mode", { mode: btn.dataset.id }); say("已切到 " + btn.textContent.trim()); reload() }
  catch (e) { say(e.message, false) }
}))
document.querySelectorAll("[data-act=expert]").forEach((btn) => btn.addEventListener("click", async () => {
  try { await api("/plugins/dsh-craft/api/expert", { expert: btn.dataset.id }); say("专家已钉上"); reload() }
  catch (e) { say(e.message, false) }
}))
document.querySelectorAll("[data-act=open]").forEach((btn) => btn.addEventListener("click", () => {
  const slip = btn.closest(".slip")
  const open = !slip.classList.contains("is-open")
  document.querySelectorAll(".slip").forEach((el) => el.classList.remove("is-open"))
  if (open) slip.classList.add("is-open")
  btn.setAttribute("aria-expanded", open ? "true" : "false")
}))
document.getElementById("goal-form").addEventListener("submit", async (e) => {
  e.preventDefault()
  try { await api("/plugins/dsh-craft/api/goal", { title: document.getElementById("goal-title").value }); say("目标已挂上"); reload() }
  catch (err) { say(err.message, false) }
})
document.querySelectorAll("[data-act=goal-done]").forEach((btn) => btn.addEventListener("click", async () => {
  try { await api("/plugins/dsh-craft/api/goal-done", { id: btn.dataset.id }); say("这条做完了"); reload() }
  catch (e) { say(e.message, false) }
}))
document.querySelectorAll("[data-act=del]").forEach((btn) => btn.addEventListener("click", async () => {
  if (armed && armed.btn === btn) {
    clearTimeout(armed.timer)
    armed = null
    try { await api("/plugins/dsh-craft/api/goal-done", { id: btn.dataset.id }); say("已拿下"); reload() }
    catch (e) { say(e.message, false) }
    return
  }
  if (armed) { armed.btn.textContent = "移除"; armed.btn.classList.remove("is-armed") }
  btn.textContent = "确认删除"
  btn.classList.add("is-armed")
  armed = { btn, timer: setTimeout(() => { btn.textContent = "移除"; btn.classList.remove("is-armed"); armed = null }, 3000) }
}))
document.querySelectorAll("[data-act=pick]").forEach((btn) => btn.addEventListener("click", async () => {
  try { await api("/plugins/dsh-craft/api/pick", { index: Number(btn.dataset.id) }); say("已选定做法，可以写了"); reload() }
  catch (e) { say(e.message, false) }
}))
document.getElementById("search-form").addEventListener("submit", async (e) => {
  e.preventDefault()
  try {
    const json = await api("/plugins/dsh-craft/api/search", { query: document.getElementById("q").value })
    const box = document.getElementById("hits")
    box.innerHTML = (json.hits||[]).map((hit) => '<button type="button" class="task" data-act="open-doc" data-path="'+hit.path+'"><strong>'+hit.title+'</strong><em>'+hit.snippet+'</em></button>').join("") || '<p class="empty">没有命中</p>'
    say("找到 " + (json.hits||[]).length + " 条")
  } catch (err) { say(err.message, false) }
})
const paper = document.getElementById("paper")
document.querySelector("[data-act=load-doc]").addEventListener("click", async () => {
  try {
    const json = await api("/plugins/dsh-craft/api/doc", { path: document.getElementById("doc").value })
    paper.textContent = json.body || ""
    paper.dataset.path = json.path
    say("文稿已打开")
  } catch (e) { say(e.message, false) }
})
document.getElementById("patch-form").addEventListener("submit", async (e) => {
  e.preventDefault()
  const sel = window.getSelection()
  const raw = paper.textContent || ""
  let start = 0, end = 0
  if (sel && paper.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0)
    const pre = range.cloneRange()
    pre.selectNodeContents(paper)
    pre.setEnd(range.startContainer, range.startOffset)
    start = pre.toString().length
    end = start + range.toString().length
  }
  if (end <= start) { say("先圈一段再改", false); return }
  try {
    await api("/plugins/dsh-craft/api/patch", {
      path: paper.dataset.path || document.getElementById("doc").value,
      text: raw, start, end,
      instruction: document.getElementById("instruction").value,
    })
    say("选区已交给做一做。对话里说「按选区改」。")
  } catch (err) { say(err.message, false) }
})
document.getElementById("review-form").addEventListener("submit", async (e) => {
  e.preventDefault()
  try {
    await api("/plugins/dsh-craft/api/review", {
      path: paper.dataset.path || document.getElementById("doc").value,
      notes: document.getElementById("review-notes").value,
    })
    say("审稿已记下，没有重写全文")
    reload()
  } catch (err) { say(err.message, false) }
})
</script>
</body></html>`
}
