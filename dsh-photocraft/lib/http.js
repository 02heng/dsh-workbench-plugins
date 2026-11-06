/**
 * dsh-photocraft 网页工作台 HTTP 路由。
 *
 * registerWorkbench(webServer, { root, work }) 注册：
 *   GET  /plugins/dsh-photocraft/            单页工作台
 *   GET  /plugins/dsh-photocraft/app.js      前端脚本
 *   GET  /plugins/dsh-photocraft/style.css   前端样式
 *   GET  /plugins/dsh-photocraft/api/status  环境探测
 *   POST /plugins/dsh-photocraft/api/upload  multipart 上传（字段 file）
 *   POST /plugins/dsh-photocraft/api/run     后台跑 pipeline → { jobId }
 *   GET  /plugins/dsh-photocraft/api/job     进度/结果
 *   POST /plugins/dsh-photocraft/api/job/cancel  取消运行
 *   POST /plugins/dsh-photocraft/api/open-dir     打开输出目录（Windows explorer）
 *   GET  /plugins/dsh-photocraft/file        结果/原图字节（限制在 work 根内）
 *
 * 返回一个 dispose 函数；dispose.stops 是路由注销函数数组，
 * 且 dispose 可迭代（for (const stop of dispose) ...），兼容两种清理写法。
 */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { basename, dirname, extname, isAbsolute, join, relative as pathRelative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import * as cutoutModule from "./cutout.js"
import * as paintModule from "./paint.js"
import * as watermarkModule from "./watermark.js"

const here = dirname(fileURLToPath(import.meta.url))
const UI_DIR = join(here, "ui")

const BASE = "/plugins/dsh-photocraft"
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024
const MAX_FILES_PER_RUN = 40
const MAX_JOBS = 40

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".psd"])

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".psd": "image/vnd.adobe.photoshop",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
}

/* ------------------------------------------------------------------ 基础工具 */

function messageOf(error) {
  if (error && typeof error === "object" && "message" in error) return String(error.message)
  return String(error)
}

function json(res, status, body) {
  if (res.writableEnded) return
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  res.end(JSON.stringify(body))
}

function sameOrigin(req) {
  const host = String(req.headers.host ?? "")
  const origin = String(req.headers.origin ?? "")
  const referer = String(req.headers.referer ?? "")
  const check = (value) => {
    if (!value) return false
    try { return new URL(value).host === host } catch { return false }
  }
  if (origin) return check(origin)
  if (referer) return check(referer)
  return Boolean(host)
}

function isPost(req) {
  return String(req.method ?? "GET").toUpperCase() === "POST"
}

function parseUrl(req) {
  try { return new URL(String(req.url ?? "/"), "http://127.0.0.1") } catch { return new URL("http://127.0.0.1/") }
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_UPLOAD_BYTES) throw new Error("请求体超过 40MB")
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString("utf8")
  if (!text.trim()) return {}
  return JSON.parse(text)
}

function lower(value) {
  return process.platform === "win32" ? value.toLowerCase() : value
}

/** 把 target 解析成绝对路径并限制在 rootDir 内；越界返回 null。 */
function confine(rootDir, target) {
  if (typeof target !== "string" || target.trim() === "") return null
  const rootAbs = resolve(rootDir)
  const raw = target.trim()
  const abs = isAbsolute(raw) ? resolve(raw) : resolve(rootAbs, raw)
  const a = lower(abs)
  const b = lower(rootAbs)
  if (a === b) return abs
  if (!a.startsWith(b + sep) && !a.startsWith(b + "/")) return null
  return abs
}

function relTo(rootDir, abs) {
  const rel = pathRelative(resolve(rootDir), resolve(abs))
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return ""
  return rel.split(sep).join("/")
}

function fileUrl(rootDir, abs) {
  const rel = relTo(rootDir, abs)
  return rel ? BASE + "/file?path=" + encodeURIComponent(rel) : ""
}

async function statFile(abs) {
  try {
    const info = await stat(abs)
    return info.isFile() ? info : null
  } catch {
    return null
  }
}

