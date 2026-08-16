import { workThemeCss } from "./theme.css.js"
import { formatBeijingTime } from "./store.js"

function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

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

function statusLabel(status) {
	return STATUS_LABEL[status] ?? (status || "仅记录")
}

export function itemsFingerprint(items) {
	return JSON.stringify((items || []).map((item) => [
		item.id, item.status, item.title, item.text, item.at, item.action,
	]))
}

function itemRows(items) {
	if (!items.length) {
		return `<p class="empty">专线还安静。黄山会话里开口令「任务:」就会派活，本机绿气泡也算；闲聊只入库。</p>`
	}
	return items.map((item) => slipHtml(item, false)).join("")
}

function slipHtml(item, open) {
	const at = formatBeijingTime(item.at)
	const stamped = item.action === "dispatch" ? "带口令" : item.action === "empty-password" ? "口令空" : "闲聊"
	const id = esc(item.id ?? "")
	const title = item.title || "尚未开会话"
	const showShot = item.status === "replied" || item.status === "shot-failed" || item.status === "replying"
	const shot = showShot
		? `<img class="shot-thumb" src="/plugins/dsh-messenger/shot?id=${id}" alt="回图 ${esc(item.id ?? "")}" loading="lazy"/>`
		: `<p class="hint shot-miss">尚无回图</p>`
	return `<article class="slip${open ? " is-open" : ""}" data-id="${id}">
			<button type="button" class="slip-toggle" data-act="open" data-id="${id}" aria-expanded="${open ? "true" : "false"}">
				<strong>${esc(item.id || "未编号")}</strong>
				<em>${esc(at)}</em>
				<span class="stamp">${esc(stamped)}</span>
				<span class="stamp">${esc(statusLabel(item.status))}</span>
			</button>
			<div class="slip-more">
				<p class="slip-text"><span class="kicker">原文</span>${esc(item.text || item.prompt || "（空）")}</p>
				<p class="slip-title"><span class="kicker">会话标题</span>${esc(title)}</p>
				<p class="kicker">成品</p>
				<ul class="files">${(item.files ?? []).map((file) => `<li>${esc(file)}</li>`).join("") || "<li class=\"hint\">尚无成品</li>"}</ul>
				<div class="shot-box">${shot}</div>
				<div class="actions">
					<button type="button" class="btn-soft" data-act="retry" data-id="${id}">再派一次</button>
					<button type="button" class="btn-quiet" data-act="reshot" data-id="${id}">再截再发</button>
					<button type="button" class="btn-danger" data-act="del" data-id="${id}" data-name="${esc(item.id || item.text || "这条")}">移除</button>
				</div>
			</div>
		</article>`
}

function mailRows(mail) {
	if (!mail.length) {
		return `<p class="empty">信匣空着。接通 QQ 邮箱后，发件人、主题、时间会落在这本台账上。</p>`
	}
	return mail.map((item) => `<button type="button" class="task" data-act="read" data-id="${esc(item.id ?? "")}">
		<strong>${esc(item.subject || "（无主题）")}</strong>
		<em>${esc(item.from || "")} · ${esc(formatBeijingTime(item.at, { seconds: false }))}</em>
	</button>`).join("")
}

function mailChipText(state) {
	if (state.mailConfigured === false || state.mailError === "未配置 QQ 邮箱") {
		return "未配置 QQ 邮箱"
	}
	if (state.mailLoggedIn && state.mailbox) return state.mailbox
	return "接通信匣"
}

function mailGateHtml(state) {
	const err = state.mailError && state.mailError !== "未配置 QQ 邮箱"
		? `<p class="hint mail-gate-err" id="qq-err">${esc(state.mailError)}</p>`
		: `<p class="hint mail-gate-err is-hidden" id="qq-err"></p>`
	return `<p class="kicker">QQ 邮箱</p>
		<h3>接通信匣</h3>
		<p class="hint" style="margin:0">QQ 邮箱设置里开启 IMAP/SMTP，用授权码接通。授权码不是登录密码，保存后不回显。</p>
		${err}
		<form class="compose mail-auth" id="qq-form" autocomplete="off">
			<label>邮箱 <input id="qq-user" name="user" type="email" placeholder="你的QQ号@qq.com" autocomplete="username"/></label>
			<label>授权码 <input id="qq-auth" name="auth" type="password" placeholder="邮箱设置里生成的授权码" autocomplete="current-password"/></label>
			<button type="submit" class="btn-primary">接通信匣</button>
		</form>`
}

