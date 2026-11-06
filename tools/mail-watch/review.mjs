// review.mjs — 汇总已收材料：解包 → 读 docx/xlsx/pptx 文本 → 按通知要求体检 → 生成 ledger.json
// 只用 Node 内置模块 + 系统 bsdtar（读 rar/zip），不依赖第三方包。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OUT_ROOT = 'D:/dsh-workbench/mail/126';
const TMP = path.join(OUT_ROOT, '_review');
const QIANWEN_DIR = 'E:/桌面/办公文件/办公文档/2026年/10月/千问账号发送';
const KEJIAN_DIR = 'E:/桌面/办公文件/办公文档/2026年/10月/课件15分钟';
const CONFIRM_DIR = path.join(OUT_ROOT, '待确认');

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const MEDIA = /\.(mp4|mov|avi|mkv|flv|wmv|jpg|jpeg|png|gif|bmp|webp|heic|mp3|wav|m4a)$/i;
const DOC = /\.(docx|doc|xlsx|xls|pptx|ppt|pdf|txt|md)$/i;

function bsdtarList(archive) {
  const r = spawnSync('tar', ['-tf', archive], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return r.stdout.toString('utf8').split(/\r?\n/).filter(Boolean);
}

function extract(archive, destName) {
  const dest = path.join(TMP, destName);
  fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync('tar', ['-xf', archive, '-C', dest], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? dest : null;
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push({ path: p, rel: path.relative(base, p), size: fs.statSync(p).size });
  }
  return out;
}

const stripXml = (xml) => xml
  .replace(/<w:p[ >]/g, '\n<w:p ')
  .replace(/<\/(w:p|w:tr|a:p)>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/[ \t\u00a0]+/g, ' ')
  .replace(/\n{2,}/g, '\n')
  .trim();

function readOoxml(file) {
  const cand = extract(file, path.basename(file) + '-' + Math.random().toString(36).slice(2, 8));
  if (!cand) return { text: '', ok: false };
  const texts = [];
  const collect = (sub, re) => {
    const dir = path.join(cand, sub);
    if (!fs.existsSync(dir)) return;
    for (const f of walk(dir).filter((x) => re.test(x.path))) {
      texts.push(fs.readFileSync(f.path, 'utf8'));
    }
  };
  if (/\.docx$/i.test(file)) collect('word', /document\.xml$/);
  else if (/\.xlsx$/i.test(file)) collect('xl', /(sharedStrings|worksheets\/sheet\d+)\.xml$/);
  else if (/\.pptx$/i.test(file)) collect('ppt', /slides\/slide\d+\.xml$/);
  return { text: stripXml(texts.join('\n')), ok: true, dir: cand };
}

function readLegacy(file) {
  const buf = fs.readFileSync(file);
  const utf16 = buf.toString('utf16le').replace(/[^\u4e00-\u9fa5A-Za-z0-9，。、：；（）()@.\-/\s]/g, ' ');
  const ascii = buf.toString('latin1').replace(/[^\x20-\x7e\u4e00-\u9fa5]/g, ' ');
  return { text: (utf16 + ascii).replace(/\s{2,}/g, ' ').slice(0, 20000), ok: true };
}

function textOf(file) {
  if (/\.(docx|xlsx|pptx)$/i.test(file)) return readOoxml(file);
  if (/\.(doc|xls|ppt)$/i.test(file)) return readLegacy(file);
  if (/\.pdf$/i.test(file)) {
    const buf = fs.readFileSync(file);
    return { text: buf.toString('latin1').replace(/[^\x20-\x7e]/g, ' ').slice(0, 20000), ok: true };
  }
  return { text: '', ok: false };
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const has = (text, kw) => text.includes(kw);
const phones = (text) => (text.match(/1[3-9]\d{9}/g) || []).length;

function schoolFromName(name) {
  let n = norm(name).replace(/^[^_]*__/, '');
  n = n.replace(/^附件\s*\d*[：:]\s*/, '').replace(/^关于/, '');
  n = n.split(/[－\-—_]/)[0];
  return norm(n) || norm(name).slice(0, 20);
}

// ---------- 千问：试用人员信息表 ----------
function reviewQianwen(item) {
  const t = item.text;
  const issues = [];
  const okNames = [];
  if (/信息表/.test(item.name)) okNames.push('文件名含信息表'); else issues.push('文件名未含「信息表」');
  if (has(t, '单位名称') || has(t, '单位')) okNames.push('有单位名称字段'); else issues.push('缺单位名称');
  if (has(t, '管理员')) okNames.push('有管理员信息区'); else issues.push('缺区级管理员信息');
  if (has(t, '教师')) okNames.push('有教师信息区'); else issues.push('缺教师信息');
  const p = phones(t);
  if (p > 0) okNames.push(`电话号码 ${p} 个`); else issues.push('无有效手机号');
  const needPdf = !/\.pdf$/i.test(item.name);
  if (needPdf) issues.push('缺盖章 PDF（通知要求盖章版 PDF + 电子表格）');
  return { type: '千问试用人员信息表', issues, passes: okNames, phones: p, verdict: issues.filter((i) => !i.startsWith('缺盖章')).length === 0 ? '基本合格' : '需补正' };
}

// ---------- 课间一刻钟：案例材料 ----------
const KEJIAN_REQ = [
  { key: '一、背景', needle: ['背景', '问题'], label: '一、背景、问题与整体设计思路' },
  { key: '二、实施举措', needle: ['实施举措'], label: '二、实施举措' },
  { key: '三、实践成效', needle: ['实践成效'], label: '三、实践成效' },
  { key: '四、特色创新', needle: ['特色创新'], label: '四、特色创新' },
  { key: '六、展示素材', needle: ['展示素材', '素材'], label: '六、案例展示素材' },
  { key: '五、优化计划', needle: ['优化计划'], label: '五、优化计划（选填）', optional: true },
];

function reviewKejian(item) {
  const t = item.text;
  const issues = [];
  const passes = [];
  for (const r of KEJIAN_REQ) {
    const hit = r.needle.some((n) => has(t, n));
    if (hit) passes.push(r.label);
    else if (!r.optional) issues.push(`缺「${r.label}」`);
  }
  for (const [label, kws] of [['案例名称', ['案例名称']], ['申报单位', ['申报单位']], ['联系人', ['联系人']], ['联系电话', ['联系电话']], ['覆盖范围', ['覆盖范围']]]) {
    if (has(t, kws[0])) passes.push(label); else issues.push(`缺「${label}」`);
  }
  if (item.mediaCount > 0) passes.push(`素材 ${item.mediaCount} 个`); else issues.push('缺展示图片/视频素材');
  const named = /课间一刻钟AI应用案例/.test(item.name);
  if (named) passes.push('压缩包命名符合'); else issues.push('压缩包命名未含「学校名称－课间一刻钟AI应用案例」');
  return { type: '课间一刻钟案例', issues, passes, verdict: issues.length === 0 ? '基本合格' : (issues.length <= 2 ? '需补正' : '不合格') };
}

// ---------- 主流程 ----------
const items = [];

function addFile(dir, bucket, f) {
  const item = { bucket, dir, name: f.rel || path.basename(f.path), path: f.path, size: f.size, school: schoolFromName(f.rel || f.name), mediaCount: 0, archives: [], text: '', type: '' };
  if (/\.(rar|zip|7z)$/i.test(f.path)) {
    const inner = extract(f.path, 'arc-' + items.length) || '';
    const list = inner ? walk(inner).map((x) => ({ rel: x.rel, size: x.size })) : [];
    item.archives = list;
    item.mediaCount = list.filter((x) => MEDIA.test(x.rel)).length;
    const docs = list.filter((x) => DOC.test(x.rel) && !MEDIA.test(x.rel));
    let text = '';
    for (const d of docs.slice(0, 6)) {
      const r = textOf(path.join(inner, d.rel));
      if (r.ok) text += '\n' + r.text;
    }
    item.text = text;
    // 从压缩包内容推断学校
    const first = list[0] ? list[0].rel.split('/')[0] : '';
    if (first) item.school = norm(first.split(/[－\-—]/)[0]) || item.school;
  } else if (DOC.test(f.path)) {
    const r = textOf(f.path);
    item.text = r.ok ? r.text : '';
  }
  const fn = bucket === 'qianwen' ? reviewQianwen : reviewKejian;
  item.review = bucket === 'confirm' ? { type: '待确认', issues: ['未归类，需人工确认落位'], passes: [], verdict: '待确认' } : fn(item);
  items.push(item);
}

for (const [dir, bucket] of [[QIANWEN_DIR, 'qianwen'], [KEJIAN_DIR, 'kejian'], [CONFIRM_DIR, 'confirm']]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) addFile(dir, bucket, { path: f.path, rel: f.rel, size: f.size });
}

// ---------- 邮件信息（提交时间/发件人）----------
let mailbox = [];
try { mailbox = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, 'mailbox.json'), 'utf8')); } catch {}
function mailFor(school) {
  const s = norm(school);
  if (!s) return null;
  const hit = mailbox.find((m) => norm(m.subject).includes(s) || norm(m.from).includes(s) || norm(m.raw || '').includes(s));
  return hit || null;
}

const rows = items.map((it) => {
  const mail = mailFor(it.school);
  return {
    school: it.school,
    bucket: it.bucket,
    title: mail ? mail.subject : (it.archives.length ? it.name.replace(/^[^_]*__/, '').replace(/\.(rar|zip)$/i, '') : it.name.replace(/^[^_]*__/, '')),
    files: it.archives.length
      ? it.archives.map((a) => a.rel).join(' | ')
      : `${it.name}（${(it.size / 1024).toFixed(0)}KB）`,
    fileCount: it.archives.length || 1,
    mediaCount: it.mediaCount,
    from: mail ? mail.from : '',
    time: mail ? mail.time : '',
    verdict: it.review.verdict,
    type: it.review.type,
    issues: it.review.issues.join('；'),
    passes: it.review.passes.join('；'),
  };
});

fs.writeFileSync(path.join(OUT_ROOT, 'ledger.json'), JSON.stringify(rows, null, 2), 'utf8');
console.log(JSON.stringify({ items: items.length, rows: rows.length, sample: rows.slice(0, 2) }, null, 2));
