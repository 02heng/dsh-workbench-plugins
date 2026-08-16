import { workThemeCss } from "./theme.css.js"

function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

export function boardHtml(state) {
	const tags = state.tags ?? []
	const tasks = state.tasks ?? []
	const devices = state.devices ?? []
	const checkins = state.checkins ?? []
	const groups = ["switch", "firewall", "server", "duty", "other"]
	const tagChips = groups.map((group) => {
		const items = tags.filter((item) => item.group === group)
		if (items.length === 0) return ""
		return `<h3>${esc(group)}</h3><div class="chips">${items.map((item) =>
			`<span class="chip" title="${esc(item.note)}">${esc(item.label)} <code>${esc(item.id)}</code></span>`).join("")}</div>`
	}).join("")
	const deviceRows = devices.map((item) => `<tr>
		<td>${esc(item.id)}</td><td>${esc(item.name)}</td><td>${esc(item.type)}</td>
		<td>${item.wired ? "已接线" : "未联通"}</td>
		<td>${(item.tags ?? []).map((tag) => `<code>${esc(tag)}</code>`).join(" ")}</td>
	</tr>`).join("")
	const taskRows = tasks.map((item) => `<tr>
		<td>${esc(item.title)}</td>
		<td>${esc(item.kind)}</td>
		<td>${item.enabled ? "开" : "关"}</td>
		<td>${esc(item.every)} ${esc(item.at ?? "")}</td>
		<td>${esc(item.deviceId || "—")}</td>
		<td>${esc(item.lastResult?.status ?? "未跑")}</td>
		<td class="actions">
			<button type="button" class="btn-soft" data-act="toggle" data-id="${esc(item.id)}" data-on="${item.enabled ? "0" : "1"}">${item.enabled ? "停用" : "启用"}</button>
			<button type="button" class="btn-danger" data-act="del" data-id="${esc(item.id)}" data-name="${esc(item.title)}">移除</button>
		</td>
	</tr>`).join("")
	const checkinRows = checkins.map((item) => `<li>${esc(item.at)} · ${esc(item.title)}</li>`).join("") || "<li>还没有打卡记录</li>"

	return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/>
<title>循环任务</title>
<style>${workThemeCss()}</style></head>
<body>
<div class="wrap">
<p class="kicker">Work ledger</p>
<h1>循环任务</h1>
<p class="lede">机房值班台账。数据在 <code>D:\\dsh-datacenter</code>。设备未联通时，巡检只记「未接线」，不会假装监控交换机或防火墙。</p>
<nav class="nav"><a href="/plugins/dsh-dashboard/wall">数据大屏</a><a href="/plugins/dsh-docs/inbox">知识库</a></nav>
<p class="warn">${esc(state.duty?.message ?? "")}</p>

<div class="card">
<h2>监控指标标签</h2>
${tagChips}
<div class="row">
<input id="tag-id" placeholder="新标签 id，如 fw-ids"/>
<input id="tag-label" placeholder="显示名"/>
<select id="tag-group"><option>firewall</option><option>switch</option><option>server</option><option>duty</option></select>
<button id="tag-add">添加标签</button>
</div>
</div>

<div class="card">
<h2>设备与已挂标签</h2>
<div class="paper-scroll" tabindex="0" aria-label="设备台账">
<table><thead><tr><th>id</th><th>名称</th><th>类型</th><th>接线</th><th>标签</th></tr></thead>
<tbody>${deviceRows}</tbody></table>
</div>
<div class="row">
<select id="dev-id">${devices.map((item) => `<option value="${esc(item.id)}">${esc(item.id)}</option>`).join("")}</select>
<input id="dev-tags" placeholder="标签，逗号分隔，如 fw-up,fw-policy" style="min-width:280px"/>
<button id="dev-save">保存设备标签</button>
</div>
</div>

<div class="card">
<h2>循环任务</h2>
<div class="paper-scroll" tabindex="0" aria-label="循环任务">
<table><thead><tr><th>任务</th><th>类型</th><th>状态</th><th>周期</th><th>设备</th><th>上次</th><th></th></tr></thead>
<tbody>${taskRows}</tbody></table>
</div>
<div class="row">
<input id="t-title" placeholder="任务名，如 每天自动打卡"/>
<select id="t-kind"><option value="checkin">打卡</option><option value="monitor">巡检</option><option value="custom">自定义</option></select>
<select id="t-every"><option value="daily">每天</option><option value="weekdays">工作日</option><option value="hourly">每小时</option></select>
<input id="t-at" value="08:30" style="width:80px"/>
<input id="t-device" placeholder="设备 id，巡检用"/>
<input id="t-tags" placeholder="指标标签，逗号分隔"/>
<button type="button" id="t-add">添加任务</button>
<button type="button" class="btn-quiet" id="t-checkin">现在打卡</button>
</div>
</div>
<div id="toast" class="toast" role="status"></div>

<div class="card">
<h2>打卡记录</h2>
<ul class="timeline paper-scroll" tabindex="0" aria-label="打卡记录">${checkinRows}</ul>
</div>
</div>
<script>
const toast = document.getElementById('toast')
let toastTimer
function say(text, ok=true){
  toast.textContent = text
  toast.className = 'toast show' + (ok ? '' : ' bad')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600)
}
const api = (path, body) => fetch(path, {
  method: body ? 'POST' : 'GET',
  headers: body ? { 'content-type': 'application/json' } : {},
  body: body ? JSON.stringify(body) : undefined,
}).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); location.reload() }).catch(err => say(err.message, false))
document.getElementById('tag-add').onclick = () => api('/plugins/dsh-datacenter/api/tag', {
  id: document.getElementById('tag-id').value, label: document.getElementById('tag-label').value,
  group: document.getElementById('tag-group').value,
})
document.getElementById('dev-save').onclick = () => api('/plugins/dsh-datacenter/api/device-tags', {
  id: document.getElementById('dev-id').value,
  tags: document.getElementById('dev-tags').value.split(',').map(s => s.trim()).filter(Boolean),
})
document.getElementById('t-add').onclick = () => api('/plugins/dsh-datacenter/api/task', {
  title: document.getElementById('t-title').value,
  kind: document.getElementById('t-kind').value,
  every: document.getElementById('t-every').value,
  at: document.getElementById('t-at').value,
  deviceId: document.getElementById('t-device').value,
  tags: document.getElementById('t-tags').value.split(',').map(s => s.trim()).filter(Boolean),
  enabled: true,
})
document.getElementById('t-checkin').onclick = () => api('/plugins/dsh-datacenter/api/checkin', { note: 'manual' })
document.querySelectorAll('button[data-act]').forEach(btn => {
  btn.onclick = () => {
    if (btn.dataset.act === 'del') {
      if (btn.dataset.armed !== '1') {
        document.querySelectorAll('button[data-act="del"].is-armed').forEach(other => {
          other.dataset.armed = '0'; other.classList.remove('is-armed'); other.textContent = '移除'
        })
        btn.dataset.armed = '1'
        btn.classList.add('is-armed')
        btn.textContent = '确认删除'
        say('再点一次确认移除「' + (btn.dataset.name || '') + '」')
        setTimeout(() => {
          if (btn.dataset.armed === '1') { btn.dataset.armed = '0'; btn.classList.remove('is-armed'); btn.textContent = '移除' }
        }, 3200)
        return
      }
      return api('/plugins/dsh-datacenter/api/task/delete', { id: btn.dataset.id })
    }
    if (btn.dataset.act === 'toggle') return api('/plugins/dsh-datacenter/api/task', { id: btn.dataset.id, enabled: btn.dataset.on === '1' })
  }
})
</script>
</body></html>`
}