function mimeOf(abs) {
  return MIME[extname(abs).toLowerCase()] ?? "application/octet-stream"
}

function timestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, "0")
  return String(now.getFullYear()) + pad(now.getMonth() + 1) + pad(now.getDate()) +
    "-" + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
}

function newJobId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function safeName(name) {
  const base = String(name ?? "image").replace(/^.*[\\/]/, "") || "image"
  const cleaned = base.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80)
  const withExt = extname(cleaned) ? cleaned : cleaned + ".png"
  return withExt || "image.png"
}

/* ------------------------------------------------------------------ 参数字典 */

function pickFn(mod, names) {
  for (const name of names) {
    if (typeof mod?.[name] === "function") return mod[name]
  }
  return null
}

const KINDS = {
  dewatermark: {
    label: "去水印",
    exportName: "runDewatermark",
    run: pickFn(watermarkModule, ["runDewatermark", "dewatermark", "run"]),
    defaults: { region: "auto", padding: 4, method: "fill", onMiss: "skip", format: "png", quality: 92 },
  },
  cutout: {
    label: "抠图",
    exportName: "runCutout",
    run: pickFn(cutoutModule, ["runCutout", "cutout", "run"]),
    defaults: { refine: true, decontaminate: true, trim: false, format: "png" },
  },
  paint: {
    label: "画笔",
    exportName: "runBrushPaint",
    run: pickFn(paintModule, ["runBrushPaint", "brushPaint", "paint", "run"]),
    defaults: {
      style: "impressionist",
      brushSize: 24,
      density: 1,
      passes: 2,
      jitter: 0.35,
      seed: 7,
      maxStrokes: 4000,
      keepReference: false,
      format: "png",
    },
  },
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function clampInt(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max))
}

function pickBool(value, fallback) {
  if (typeof value === "boolean") return value
  if (value === 1 || value === "1" || value === "true") return true
  if (value === 0 || value === "0" || value === "false") return false
  return fallback
}

function pickChoice(value, fallback, allowed) {
  const text = String(value ?? "")
  return allowed.includes(text) ? text : fallback
}

const FORMATS = ["png", "jpg", "jpeg", "webp", "psd"]

function normalizeOptions(kind, raw) {
  const input = raw && typeof raw === "object" ? raw : {}
  const defaults = KINDS[kind].defaults
  if (kind === "dewatermark") {
    return {
      region: pickChoice(input.region, defaults.region, ["auto", "bottom-right", "bottom-left", "bottom-band", "corner"]),
      padding: clampInt(input.padding, defaults.padding, 0, 64),
      method: pickChoice(input.method, defaults.method, ["fill", "contentAware", "patch", "crop"]),
      onMiss: pickChoice(input.onMiss, defaults.onMiss, ["skip", "corner", "fail"]),
      format: pickChoice(input.format, defaults.format, FORMATS),
      quality: clampInt(input.quality, defaults.quality, 1, 100),
      recursive: pickBool(input.recursive, false),
    }
  }
  if (kind === "cutout") {
    return {
      refine: pickBool(input.refine, defaults.refine),
      decontaminate: pickBool(input.decontaminate, defaults.decontaminate),
      trim: pickBool(input.trim, defaults.trim),
      format: pickChoice(input.format, defaults.format, ["png", "webp"]),
      recursive: pickBool(input.recursive, false),
    }
  }
  return {
    style: pickChoice(input.style, defaults.style, ["impressionist", "pointillist", "crosshatch", "ink", "pencil", "flat"]),
    brushSize: clampInt(input.brushSize, defaults.brushSize, 2, 400),
    density: clampNumber(input.density, defaults.density, 0.1, 4),
    passes: clampInt(input.passes, defaults.passes, 1, 4),
    jitter: clampNumber(input.jitter, defaults.jitter, 0, 1),
    seed: clampInt(input.seed, defaults.seed, 0, 4294967295),
    maxStrokes: clampInt(input.maxStrokes, defaults.maxStrokes, 1, 50000),
    keepReference: pickBool(input.keepReference, defaults.keepReference),
    format: pickChoice(input.format, defaults.format, ["png", "psd"]),
  }
}