const DESK_CSS = `
.desk-mast{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:end;margin:0 0 18px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.desk-meta{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.desk-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:16px;position:relative}
.desk-grid::before{content:"";position:absolute;left:50%;top:8px;bottom:8px;width:1px;background:repeating-linear-gradient(180deg,var(--line) 0 6px,transparent 6px 12px);transform:translateX(-50%);opacity:.7;pointer-events:none}
.lane{min-height:520px;display:flex;flex-direction:column}
.lane-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.lane-head h2{margin:0}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.ledger.ledger-scroll{
  flex:1;min-height:0;max-height:min(52vh,428px);height:min(52vh,428px);
  overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:10px;
  padding:2px 8px 8px 2px;scrollbar-gutter:stable;
}
.ledger.ledger-scroll::-webkit-scrollbar{width:9px}
.ledger.ledger-scroll::-webkit-scrollbar-thumb{background:#c4b8a4;border-radius:999px;border:2px solid #f4efe6}
.ledger.ledger-scroll::-webkit-scrollbar-track{background:transparent}
.ledger.ledger-scroll{scrollbar-width:thin;scrollbar-color:#c4b8a4 transparent}
.slip{background:linear-gradient(180deg,#fffef9,#f8f1e4);border:1px solid var(--line);border-radius:16px;padding:14px 16px 12px;box-shadow:var(--shadow);animation:none;transition:border-color .16s ease, transform .16s ease}
.slip:hover,.slip:focus-within{border-color:var(--accent)}
.slip-toggle{
  appearance:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
  width:100%;text-align:left;cursor:pointer;
  background:transparent;color:var(--ink);border:0;border-radius:10px;padding:2px 2px 6px;
  box-shadow:none;letter-spacing:0;font:inherit;
}
.slip-toggle:hover,.slip-toggle:active{background:transparent;transform:none;box-shadow:none;color:var(--ink)}
.slip-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.slip-toggle strong{font:600 18px/1.2 "Cormorant Garamond","Noto Serif SC",serif}
.slip-toggle em{font-style:normal;color:var(--muted);font-size:12px}
.slip-more{display:none;margin-top:4px;padding-top:10px;border-top:1px dashed var(--line)}
.slip.is-open .slip-more{display:block}
.slip-text,.slip-title{margin:0 0 10px;color:var(--ink)}
.slip-text .kicker,.slip-title .kicker{display:block;margin:0 0 4px}
.shot-box{margin:0 0 12px}
.shot-thumb{display:block;max-width:100%;max-height:168px;border-radius:12px;border:1px solid var(--line);background:#fff;box-shadow:var(--shadow)}
.shot-miss{margin:0}
.compose{display:flex;flex-direction:column;gap:10px}
.compose label{display:flex;flex-direction:column;gap:6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.compose input,.compose textarea{width:100%}
.compose textarea{min-height:140px;resize:vertical}
.compose textarea#notes{min-height:72px}
.mail-list.paper-scroll{display:flex;flex-direction:column;gap:8px;margin:0 0 16px;max-height:min(42vh,320px);overflow-y:auto;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#c4b8a4 transparent}
.mail-list.paper-scroll::-webkit-scrollbar{width:9px}
.mail-list.paper-scroll::-webkit-scrollbar-thumb{background:#c4b8a4;border-radius:999px;border:2px solid #f4efe6}
.mail-gate{
  flex:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;
  gap:14px;min-height:280px;margin:0 0 12px;
  background:linear-gradient(180deg,#fffef9,#f8f1e4);
  border:1.5px dashed #c4b8a4;border-radius:18px;padding:28px 24px;
}
.mail-gate h3{margin:0;text-transform:none;letter-spacing:0;font:600 26px/1.2 "Cormorant Garamond","Noto Serif SC",serif;color:var(--ink)}
.mail-gate .user-code{
  margin:0;font:600 44px/1 "Cormorant Garamond","Noto Serif SC",serif;
  letter-spacing:.18em;color:var(--accent);
}
.mail-gate .btn-primary{text-decoration:none;display:inline-flex;align-items:center}
.mail-gate .compose{width:100%;max-width:380px}
.mail-gate .compose input:hover{border-color:var(--accent)}
.mail-gate .compose input:focus{border-color:var(--accent);outline:2px solid var(--accent);outline-offset:2px}
.mail-gate .mail-gate-err{color:var(--danger);margin:0}
.mail-work{display:flex;flex-direction:column;gap:12px;flex:1}
.letter{
  background:linear-gradient(180deg,#fffef9,#f8f1e4);
  border:1px solid var(--line);border-radius:16px;padding:16px 18px 12px;
  box-shadow:var(--shadow);animation:rise .35s ease both;
}
.letter h3{margin:0 0 6px;text-transform:none;letter-spacing:0;font:600 20px/1.3 "Cormorant Garamond","Noto Serif SC",serif;color:var(--ink)}
.letter .letter-meta{color:var(--muted);font-size:12px;margin:0 0 10px}
.letter .letter-body{white-space:pre-wrap;margin:0 0 12px;color:var(--ink)}
.task.is-open{border-color:var(--accent);background:var(--accent-soft)}
.is-hidden{display:none !important}
@media (max-width:980px){
  .desk-mast,.desk-grid{grid-template-columns:1fr}
  .desk-grid::before{display:none}
  .desk-meta{justify-content:flex-start}
}
`

