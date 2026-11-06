// review2.mjs — 以「邮件」为单位汇总：找到本地落盘文件 → 解包读 docx/xlsx 文本 → 按通知要求体检
// 输出 D:/dsh-workbench/mail/126/ledger.json
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OUT = 'D:/dsh-workbench/mail/126';
const TMP = path.join(OUT, '_review2');
const SEARCH_DIRS = [
  'E:/桌面/办公文件/办公文档/2026年/10月/课件15分钟',
  'E:/桌面/办公文件/办公文档/2026年/10月/千问账号发送',
  path.join(OUT, '待确认'),
];
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const MEDIA = /\.(mp4|mov|avi|mkv|flv|wmv|jpg|jpeg|png|gif|bmp|webp|heic)$/i;
const DOCX = /\.(docx|doc|pptx|ppt|xlsx|xls|pdf)$/i;

const walk = (dir, base = dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push({ path: p, rel: path.relative(base, p), size: fs.statSync(p).size, mtime: fs.statSync(p).mtimeMs });
  }
  return out;
};

const extract = (archive, tag) => {
  const dest = path.join(TMP, tag);
  fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync('tar', ['-xf', archive, '-C', dest], { encoding: 'utf8' });
  return r.status === 0 ? dest : null;
};

const stripXml = (xml) => xml
  .replace(/<w:p[ >]/g, '\n').replace(/<\/(w:p|w:tr|a:p)>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/[ \t\u00a0]+/g, ' ').replace(/\n{2,}/g, '\n').trim();