/* ------------------------------------------------------------------ 请求处理 */

function readMultipart(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const ctype = String(req.headers["content-type"] ?? "")
    const match = /boundary=([^;]+)/i.exec(ctype)
    if (!match) {
      rejectPromise(new Error("需要 multipart/form-data"))
      return
    }
    const boundary = match[1].trim().replace(/^"|"$/g, "")
    const chunks = []
    let size = 0
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > MAX_UPLOAD_BYTES) {
        rejectPromise(new Error("文件超过 40MB"))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      try { resolvePromise(parseMultipart(Buffer.concat(chunks), boundary)) } catch (error) { rejectPromise(error) }
    })
    req.on("error", rejectPromise)
  })
}

function headerValue(headers, name) {
  const text = String(headers ?? "")
  const starred = new RegExp(name + "\\*=(?:UTF-8'')?([^;\\r\\n]+)", "i").exec(text)
  if (starred) {
    try { return decodeURIComponent(starred[1].trim().replace(/^"|"$/g, "")) } catch { /* 忽略 */ }
  }
  const quoted = new RegExp(name + '="([^"]*)"', "i").exec(text)
  if (quoted) return quoted[1].trim()
  const plain = new RegExp(name + "=([^;\\r\\n]+)", "i").exec(text)
  return plain ? plain[1].trim().replace(/^"|"$/g, "") : ""
}

function parseMultipart(buf, boundary) {
  const sep = Buffer.from("--" + boundary)
  const fields = {}
  const files = []
  let offset = 0
  while (offset < buf.length) {
    const start = buf.indexOf(sep, offset)
    if (start < 0) break
    offset = start + sep.length
    if (buf.slice(offset, offset + 2).toString() === "--") break
    if (buf.slice(offset, offset + 2).toString() === "\r\n") offset += 2
    const headerEnd = buf.indexOf("\r\n\r\n", offset)
    if (headerEnd < 0) break
    const headers = buf.slice(offset, headerEnd).toString("utf8")
    offset = headerEnd + 4
    const next = buf.indexOf(sep, offset)
    const end = next < 0 ? buf.length : next - 2
    const body = buf.slice(offset, Math.max(offset, end))
    offset = next < 0 ? buf.length : next
    const name = headerValue(headers, "name")
    const filename = headerValue(headers, "filename")
    if (filename) {
      files.push({ field: name, filename: filename.replace(/^.*[\\/]/, ""), buffer: body })
    } else if (name) {
      fields[name] = body.toString("utf8")
    }
  }
  return { fields, files }
}

async function serveUi(res, file, contentType, method) {
  try {
    const body = await readFile(file)
    res.writeHead(200, { "content-type": contentType, "cache-control": "no-store", "content-length": body.length })
    if (String(method).toUpperCase() === "HEAD") res.end()
    else res.end(body)
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    res.end("UI 资源读取失败：" + messageOf(error))
  }
}

async function handleUpload(req, res, workDir) {
  if (!isPost(req)) return json(res, 405, { error: "POST only" })
  if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" })
  let parsed
  try { parsed = await readMultipart(req) } catch (error) { return json(res, 400, { error: messageOf(error) }) }
  if (!parsed.files.length) return json(res, 400, { error: "没有收到文件（字段名 file）" })
  const inbox = join(workDir, "inbox")
  await mkdir(inbox, { recursive: true })
  const saved = []
  try {
    for (const part of parsed.files) {
      const ext = extname(part.filename).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) throw new Error("不支持的图片格式：" + (ext || "(无扩展名)"))
      if (!part.buffer.length) throw new Error("空文件：" + part.filename)
      const id = createHash("sha256").update(part.buffer).digest("hex").slice(0, 16)
      const name = safeName(part.filename)
      const abs = join(inbox, id + "-" + name)
      if (!(await statFile(abs))) await writeFile(abs, part.buffer)
      saved.push({ id, name, path: abs, size: part.buffer.length, url: fileUrl(workDir, abs) })
    }
  } catch (error) {
    return json(res, 400, { error: messageOf(error) })
  }
  const first = saved[0]
  return json(res, 200, saved.length === 1 ? first : Object.assign({ files: saved }, first))
}

