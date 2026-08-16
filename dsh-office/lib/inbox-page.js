import { workThemeCss } from "./theme.css.js"

function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

export function inboxHtml(state) {
	const rows = (state.docs ?? []).map((item) => `<tr>
		<td>${esc(item.name)}</td>
		<td>${esc(item.kind)}</td>
		<td>${esc(item.uploadedAt?.replace("T", " ").slice(0, 19))}</td>
		<td>${item.chars ?? 0}${item.truncated ? "（已截断）" : ""}</td>
		<td>${item.toKb ? esc(item.kbPath) : "未入库"}</td>
		<td class="actions">
			<button type="button" class="btn-soft" data-act="kb" data-id="${esc(item.id)}">${item.toKb ? "已入库" : "入知识库"}</button>
			<button type="button" class="btn-danger" data-act="del" data-id="${esc(item.id)}" data-name="${esc(item.name)}">移除</button>
		</td>
	</tr>`).join("") || `<tr><td colspan="6">还没有文稿。把 Word / Excel / PPT / PDF / 截图拖到上面。</td></tr>`

	return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/>
<title>知识库</title>
<style>${workThemeCss()}</style></head>
<body>
<div class="wrap">
<p class="kicker">Knowledge atelier</p>
<h1>知识库</h1>
<p class="lede">文稿解析后可入库。原件在 <code>D:\\dsh-workbench\\docs</code>，条文在 <code>D:\\dsh-kb</code>。对话里用 <code>docs_list</code> / <code>kb_search</code> / <code>vision_parse</code>。</p>
<nav class="nav"><a href="/plugins/dsh-dashboard/wall">数据大屏</a><a href="/plugins/dsh-datacenter/board">循环任务</a></nav>

<div class="card">
<div id="drop" class="drop" role="button" tabindex="0" aria-label="选取或拖入文档">
  <input id="file" type="file" multiple accept=".docx,.xlsx,.pptx,.pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.bmp,image/*"/>
  <div class="drop-mark">+</div>
  <p class="drop-title">把文稿或截图放进来</p>
  <p class="drop-sub">拖拽到这里，或点击选取。图片走视觉解析，一次可多份。</p>
  <span class="btn btn-primary" id="pick">选取文稿</span>
  <div class="drop-names" id="picked">尚未选取</div>
</div>
<div class="row">
<label><input id="tokb" type="checkbox"/> 解析后写入知识库备忘</label>
<select id="col"><option value="notes">notes 备忘</option><option value="policies">policies 制度</option><option value="dictionary">dictionary 字典</option><option value="recipes">recipes 口径</option></select>
</div>
<p class="hint">支持 Word / Excel / PPT / PDF / 文本，以及 png jpg webp gif 截图。单文件不超过 20MB。旧版 .doc 请先另存为 .docx。不要上传未脱敏的全员成绩或学籍名单。</p>
</div>
<div id="toast" class="toast" role="status"></div>

<div class="card">
<h2>已解析文档</h2>
<div class="paper-scroll" tabindex="0" aria-label="已解析文档">
<table><thead><tr><th>文件</th><th>类型</th><th>时间</th><th>字数</th><th>知识库</th><th></th></tr></thead>
<tbody>${rows}</tbody></table>
</div>
</div>
</div>
<script>
const drop = document.getElementById('drop')
const file = document.getElementById('file')
const picked = document.getElementById('picked')
const toast = document.getElementById('toast')
let toastTimer
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
async function sendFiles(files){
  const list = [...files]
  if (!list.length) return
  showPicked(list)
  for (let i = 0; i < list.length; i++){
    const item = list[i]
    say('正在解析 ' + (i+1) + '/' + list.length + ' · ' + item.name)
    const data = new FormData()
    data.append('file', item)
    data.append('toKb', document.getElementById('tokb').checked ? '1' : '0')
    data.append('collection', document.getElementById('col').value)
    const res = await fetch('/plugins/dsh-docs/api/upload', { method:'POST', body:data })
    const json = await res.json()
    if (json.error) throw new Error(json.error)
  }
  say('已解析 ' + list.length + ' 份')
  setTimeout(() => location.reload(), 400)
}
drop.addEventListener('click', e => { if (e.target.id !== 'file') openPicker() })
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } })
document.getElementById('pick').addEventListener('click', e => { e.stopPropagation(); openPicker() })
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over') })
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); sendFiles(e.dataTransfer.files).catch(err => say(err.message, false)) })
file.addEventListener('change', e => sendFiles(e.target.files).catch(err => say(err.message, false)))
document.querySelectorAll('button[data-act]').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (btn.dataset.act === 'del') {
      if (btn.dataset.armed !== '1') {
        document.querySelectorAll('button[data-act="del"].is-armed').forEach(other => {
          other.dataset.armed = '0'; other.classList.remove('is-armed'); other.textContent = '移除'
        })
        btn.dataset.armed = '1'
        btn.classList.add('is-armed')
        btn.textContent = '确认删除'
        say('再点一次确认移除「' + (btn.dataset.name || '') + '」', true)
        setTimeout(() => {
          if (btn.dataset.armed === '1') { btn.dataset.armed = '0'; btn.classList.remove('is-armed'); btn.textContent = '移除' }
        }, 3200)
        return
      }
    }
    const path = btn.dataset.act === 'del' ? '/plugins/dsh-docs/api/delete' : '/plugins/dsh-docs/api/to-kb'
    const res = await fetch(path, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: btn.dataset.id, collection: document.getElementById('col').value }) })
    const json = await res.json()
    if (json.error) return say(json.error, false)
    location.reload()
  })
})
</script>
</body></html>`
}