export function deskHtml(state) {
	const listen = Boolean(state.listen)
	const contact = state.contact || "黄山"
	const password = state.password || "任务:"
	const items = Array.isArray(state.items) ? state.items : []
	const mail = Array.isArray(state.mail) ? state.mail : []
	const keysStatus = state.keysStatus || "missing"
	const listenChip = keysStatus === "collecting"
		? "采集中"
		: (keysStatus === "missing" || keysStatus === "invalid")
			? "未采密钥"
			: (listen ? "在听" : "未在听")
	const showCollect = keysStatus === "missing" || keysStatus === "invalid" || keysStatus === "collecting"
	const showClear = keysStatus === "ready"
	const mailChip = mailChipText(state)
	const loggedIn = Boolean(state.mailLoggedIn)
	const loginLabel = loggedIn ? "刷新信匣" : "接通信匣"

	return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/>
<title>信使</title>
<style>${workThemeCss()}${DESK_CSS}</style></head>
<body>
<div class="wrap">
<header class="desk-mast">
	<div>
		<p class="kicker">Paper courier</p>
		<h1>信使</h1>
		<p class="lede">黄山专线只入库本机消息；邮箱台走 QQ 邮箱 IMAP/SMTP，授权码不印在页上。</p>
		<p class="warn">个人微信自动化有风控，PC 微信须登录。</p>
	</div>
	<div class="desk-meta">
		<span class="chip" id="listen-chip">${esc(listenChip)}</span>
		<span class="chip" id="mail-chip">${esc(mailChip)}</span>
		<button type="button" class="btn-quiet" id="mail-login">${esc(loginLabel)}</button>
		<button type="button" class="btn-quiet" id="acct">更换账号</button>
	</div>
</header>
<nav class="nav"><a href="/plugins/dsh-dashboard/wall">数据大屏</a><a href="/plugins/dsh-docs/inbox">知识库</a><a href="/plugins/dsh-datacenter/board">循环任务</a></nav>

<div class="desk-grid">
<section class="card lane" aria-labelledby="wx-title">
	<div class="lane-head">
		<div>
			<h2 id="wx-title">黄山专线</h2>
			<p class="hint" style="margin:6px 0 0">收消息读本机库，回图会抢几秒微信前台。</p>
		</div>
		<div class="actions">
			<button type="button" class="btn-soft" id="listen-toggle" aria-pressed="${listen ? "true" : "false"}">${listen ? "暂停监听" : "开始监听"}</button>
			<button type="button" class="btn-primary${showCollect ? "" : " is-hidden"}" id="keys-collect"${keysStatus === "collecting" ? " disabled" : ""}>采集密钥</button>
			<button type="button" class="btn-danger${showClear ? "" : " is-hidden"}" id="keys-clear" data-act="clear-keys">清除密钥</button>
		</div>
	</div>
	<div class="facts">
		<span class="chip">联系人 ${esc(contact)}</span>
		<span class="chip">口令 <code>${esc(password)}</code></span>
		<span class="chip" id="item-count">${items.length} 条</span>
	</div>
	<div id="drop" class="drop" role="button" tabindex="0" aria-label="选取回图底稿">
		<input id="file" type="file" accept="image/*"/>
		<div class="drop-mark">+</div>
		<p class="drop-title">回图底稿放这里</p>
		<p class="drop-sub">拖入或点选取。本页骨架不上传，也不弹出系统文件框当主按钮。</p>
		<span class="btn btn-primary" id="pick">选取底稿</span>
		<div class="drop-names" id="picked">尚未选取</div>
	</div>
	<div class="ledger ledger-scroll" id="items" tabindex="0" aria-label="本日台账">${itemRows(items)}</div>
</section>

<section class="card lane" aria-labelledby="mail-title">
	<div class="lane-head">
		<div>
			<h2 id="mail-title">邮箱台</h2>
			<p class="hint" style="margin:6px 0 0">读信、起草、发出。授权码不印在页上。</p>
		</div>
	</div>
	<div id="mail-gate" class="mail-gate${loggedIn ? " is-hidden" : ""}">${mailGateHtml(state)}</div>
	<div id="mail-work" class="mail-work${loggedIn ? "" : " is-hidden"}">
		<div class="mail-list paper-scroll" id="mail" tabindex="0" aria-label="信匣">${mailRows(mail)}</div>
		<article class="letter is-hidden" id="mail-read" hidden>
			<h3 id="read-subject">（无主题）</h3>
			<p class="letter-meta" id="read-meta"></p>
			<div class="letter-body" id="read-body"></div>
			<div class="actions">
				<button type="button" class="btn-soft" id="fill-from">填入收件人</button>
			</div>
		</article>
		<form class="compose" id="compose" autocomplete="off">
			<label>收件人 <input id="to" name="to" type="email" placeholder="name@example.com"/></label>
			<label>主题 <input id="subject" name="subject" type="text" placeholder="一句话事由"/></label>
			<label>要点 <textarea id="notes" name="notes" placeholder="给模型的短补全要点。起草失败则正文不动。"></textarea></label>
			<label>正文 <textarea id="body" name="body" placeholder="写完再发。发出失败正文仍在。"></textarea></label>
			<div class="row">
				<button type="button" class="btn-soft" id="draft">请模型起草</button>
				<button type="submit" class="btn-primary">发出</button>
			</div>
		</form>
	</div>
</section>
</div>
</div>
<div id="toast" class="toast" role="status"></div>
<script>
const toast = document.getElementById('toast')
const file = document.getElementById('file')
const drop = document.getElementById('drop')
const picked = document.getElementById('picked')
let toastTimer
let openMailId = ''
let openItemId = ''
let armedId = ''
let armedDeadline = 0
let armedTimer
let lastFrom = ''
let lastMailError = ''
let lastItemsFp = ''
let lastMailFp = ''
let lastListenError = ''
function say(text, ok=true){
  toast.textContent = text
  toast.className = 'toast show' + (ok ? '' : ' bad')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600)
}
function showPicked(files){
  if (!files.length) { picked.textContent = '尚未选取'; return }
  picked.innerHTML = [...files].map(f => '<span class="file-chip">' + f.name + ' · ' + Math.max(1, Math.round(f.size/1024)) + ' KB</span>').join('')
}
function openPicker(){ file.click() }
async function post(path, body){
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({ error: '请求失败 ' + res.status }))
  if (!res.ok && !data.error) data.error = '请求失败 ' + res.status
  return { res, data }
}
async function toggleListen(){
  const btn = document.getElementById('listen-toggle')
  const on = btn.getAttribute('aria-pressed') !== 'true'
  const { data } = await post('/plugins/dsh-messenger/wx/listen', { on })
  if (data.error) { say(data.error, false); await pull(); return }
  if (on) say(data.running ? '已开始监听' : '已请求监听')
  else say(data.running ? '侧车仍在跑' : '已暂停监听')
  await pull()
}
async function retryTask(id, mode){
  const body = mode === 'shot' ? { id, mode: "shot" } : { id, mode: "dispatch" }
  const { data } = await post('/plugins/dsh-messenger/task/retry', body)
  if (data.error) { say(data.error, false); return }
  say(mode === 'shot' ? '已再截再发' : '已再派一次')
  await pull()
}
async function deleteItem(id){
  const { data } = await post('/plugins/dsh-messenger/item/delete', { id })
  if (data.error) { say(data.error, false); return }
  if (openItemId === id) openItemId = ''
  if (armedId === id) disarmDelete(true)
  say('已移除')
  await pull()
}
drop.addEventListener('click', e => { if (e.target.id !== 'file') openPicker() })
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } })
document.getElementById('pick').addEventListener('click', e => { e.stopPropagation(); openPicker() })
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over') })
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('over'); showPicked(e.dataTransfer.files); say('底稿已记下，回图通道未接')
})
file.addEventListener('change', e => { showPicked(e.target.files); say('底稿已记下，回图通道未接') })
document.getElementById('listen-toggle').addEventListener('click', () => toggleListen().catch(() => say('监听开关未成', false)))
async function collectKeys(){
  const btn = document.getElementById('keys-collect')
  btn.disabled = true
  const { data } = await post('/plugins/dsh-messenger/wx/keys/collect', {})
  if (data.error) { say(data.error, false); btn.disabled = false; await pull(); return }
  say('请在系统窗口允许管理员权限')
  await pull()
}
let clearArmed = false
let clearTimer = 0
function resetClear(){
  clearArmed = false
  const btn = document.getElementById('keys-clear')
  if (!btn) return
  btn.classList.remove('is-armed')
  btn.textContent = '清除密钥'
}
async function clearKeys(){
  const btn = document.getElementById('keys-clear')
  if (!clearArmed) {
    clearArmed = true
    btn.classList.add('is-armed')
    btn.textContent = '确认清除'
    clearTimeout(clearTimer)
    clearTimer = setTimeout(resetClear, 3000)
    return
  }
  clearTimeout(clearTimer)
  resetClear()
  const { data } = await post('/plugins/dsh-messenger/wx/keys/clear', {})
  if (data.error) { say(data.error, false); await pull(); return }
  say('密钥已清除')
  await pull()
}
document.getElementById('keys-collect').addEventListener('click', () => collectKeys().catch(() => say('采集未成', false)))
document.getElementById('keys-clear').addEventListener('click', () => clearKeys().catch(() => say('清除未成', false)))
async function startLogin(){
  const user = (document.getElementById('qq-user')?.value || '').trim()
  const auth = (document.getElementById('qq-auth')?.value || '').trim()
  if ((user && !auth) || (!user && auth)) { say('请先填写邮箱和授权码', false); return }
  const { data } = await post('/plugins/dsh-messenger/mail/login', user && auth ? { user, auth } : {})
  if (data.error) { say(data.error, false); await pull(); return }
  const secret = document.getElementById('qq-auth')
  if (secret) secret.value = ''
  say(data.message || '信匣已接通')
  await pull()
}
async function switchAccount(){
  await post('/plugins/dsh-messenger/mail/logout', {})
  const secret = document.getElementById('qq-auth')
  if (secret) secret.value = ''
  say('已断开信匣，可换号接通')
  await pull()
}
document.getElementById('acct').addEventListener('click', () => { switchAccount().catch(() => say('更换账号未成', false)) })
document.getElementById('mail-gate').addEventListener('submit', e => {
  e.preventDefault()
  startLogin().catch(() => say('接通未成', false))
})
document.getElementById('mail-login').addEventListener('click', () => {
  if (document.getElementById('mail-login').textContent === '刷新信匣') {
    pull().then(state => {
      if (!state || state.mailError) return
      say('信匣已刷新')
    }).catch(() => say('刷新未成', false))
    return
  }
  startLogin().catch(() => say('接通未成', false))
})
document.getElementById('draft').addEventListener('click', async () => {
  const to = document.getElementById('to').value
  const subject = document.getElementById('subject').value
  const notes = document.getElementById('notes').value
  const prev = document.getElementById('body').value
  const { data } = await post('/plugins/dsh-messenger/mail/draft', { to, subject, notes })
  if (data.ok === false || data.error) {
    document.getElementById('body').value = prev
    say(data.error || '起草未成', false)
    return
  }
  document.getElementById('body').value = data.body || prev
  say('起草已写入正文')
})
document.getElementById('compose').addEventListener('submit', async e => {
  e.preventDefault()
  const draft = {
    to: document.getElementById('to').value,
    subject: document.getElementById('subject').value,
    body: document.getElementById('body').value,
  }
  const { data } = await post('/plugins/dsh-messenger/mail/send', draft)
  if (data.ok === false) {
    const keep = data.draft || draft
    document.getElementById('to').value = keep.to ?? draft.to
    document.getElementById('subject').value = keep.subject ?? draft.subject
    document.getElementById('body').value = keep.body ?? draft.body
    say(data.error || '发出失败', false)
    return
  }
  say('已发出')
})
document.getElementById('fill-from').addEventListener('click', () => {
  if (lastFrom) document.getElementById('to').value = lastFrom
  say('发件人已写入收件人')
})
const ARM_MS = 3000
function disarmDelete(clearState){
  if (clearState) { armedId = ''; armedDeadline = 0 }
  clearTimeout(armedTimer)
  armedTimer = undefined
  document.querySelectorAll('button[data-act="del"].is-armed').forEach(el => {
    el.dataset.armed = '0'; el.classList.remove('is-armed'); el.textContent = '移除'
  })
}
function applyArmedDelete(id){
  document.querySelectorAll('#items button[data-act="del"]').forEach(el => {
    const on = el.dataset.id === id
    el.dataset.armed = on ? '1' : '0'
    el.classList.toggle('is-armed', on)
    el.textContent = on ? '确认删除' : '移除'
  })
}
function scheduleDisarm(){
  clearTimeout(armedTimer)
  const remaining = armedDeadline - Date.now()
  if (remaining <= 0) { disarmDelete(true); return }
  armedTimer = setTimeout(() => disarmDelete(true), remaining)
}
function restoreArmedDelete(){
  if (!armedId) return
  if (Date.now() >= armedDeadline) { disarmDelete(true); return }
  const found = [...document.querySelectorAll('#items button[data-act="del"]')].some(el => el.dataset.id === armedId)
  if (!found) { disarmDelete(true); return }
  applyArmedDelete(armedId)
  scheduleDisarm()
}
function armDelete(btn){
  if (btn.dataset.armed !== '1') {
    disarmDelete(true)
    armedId = btn.dataset.id || ''
    armedDeadline = Date.now() + ARM_MS
    btn.dataset.armed = '1'
    btn.classList.add('is-armed')
    btn.textContent = '确认删除'
    say('再点一次确认移除「' + (btn.dataset.name || '') + '」')
    scheduleDisarm()
    return
  }
  disarmDelete(true)
  if (!btn.dataset.id) { say('没有任务', false); return }
  deleteItem(btn.dataset.id).catch(() => say('删除未成', false))
}
function toggleItem(id){
  openItemId = openItemId === id ? '' : id
  document.querySelectorAll('#items .slip').forEach(el => {
    const on = el.dataset.id === openItemId
    el.classList.toggle('is-open', on)
    const tog = el.querySelector('.slip-toggle')
    if (tog) tog.setAttribute('aria-expanded', on ? 'true' : 'false')
  })
}
function bindShots(){
  document.querySelectorAll('.shot-thumb').forEach(img => {
    img.addEventListener('error', () => { img.hidden = true })
  })
}
async function openMail(id){
  const res = await fetch('/plugins/dsh-messenger/mail/read?id=' + encodeURIComponent(id), { cache: 'no-store' })
  const data = await res.json().catch(() => ({ error: '读信失败' }))
  if (!res.ok || data.error) { say(data.error || '读信失败', false); return }
  openMailId = id
  lastFrom = data.from || ''
  const pane = document.getElementById('mail-read')
  pane.hidden = false
  pane.classList.remove('is-hidden')
  document.getElementById('read-subject').textContent = data.subject || '（无主题）'
  document.getElementById('read-meta').textContent = (data.from || '') + ' · ' + formatBeijingTime(data.at, { seconds: false })
  document.getElementById('read-body').textContent = data.body || ''
  document.querySelectorAll('#mail .task').forEach(el => {
    el.classList.toggle('is-open', el.dataset.id === id)
  })
}
document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]')
  if (!btn) return
  if (btn.dataset.act === 'del') return armDelete(btn)
  if (btn.dataset.act === 'retry') return retryTask(btn.dataset.id, 'dispatch').catch(() => say('再派未成', false))
  if (btn.dataset.act === 'reshot') return retryTask(btn.dataset.id, 'shot').catch(() => say('再截未成', false))
  if (btn.dataset.act === 'open') return toggleItem(btn.dataset.id)
  if (btn.dataset.act === 'read') return openMail(btn.dataset.id).catch(() => say('读信失败', false))
})
function esc(value){
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function chipText(state){
  if (state.mailConfigured === false || state.mailError === '未配置 QQ 邮箱') return '未配置 QQ 邮箱'
  if (state.mailLoggedIn && state.mailbox) return state.mailbox
  return '接通信匣'
}
function gateHtml(state){
  const err = state.mailError && state.mailError !== '未配置 QQ 邮箱'
    ? '<p class="hint mail-gate-err" id="qq-err">' + esc(state.mailError) + '</p>'
    : '<p class="hint mail-gate-err is-hidden" id="qq-err"></p>'
  return '<p class="kicker">QQ 邮箱</p><h3>接通信匣</h3><p class="hint" style="margin:0">QQ 邮箱设置里开启 IMAP/SMTP，用授权码接通。授权码不是登录密码，保存后不回显。</p>' + err + '<form class="compose mail-auth" id="qq-form" autocomplete="off"><label>邮箱 <input id="qq-user" name="user" type="email" placeholder="你的QQ号@qq.com" autocomplete="username"/></label><label>授权码 <input id="qq-auth" name="auth" type="password" placeholder="邮箱设置里生成的授权码" autocomplete="current-password"/></label><button type="submit" class="btn-primary">接通信匣</button></form>'
}
const labels = ${JSON.stringify(STATUS_LABEL)}
function formatBeijingTime(value, opts){
  const seconds = !opts || opts.seconds !== false
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const get = type => (parts.find(part => part.type === type) || {}).value || ''
  const clock = seconds ? get('hour') + ':' + get('minute') + ':' + get('second') : get('hour') + ':' + get('minute')
  return get('year') + '-' + get('month') + '-' + get('day') + ' ' + clock
}
function itemsFingerprint(items){
  return JSON.stringify((items || []).map(item => [item.id, item.status, item.title, item.text, item.at, item.action]))
}
lastItemsFp = itemsFingerprint(${JSON.stringify(state.items || [])})
lastMailFp = JSON.stringify((${JSON.stringify(state.mail || [])}).map(item => [item.id, item.subject, item.from, item.at, '']))
function paint(state){
  if (state.mailError) {
    if (state.mailError !== lastMailError) {
      say(state.mailError, false)
      lastMailError = state.mailError
    }
  } else {
    lastMailError = ''
  }
  if (state.listenError) {
    if (state.listenError !== lastListenError) {
      say(state.listenError, false)
      lastListenError = state.listenError
    }
  } else {
    lastListenError = ''
  }
  const keysStatus = state.keysStatus || 'missing'
  document.getElementById('listen-chip').textContent = keysStatus === 'collecting'
    ? '采集中'
    : (keysStatus === 'missing' || keysStatus === 'invalid')
      ? '未采密钥'
      : (state.listen ? '在听' : '未在听')
  const collectBtn = document.getElementById('keys-collect')
  const clearBtn = document.getElementById('keys-clear')
  const showCollect = keysStatus === 'missing' || keysStatus === 'invalid' || keysStatus === 'collecting'
  collectBtn.classList.toggle('is-hidden', !showCollect)
  collectBtn.disabled = keysStatus === 'collecting'
  clearBtn.classList.toggle('is-hidden', keysStatus !== 'ready')
  if (keysStatus !== 'ready') resetClear()
  const listenBtn = document.getElementById('listen-toggle')
  listenBtn.setAttribute('aria-pressed', state.listen ? 'true' : 'false')
  listenBtn.textContent = state.listen ? '暂停监听' : '开始监听'
  document.getElementById('mail-chip').textContent = chipText(state)
  document.getElementById('item-count').textContent = (state.items || []).length + ' 条'
  document.getElementById('mail-login').textContent = state.mailLoggedIn ? '刷新信匣' : '接通信匣'
  const gate = document.getElementById('mail-gate')
  const work = document.getElementById('mail-work')
  if (state.mailLoggedIn) {
    gate.classList.add('is-hidden')
    work.classList.remove('is-hidden')
  } else {
    gate.classList.remove('is-hidden')
    work.classList.add('is-hidden')
    if (!document.getElementById('qq-form')) gate.innerHTML = gateHtml(state)
    else {
      const err = document.getElementById('qq-err')
      if (err) {
        if (state.mailError && state.mailError !== '未配置 QQ 邮箱') {
          err.textContent = state.mailError
          err.classList.remove('is-hidden')
        } else {
          err.textContent = ''
          err.classList.add('is-hidden')
        }
      }
    }
    openMailId = ''
    lastFrom = ''
    const pane = document.getElementById('mail-read')
    pane.hidden = true
    pane.classList.add('is-hidden')
    document.getElementById('read-subject').textContent = '（无主题）'
    document.getElementById('read-meta').textContent = ''
    document.getElementById('read-body').textContent = ''
  }
  const items = state.items || []
  const itemsBox = document.getElementById('items')
  const itemsFp = itemsFingerprint(items)
  if (itemsFp !== lastItemsFp) {
    const keepTop = itemsBox.scrollTop
    itemsBox.innerHTML = items.length ? items.map(item => {
    const at = formatBeijingTime(item.at)
    const stamped = item.action === 'dispatch' ? '带口令' : item.action === 'empty-password' ? '口令空' : '闲聊'
    const id = esc(item.id || '')
    const open = item.id === openItemId
    const title = item.title || '尚未开会话'
    const showShot = item.status === 'replied' || item.status === 'shot-failed' || item.status === 'replying'
    const shot = showShot
      ? '<img class="shot-thumb" src="/plugins/dsh-messenger/shot?id=' + id + '" alt="回图 ' + esc(item.id || '') + '" loading="lazy"/>'
      : '<p class="hint shot-miss">尚无回图</p>'
    return '<article class="slip' + (open ? ' is-open' : '') + '" data-id="' + id + '"><button type="button" class="slip-toggle" data-act="open" data-id="' + id + '" aria-expanded="' + (open ? 'true' : 'false') + '"><strong>' + esc(item.id || '未编号') + '</strong><em>' + esc(at) + '</em><span class="stamp">' + esc(stamped) + '</span><span class="stamp">' + esc(labels[item.status] || item.status || '仅记录') + '</span></button><div class="slip-more"><p class="slip-text"><span class="kicker">原文</span>' + esc(item.text || item.prompt || '（空）') + '</p><p class="slip-title"><span class="kicker">会话标题</span>' + esc(title) + '</p><div class="shot-box">' + shot + '</div><div class="actions"><button type="button" class="btn-soft" data-act="retry" data-id="' + id + '">再派一次</button><button type="button" class="btn-quiet" data-act="reshot" data-id="' + id + '">再截再发</button><button type="button" class="btn-danger" data-act="del" data-id="' + id + '" data-name="' + esc(item.id || item.text || '这条') + '">移除</button></div></div></article>'
  }).join('') : '<p class="empty">专线还安静。黄山会话里开口令「任务:」就会派活，本机绿气泡也算；闲聊只入库。</p>'
    lastItemsFp = itemsFp
    itemsBox.scrollTop = keepTop
    bindShots()
    restoreArmedDelete()
  }
  const mail = state.mail || []
  const mailBox = document.getElementById('mail')
  const mailFp = JSON.stringify(mail.map(item => [item.id, item.subject, item.from, item.at, openMailId]))
  if (mailFp !== lastMailFp) {
    mailBox.innerHTML = mail.length ? mail.map(item => '<button type="button" class="task' + (item.id === openMailId ? ' is-open' : '') + '" data-act="read" data-id="' + esc(item.id || '') + '"><strong>' + esc(item.subject || '（无主题）') + '</strong><em>' + esc(item.from || '') + ' · ' + esc(formatBeijingTime(item.at, { seconds: false })) + '</em></button>').join('') : '<p class="empty">信匣空着。接通 QQ 邮箱后，发件人、主题、时间会落在这本台账上。</p>'
    lastMailFp = mailFp
  }
}
async function pull(){
  try {
    const res = await fetch('/plugins/dsh-messenger/state', { cache: 'no-store' })
    if (!res.ok) return null
    const state = await res.json()
    paint(state)
    return state
  } catch {}
  return null
}
bindShots()
function tick(){
  if (document.visibilityState === 'hidden') return
  pull()
}
setInterval(tick, 2000)
document.addEventListener('visibilitychange', function(){
  if (document.visibilityState === 'visible') pull()
})
</script>
</body></html>`
}