async function resolveInput(item, workDir) {
  let id = ""
  let rawPath = ""
  if (typeof item === "string") {
    if (/^[0-9a-f]{16}$/i.test(item.trim())) id = item.trim()
    else rawPath = item
  } else if (item && typeof item === "object") {
    id = String(item.id ?? "")
    rawPath = String(item.path ?? "")
  }
  let abs = ""
  if (id) {
    const inbox = join(workDir, "inbox")
    let names = []
    try { names = await readdir(inbox) } catch { names = [] }
    const hit = names.find((name) => lower(name).startsWith(lower(id) + "-"))
    if (hit) abs = join(inbox, hit)
  }
  if (!abs && rawPath) abs = confine(workDir, rawPath) ?? ""
  if (!abs) return null
  const info = await statFile(abs)
  if (!info) return null
  const name = basename(abs).replace(/^[0-9a-f]{16}-/i, "")
  return { path: abs, name, size: info.size, url: fileUrl(workDir, abs) }
}

async function handleRun(req, res, workDir, jobs) {
  if (!isPost(req)) return json(res, 405, { error: "POST only" })
  if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" })
  let body
  try { body = await readBody(req) } catch (error) { return json(res, 400, { error: messageOf(error) }) }
  const kind = String(body?.kind ?? "")
  const plan = KINDS[kind]
  if (!plan) return json(res, 400, { error: "未知功能：" + (kind || "(空)"), kinds: Object.keys(KINDS) })
  if (typeof plan.run !== "function") {
    return json(res, 503, { error: kind + " 管线尚未就绪：缺少 " + plan.exportName + " 导出" })
  }
  const requested = Array.isArray(body?.files) ? body.files : []
  if (!requested.length) return json(res, 400, { error: "没有选择图片" })
  const files = []
  for (const item of requested.slice(0, MAX_FILES_PER_RUN)) {
    const resolved = await resolveInput(item, workDir)
    if (!resolved) return json(res, 400, { error: "无法识别或不在工作区内的图片：" + JSON.stringify(item) })
    files.push(resolved)
  }
  const options = normalizeOptions(kind, body?.options)
  const jobId = newJobId()
  const outDir = join(workDir, "out", timestamp() + "-" + kind + "-" + jobId.slice(-6))
  await mkdir(outDir, { recursive: true })
  const job = {
    id: jobId,
    kind,
    label: plan.label,
    state: "running",
    total: files.length,
    done: 0,
    okCount: 0,
    failCount: 0,
    current: "",
    results: [],
    log: [],
    error: "",
    outDir,
    createdAt: Date.now(),
    startedAt: Date.now(),
    finishedAt: 0,
    cancelRequested: false,
    controller: null,
  }
  jobs.set(jobId, job)
  pruneJobs(jobs)
  void runJob(job, plan, options, files, workDir).catch((error) => {
    job.state = "failed"
    job.error = messageOf(error)
    job.finishedAt = Date.now()
  })
  return json(res, 200, { jobId, kind, label: plan.label, total: files.length, outDir, options })
}

async function runJob(job, plan, options, files, workDir) {
  const controller = new AbortController()
  job.controller = controller
  try {
    for (const file of files) {
      if (job.cancelRequested) {
        job.state = "failed"
        job.error = "已取消"
        break
      }
      job.current = file.name
      const startedAt = Date.now()
      try {
        const result = await plan.run({
          input: file.path,
          output: job.outDir,
          ...options,
          logger: (line) => {
            const text = String(line).trim()
            if (!text) return
            job.log.push(text.slice(0, 400))
            if (job.log.length > 80) job.log.shift()
          },
          signal: controller.signal,
        })
        job.results.push(await toResult(file, result, job, startedAt, workDir))
      } catch (error) {
        job.results.push({
          name: file.name,
          ok: false,
          url: "",
          sourceUrl: file.url,
          meta: { error: messageOf(error) },
        })
      }
      const entry = job.results[job.results.length - 1]
      if (entry && entry.ok) job.okCount += 1
      else job.failCount += 1
      job.done += 1
    }
    if (job.state === "running") job.state = job.okCount > 0 || job.failCount === 0 ? "done" : "failed"
    if (job.state === "failed" && !job.error) job.error = job.failCount + " 张图片处理失败"
  } catch (error) {
    job.state = "failed"
    job.error = messageOf(error)
  } finally {
    job.current = ""
    job.finishedAt = Date.now()
    job.controller = null
  }
}

