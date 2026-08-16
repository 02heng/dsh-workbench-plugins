import { workThemeCss } from "./theme.css.js"
import { chartSpecs } from "./charts.js"

function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

function kpiHtml(items) {
	return (items ?? []).map((item) => `<button type="button" class="kpi" data-act="kpi" data-id="${esc(item.id)}" aria-label="${esc(item.label)} ${esc(item.value)}">
		<b>${esc(item.value)}</b>
		<span>${esc(item.label)}</span>
		<small>${esc(item.hint)}</small>
	</button>`).join("")
}

function taskHtml(items) {
	if (!items?.length) return `<p class="empty">循环任务都已记过。接线后未跑的巡检会回到这里。</p>`
	return items.map((item) => `<button type="button" class="task tone-${esc(item.tone)}" data-act="task" data-id="${esc(item.id)}" data-title="${esc(item.title)}" data-gap="${esc(item.gap)}">
		<span><strong>${esc(item.title)}</strong><em>${esc(item.every)} ${esc(item.at ?? "")} · ${esc(item.deviceId || "本机")}</em></span>
		<span class="stamp">${esc(item.gap)}</span>
	</button>`).join("")
}

function factHtml(school) {
	const rows = [
		["校名", school.name],
		["校区", school.campus],
		["学期", school.term],
		...(school.stats ?? []).map((item) => [item.label, `${item.value}${item.unit ? " " + item.unit : ""}`]),
	]
	return rows.map(([label, value]) => `<div class="fact"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join("")
}

function deviceHtml(items) {
	return (items ?? []).map((item) => `<div class="fact">
		<span>${esc(item.name)} <code>${esc(item.type)}</code></span>
		<b>${item.wired ? "已接线" : "未联通"}</b>
	</div>`).join("") || `<p class="empty">还没有设备台账。</p>`
}

function kbHtml(kb) {
	const chips = Object.entries(kb.byCollection ?? {}).map(([name, count]) =>
		`<span class="chip">${esc(name)} ${esc(count)}</span>`).join("")
	const recent = (kb.recent ?? []).map((item) => `<li>${esc(item.title)}</li>`).join("") || "<li>知识库还是空的</li>"
	return `<div class="chips">${chips}</div><ul class="timeline paper-scroll" tabindex="0" aria-label="知识库近况">${recent}</ul>`
}

function chartsHtml() {
	return `<div class="chart-grid">${chartSpecs().map((spec) => `<div class="card chart-card${spec.full ? " full" : spec.wide ? " wide" : ""}">
		<h2>${esc(spec.title)} <span class="mock-flag">${esc(spec.kind)} · 示意</span></h2>
		<div class="chart-box" data-chart="${esc(spec.id)}" role="img" aria-label="${esc(spec.title)}"></div>
	</div>`).join("")}</div>`
}

function docsHtml(items) {
	if (!items?.length) return `<p class="empty">收件文稿都已入库，或还没有上传。</p>`
	return `<ul class="timeline paper-scroll" tabindex="0" aria-label="待入库文稿">${items.map((item) => `<li>${esc(item.name)} · 未入库</li>`).join("")}</ul>`
}

export function wallHtml(state) {
	const school = state.school ?? {}
	return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/>
<title>数据大屏</title>
<style>${workThemeCss()}</style></head>
<body class="wall">
<div class="wall-wrap">
<div class="wall-mast">
  <div>
    <p class="kicker">School wall</p>
    <h1 id="school-name">${esc(school.name)}</h1>
    <p class="lede" id="school-lede">${esc(school.campus)} · ${esc(school.term)}。台账数字来自本机；图表为示意数据，便于看版面，不是教务实数。</p>
    <nav class="nav">
      <a href="/plugins/dsh-docs/inbox">知识库</a>
      <a href="/plugins/dsh-datacenter/board">循环任务</a>
    </nav>
  </div>
  <div>
    <div class="wall-clock" id="clock" aria-live="polite">--:--:--</div>
    <div class="wall-tools">
      <button type="button" class="btn-soft" id="btn-win">新窗打开</button>
      <button type="button" class="btn-primary" id="btn-full" aria-pressed="false">铺开大屏</button>
    </div>
  </div>
</div>

<div id="kpis" class="kpi-row">${kpiHtml(state.kpis)}</div>
${chartsHtml()}

<div class="wall-grid">
  <div class="card">
    <h2>未完成任务</h2>
    <div id="tasks" class="task-list paper-scroll" tabindex="0" aria-label="未完成任务">${taskHtml(state.openTasks)}</div>
  </div>
  <div>
    <div class="card">
      <h2>学校台账</h2>
      <div id="facts">${factHtml(school)}</div>
      <p class="hint">${esc(school.note)}</p>
    </div>
    <div class="card">
      <h2>机房设备</h2>
      <div id="devices">${deviceHtml(state.devices)}</div>
      <p class="warn" id="duty">${esc(state.duty?.message ?? "")}</p>
    </div>
  </div>
</div>

<div class="wall-grid" style="margin-top:14px">
  <div class="card">
    <h2>知识库脉搏</h2>
    <div id="kb">${kbHtml(state.kb ?? {})}</div>
  </div>
  <div class="card">
    <h2>待入库文稿</h2>
    <div id="docs">${docsHtml(state.pendingDocs)}</div>
  </div>
</div>
</div>
<div id="toast" class="toast" role="status"></div>
<script>
const toast = document.getElementById('toast')
let toastTimer
function say(text, ok=true){
  toast.textContent = text
  toast.className = 'toast show' + (ok ? '' : ' bad')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600)
}
function tick(){
  if (document.visibilityState === 'hidden') return
  const now = new Date()
  const pad = (n) => String(n).padStart(2,'0')
  document.getElementById('clock').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
}
tick()
setInterval(tick, 1000)

const fullBtn = document.getElementById('btn-full')
function syncFull(){
  const on = Boolean(document.fullscreenElement)
  document.body.classList.toggle('is-wall', on)
  fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
  fullBtn.textContent = on ? '收回大屏' : '铺开大屏'
}
fullBtn.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    say('当前窗口不允许全屏，已用新窗打开', false)
    window.open('/plugins/dsh-dashboard/wall', '_blank', 'noopener')
  }
})
document.getElementById('btn-win').addEventListener('click', () => {
  window.open('/plugins/dsh-dashboard/wall', '_blank', 'noopener')
  say('已在新窗铺开')
})
document.addEventListener('fullscreenchange', syncFull)
document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (e.target.closest('input,textarea,select')) return
    e.preventDefault()
    fullBtn.click()
  }
})

document.body.addEventListener('click', (e) => {
  const kpi = e.target.closest('[data-act=kpi]')
  if (kpi) {
    say(kpi.getAttribute('aria-label'))
    return
  }
  const task = e.target.closest('[data-act=task]')
  if (task) say(task.dataset.title + ' · ' + task.dataset.gap)
})

async function refresh(){
  if (document.visibilityState === 'hidden') return
  try {
    const res = await fetch('/plugins/dsh-dashboard/api/state', { cache: 'no-store' })
    if (!res.ok) return
    const state = await res.json()
    document.getElementById('school-name').textContent = state.school?.name || '待填学校'
    document.getElementById('kpis').innerHTML = (state.kpis || []).map((item) =>
      '<button type="button" class="kpi" data-act="kpi" data-id="'+item.id+'" aria-label="'+item.label+' '+item.value+'"><b>'+item.value+'</b><span>'+item.label+'</span><small>'+item.hint+'</small></button>'
    ).join('')
    const open = state.openTasks || []
    document.getElementById('tasks').innerHTML = open.length
      ? open.map((item) => '<button type="button" class="task tone-'+item.tone+'" data-act="task" data-id="'+item.id+'" data-title="'+item.title+'" data-gap="'+item.gap+'"><span><strong>'+item.title+'</strong><em>'+item.every+' '+(item.at||'')+' · '+(item.deviceId||'本机')+'</em></span><span class="stamp">'+item.gap+'</span></button>').join('')
      : '<p class="empty">循环任务都已记过。接线后未跑的巡检会回到这里。</p>'
    document.getElementById('duty').textContent = state.duty?.message || ''
  } catch {}
}
setInterval(refresh, 20000)
document.addEventListener('visibilitychange', function(){
  if (document.visibilityState === 'visible') { tick(); refresh() }
})
</script>
<script src="/plugins/dsh-dashboard/echarts.min.js"></script>
<script type="module">
import { mountCharts } from "/plugins/dsh-dashboard/charts.js"
if (window.echarts) mountCharts(window.echarts)
</script>
</body></html>`
}