function textOfFile(file) {
  if (/\.(docx|xlsx|pptx)$/i.test(file)) {
    const dest = extract(file, 'ooxml-' + Math.random().toString(36).slice(2, 8));
    if (!dest) return '';
    const parts = [];
    const pick = (sub, re) => {
      const d = path.join(dest, sub);
      if (!fs.existsSync(d)) return;
      for (const f of walk(d).filter((x) => re.test(x.path))) parts.push(fs.readFileSync(f.path, 'utf8'));
    };
    if (/\.docx$/i.test(file)) pick('word', /document\.xml$/);
    else if (/\.xlsx$/i.test(file)) pick('xl', /(sharedStrings|worksheets\/sheet\d+)\.xml$/);
    else pick('ppt', /slides\/slide\d+\.xml$/);
    return stripXml(parts.join('\n'));
  }
  if (/\.(doc|xls|ppt)$/i.test(file)) {
    const buf = fs.readFileSync(file);
    const u = buf.toString('utf16le').replace(/[^\u4e00-\u9fa5A-Za-z0-9，。、：；（）()@.\-/\s]/g, ' ');
    return u.replace(/\s{2,}/g, ' ').slice(0, 20000);
  }
  return '';
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const SCHOOL_SUFFIX = /(小学|中学|学校|中校|一小|二小|三小|分校|中学分校|中小|实验学校|附属小学|附属|小学部|一中|二中|三中|四中|五中|六中|七中|八中|九中|十中|十一中|十二中|十三中)/;

function schoolOf(subject) {
  const s = norm(subject).replace(/^附件\s*\d*[：:]\s*/, '');
  const head = s.split(/[－\-—]/)[0];
  return norm(head);
}

// ---------- 体检规则 ----------
const KEJIAN_BLOCKS = [
  ['一、背景、问题与整体设计思路', ['背景']],
  ['二、实施举措', ['实施举措']],
  ['三、实践成效', ['实践成效']],
  ['四、特色创新', ['特色创新']],
  ['五、优化计划（选填）', ['优化计划'], true],
  ['六、案例展示素材', ['展示素材']],
];
const KEJIAN_FIELDS = ['申报单位', '联系人', '联系电话', '覆盖范围', '应用场景', '案例关键词', '案例亮点'];

function checkKejian(text, innerFiles, fileName) {
  const t = norm(text) + '\n' + norm(text.replace(/\n/g, ''));
  const missing = [];
  const ok = [];
  for (const [label, kws, optional] of KEJIAN_BLOCKS) {
    if (kws.some((k) => t.includes(k))) ok.push(label);
    else if (!optional) missing.push(`缺「${label}」`);
  }
  for (const f of KEJIAN_FIELDS) {
    if (t.includes(f)) ok.push(f); else missing.push(`缺「${f}」`);
  }
  const hasContactTable = innerFiles.some((x) => /联系人|信息表/.test(x));
  if (hasContactTable) ok.push('含联系人信息表'); else missing.push('未含「学校报送联系人信息表」（附件1）');
  const media = innerFiles.filter((x) => MEDIA.test(x)).length;
  if (media > 0) ok.push(`素材 ${media} 个`); else missing.push('未含图片/视频素材');
  const zipNamed = /课间一刻钟AI应用案例/.test(fileName);
  if (zipNamed) ok.push('压缩包命名含规范关键词'); else missing.push('压缩包命名不含「学校名称－课间一刻钟AI应用案例」');
  return { ok, missing, media };
}

function checkQianwen(text, innerFiles) {
  const t = norm(text).replace(/\n/g, ' ');
  const missing = [];
  const ok = [];
  if (t.includes('单位名称') || t.includes('单位')) ok.push('单位名称'); else missing.push('缺单位名称');
  if (t.includes('管理员')) ok.push('区级管理员区'); else missing.push('缺区级管理员信息');
  if (t.includes('教师')) ok.push('教师信息区'); else missing.push('缺教师信息');
  const ph = (t.match(/1[3-9]\d{9}/g) || []).length;
  if (ph) ok.push(`手机号 ${ph} 个`); else missing.push('无手机号');
  if (innerFiles.some((x) => /\.pdf$/i.test(x))) ok.push('含盖章 PDF'); else missing.push('缺盖章 PDF（通知要求盖章版 PDF + 电子表格）');
  return { ok, missing, phones: ph };
}

// ---------- 主流程 ----------
const mailbox = JSON.parse(fs.readFileSync(path.join(OUT, 'mailbox.json'), 'utf8'));
const localFiles = SEARCH_DIRS.flatMap((d) => walk(d));

const rows = [];
for (const mail of mailbox) {
  const subject = norm(mail.subject);
  const school = schoolOf(subject);
  const isKejian = /课间一刻钟|案例/.test(subject);
  const isQianwen = /信息表|试用人员/.test(subject);
  const type = isKejian ? '课间一刻钟AI应用案例' : isQianwen ? '千问试用人员信息表' : '其他';
  const token = school.replace(/^北京市/, '').replace(/[（）()]/g, '');
  const hit = localFiles.filter((f) => {
    const n = norm(f.rel);
    return (token && n.includes(token.slice(0, 6))) || (mail.from && n.startsWith(mail.from + '__'));
  });

  let innerFiles = [];
  let text = '';
  let attached = [];
  for (const [i, f] of hit.entries()) {
    attached.push({ rel: f.rel, size: f.size, path: f.path, mtime: f.mtime });
    if (/\.(rar|zip|7z)$/i.test(f.path)) {
      const dest = extract(f.path, `arc-${rows.length}-${i}`);
      const list = dest ? walk(dest) : [];
      innerFiles.push(...list.map((x) => x.rel));
      // 案例材料优先：先把名字像案例材料的 docx 放前面
      const docs = list.filter((x) => DOCX.test(x.rel)).sort((a, b) => {
        const score = (x) => (/案例/.test(x.rel) ? 2 : 0) + (/学习单|模板/.test(x.rel) ? -1 : 0);
        return score(b) - score(a);
      });
      for (const d of docs) text += '\n' + textOfFile(d.path);
    } else {
      innerFiles.push(path.basename(f.rel));
      text += '\n' + textOfFile(f.path);
    }
  }

  let check = { ok: [], missing: [], media: 0 };
  if (!hit.length) check.missing.push('本地未找到对应文件（可能尚未下载/已被移动）');
  else if (type === '课间一刻钟AI应用案例') check = checkKejian(text, innerFiles, hit.map((f) => f.rel).join(' '));
  else if (type === '千问试用人员信息表') check = checkQianwen(text, innerFiles);
  else check.ok.push('无需体检');

  rows.push({
    school: school || mail.from,
    title: subject,
    type,
    from: mail.from,
    time: mail.time,
    files: attached.map((a) => a.rel).join(' | ') || '（无）',
    fileCount: attached.length,
    innerCount: innerFiles.length,
    innerList: innerFiles.join(' | '),
    media: check.media || 0,
    verdict: hit.length ? (check.missing.length === 0 ? '可以给予通过' : check.missing.filter((m) => !m.includes('选填')).length <= 2 ? '基本符合，需补正' : '不符合，需补正') : '未收到材料',
    issues: check.missing.join('；'),
    passes: check.ok.join('；'),
    textLen: text.length,
    mid: mail.mid,
  });
}

// 本地有、但邮件里对不上的（例如 牛栏山一中 附件3）
const matched = new Set(rows.flatMap((r) => r.files.split(' | ')));
const extra = localFiles
  .filter((f) => /信息表/.test(f.rel) && !/通知|附件1|附件2/.test(f.rel))
  .filter((f) => !matched.has(f.rel))
  .filter((f) => !/创想微造实践/.test(f.path))
  .map((f) => ({ rel: f.rel, path: f.path }));

fs.writeFileSync(path.join(OUT, 'ledger.json'), JSON.stringify({ rows, extra, generatedAt: new Date().toISOString() }, null, 2), 'utf8');
console.log(JSON.stringify({
  rows: rows.length,
  byType: rows.reduce((a, r) => ((a[r.type] = (a[r.type] || 0) + 1), a), {}),
  verdicts: rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {}),
  extras: extra.length,
  sample: rows.slice(0, 3),
}, null, 2));