async function toResult(file, result, job, startedAt, workDir) {
  const list = Array.isArray(result?.files) ? result.files : []
  const matched = list.find((item) => item && String(item.input ?? "") === file.path) ?? list[0] ?? null
  const candidates = []
  if (matched && matched.output) candidates.push(String(matched.output))
  if (result && typeof result.output === "string") candidates.push(result.output)
  const outputPath = await findOutput(candidates, result, job, file, startedAt, workDir)
  const meta = {}
  if (matched && typeof matched === "object") {
    for (const key of ["bbox", "method", "confidence", "bounds", "coverage", "error", "seconds"]) {
      if (matched[key] !== undefined) meta[key] = matched[key]
    }
  }
  for (const key of ["strokes", "planPath", "seconds", "summary"]) {
    if (result && result[key] !== undefined) meta[key] = result[key]
  }
  if (!outputPath) meta.error = meta.error || "没有找到输出文件"
  const ok = Boolean(outputPath) && matched?.ok !== false && result?.ok !== false
  return {
    name: file.name,
    ok,
    url: outputPath ? fileUrl(workDir, outputPath) : "",
    sourceUrl: file.url,
    output: outputPath,
    meta,
  }
}

async function findOutput(candidates, result, job, file, since, workDir) {
  for (const candidate of candidates) {
    if (!candidate) continue
    const abs = isAbsolute(candidate) ? candidate : resolve(workDir, candidate)
    if (!confine(workDir, abs)) continue
    if (await statFile(abs)) return abs
  }
  const dirs = []
  if (result && typeof result.dir === "string" && result.dir) {
    dirs.push(isAbsolute(result.dir) ? result.dir : resolve(workDir, result.dir))
  }
  if (job?.outDir) dirs.push(job.outDir)
  const base = basename(file.path, extname(file.path))
  for (const dir of dirs) {
    const found = await newestImage(dir, since, base)
    if (found) return found
  }
  return ""
}

async function newestImage(dir, since, baseName) {
  const hits = []
  const walk = async (current, depth) => {
    let entries = []
    try { entries = await readdir(current, { withFileTypes: true }) } catch { entries = [] }
    for (const entry of entries) {
      const abs = join(current, entry.name)
      if (entry.isDirectory()) {
        if (depth > 0) await walk(abs, depth - 1)
        continue
      }
      if (!entry.isFile()) continue
      if (!IMAGE_EXTS.has(extname(entry.name).toLowerCase())) continue
      const info = await statFile(abs)
      if (!info) continue
      if (since && info.mtimeMs + 2000 < since) continue
      hits.push({ abs, mtimeMs: info.mtimeMs, base: basename(entry.name, extname(entry.name)).startsWith(baseName) })
    }
  }
  await walk(dir, 2)
  if (!hits.length) return ""
  hits.sort((a, b) => Number(b.base) - Number(a.base) || b.mtimeMs - a.mtimeMs)
  return hits[0].abs
}

function pruneJobs(jobs) {
  if (jobs.size <= MAX_JOBS) return
  const list = Array.from(jobs.values()).sort((a, b) => a.createdAt - b.createdAt)
  while (list.length > MAX_JOBS) {
    const job = list.shift()
    if (job && job.state !== "running") jobs.delete(job.id)
  }
}

function jobView(job) {
  return {
    id: job.id,
    kind: job.kind,
    label: job.label,
    state: job.state,
    done: job.done,
    total: job.total,
    ok: job.okCount,
    failed: job.failCount,
    current: job.current,
    error: job.error,
    outDir: job.outDir,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    results: job.results,
    log: job.log.slice(-12),
  }
}

async function handleFile(req, res, workDir) {
  const params = parseUrl(req).searchParams
  const abs = confine(workDir, params.get("path") ?? "")
  if (!abs) return json(res, 403, { error: "路径超出工作区范围" })
  const info = await statFile(abs)
  if (!info) return json(res, 404, { error: "文件不存在" })
  const headers = {
    "content-type": mimeOf(abs),
    "content-length": info.size,
    "cache-control": "private, max-age=60",
  }
  if (params.get("download")) {
    headers["content-disposition"] = "attachment; filename*=UTF-8''" + encodeURIComponent(basename(abs))
  }
  res.writeHead(200, headers)
  const stream = createReadStream(abs)
  stream.on("error", () => {
    if (!res.writableEnded) res.end()
  })
  stream.pipe(res)
}

async function handleOpenDir(req, res, workDir) {
  if (!isPost(req)) return json(res, 405, { error: "POST only" })
  if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" })
  let body
  try { body = await readBody(req) } catch (error) { return json(res, 400, { error: messageOf(error) }) }
  const target = body && body.path ? body.path : join(workDir, "out")
  const abs = confine(workDir, String(target))
  if (!abs) return json(res, 403, { error: "路径超出工作区范围" })
  let info
  try { info = await stat(abs) } catch { info = null }
  if (!info || !info.isDirectory()) return json(res, 404, { error: "目录不存在" })
  const platform = process.platform
  const command = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open"
  await new Promise((resolvePromise) => {
    try {
      const child = spawn(command, [abs], { detached: true, stdio: "ignore", windowsHide: true })
      child.on("error", (error) => resolvePromise({ ok: false, error: messageOf(error) }))
      child.on("spawn", () => {
        child.unref()
        resolvePromise({ ok: true })
      })
    } catch (error) {
      resolvePromise({ ok: false, error: messageOf(error) })
    }
  })
  return json(res, 200, { ok: true, path: abs })
}

let statusProvider
async function loadStatusProvider() {
  if (statusProvider !== undefined) return statusProvider
  const candidates = ["./cli.js", "./paths.js", "./index.js", "./status.js"]
  for (const spec of candidates) {
    try {
      const mod = await import(spec)
      const fn = mod?.photoStatus ?? mod?.status ?? mod?.default?.photoStatus
      if (typeof fn === "function") {
        statusProvider = fn
        return fn
      }
    } catch { /* 该模块不存在或无法加载，继续下一个 */ }
  }
  // 没有整体 photoStatus 时，用 cliStatus + pythonStatus 组合出同样的形状。
  let cliFn = null
  let pythonFn = null
  try {
    const mod = await import("./cli.js")
    if (typeof mod?.cliStatus === "function") cliFn = mod.cliStatus
  } catch { /* 无 cli.js */ }
  try {
    const mod = await import("./python.js")
    if (typeof mod?.pythonStatus === "function") pythonFn = mod.pythonStatus
  } catch { /* 无 python.js */ }
  if (!cliFn && !pythonFn) {
    statusProvider = null
    return null
  }
  statusProvider = async () => {
    const [cli, python] = await Promise.all([
      cliFn
        ? cliFn({}).catch((error) => ({ ok: false, error: messageOf(error) }))
        : Promise.resolve({ ok: false, error: "缺少 cliStatus 导出" }),
      pythonFn
        ? pythonFn({}).catch((error) => ({ ok: false, error: messageOf(error) }))
        : Promise.resolve({ ok: false, error: "缺少 pythonStatus 导出" }),
    ])
    return { cli, python, source: "cliStatus+pythonStatus" }
  }
  return statusProvider
}

function fallbackStatus(workDir) {
  return {
    cli: { ok: false, error: "未找到 photoStatus 实现（lib/cli.js 未导出）" },
    python: { ok: false, error: "未知（缺少 photoStatus）" },
    dirs: { work: workDir, inbox: join(workDir, "inbox"), out: join(workDir, "out"), samples: join(workDir, "samples") },
    workbench: BASE + "/",
    degraded: true,
  }
}

async function handleStatus(res, workDir) {
  try {
    const fn = await loadStatusProvider()
    if (!fn) return json(res, 200, fallbackStatus(workDir))
    const status = await fn()
    const base = status && typeof status === "object" ? status : {}
    const dirs = base.dirs && typeof base.dirs === "object" ? base.dirs : {}
    return json(res, 200, {
      ...base,
      dirs: {
        work: workDir,
        inbox: join(workDir, "inbox"),
        out: join(workDir, "out"),
        samples: join(workDir, "samples"),
        ...dirs,
      },
      workbench: BASE + "/",
    })
  } catch (error) {
    return json(res, 200, {
      ...fallbackStatus(workDir),
      cli: { ok: false, error: messageOf(error) },
    })
  }
}

/* ------------------------------------------------------------------ 注册 */

export function registerWorkbench(webServer, options = {}) {
  const rootDir = options.root ? resolve(String(options.root)) : here
  const workDir = resolve(String(options.work ?? join(process.cwd(), "photocraft")))
  const jobs = new Map()
  const stops = []
  const register = (path, handler) => {
    if (!webServer || typeof webServer.register !== "function") return
    stops.push(webServer.register({ kind: "exact", path, handler }))
  }
  const base = BASE

  const page = (file) => async (req, res) => {
    const method = String(req.method ?? "GET").toUpperCase()
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" })
      res.end("GET only")
      return
    }
    await serveUi(res, join(UI_DIR, file), file.endsWith(".css") ? MIME[".css"] : file.endsWith(".js") ? MIME[".js"] : MIME[".html"], method)
  }

  register(base, async (_req, res) => {
    res.writeHead(302, { location: base + "/" })
    res.end()
  })
  register(base + "/", page("index.html"))
  register(base + "/app.js", page("app.js"))
  register(base + "/style.css", page("style.css"))
  register(base + "/favicon.ico", async (_req, res) => {
    res.writeHead(204)
    res.end()
  })

  register(base + "/api/status", async (_req, res) => {
    await handleStatus(res, workDir)
  })

  register(base + "/api/upload", async (req, res) => {
    try { await handleUpload(req, res, workDir) } catch (error) { json(res, 400, { error: messageOf(error) }) }
  })

  register(base + "/api/run", async (req, res) => {
    try { await handleRun(req, res, workDir, jobs) } catch (error) { json(res, 400, { error: messageOf(error) }) }
  })

  register(base + "/api/job", async (req, res) => {
    const id = parseUrl(req).searchParams.get("id") ?? ""
    if (!id) return json(res, 400, { error: "缺少 id" })
    const job = jobs.get(id)
    if (!job) return json(res, 404, { error: "任务不存在或已过期" })
    return json(res, 200, jobView(job))
  })

  register(base + "/api/job/cancel", async (req, res) => {
    if (!isPost(req)) return json(res, 405, { error: "POST only" })
    if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" })
    let body
    try { body = await readBody(req) } catch (error) { return json(res, 400, { error: messageOf(error) }) }
    const job = jobs.get(String(body?.id ?? ""))
    if (!job) return json(res, 404, { error: "任务不存在或已过期" })
    if (job.state !== "running") return json(res, 200, { ok: true, state: job.state })
    job.cancelRequested = true
    try { job.controller?.abort() } catch { /* 忽略 */ }
    return json(res, 200, { ok: true, state: "running" })
  })

  register(base + "/api/open-dir", async (req, res) => {
    try { await handleOpenDir(req, res, workDir) } catch (error) { json(res, 400, { error: messageOf(error) }) }
  })

  register(base + "/file", async (req, res) => {
    try { await handleFile(req, res, workDir) } catch (error) { json(res, 400, { error: messageOf(error) }) }
  })

  const dispose = () => {
    for (const stop of stops) {
      try { stop?.() } catch { /* 注销失败忽略 */ }
    }
    jobs.clear()
  }
  dispose.stops = stops
  dispose[Symbol.iterator] = () => stops[Symbol.iterator]()
  return dispose
}

export { KINDS }
