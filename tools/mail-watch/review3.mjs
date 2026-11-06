// review3.mjs — 以邮件为单位体检材料并落 ledger.json（一次性执行，跑完退出）
// 判据来源：两份通知原文（课间一刻钟 / 千问试用），见 rules.json 与 docs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = 'D:/dsh-workbench/mail/126';
const MAILBOX = path.join(ROOT, 'mailbox.json');
const LEDGER_RAW = path.join(ROOT, 'ledger-raw.jsonl');
const OUT = path.join(ROOT, 'ledger.json');
const RULES = JSON.parse(fs.readFileSync('D:/dsh-workbench/mail-watch/rules.json', 'utf8'));
const TMP = path.join(ROOT, '_tmp', 'rv');
const TAR = 'C:/WINDOWS/system32/tar.exe';

const SEARCH_DIRS = [
  'E:/桌面/办公文件/办公文档/2026年/10月/课件15分钟',
  'E:/桌面/办公文件/办公文档/2026年/10月/千问账号发送',
  'E:/桌面/办公文件/办公文档/2026年/10月/创想微造实践/材料/教师表',
  path.join(ROOT, '待确认'),
];

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const walk = (dir, base = dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push({ path: p, name: e.name, rel: path.relative(base, p), size: fs.statSync(p).size });
  }
  return out;
};
const localFiles = SEARCH_DIRS.flatMap((d) => walk(d));

const mailbox = JSON.parse(fs.readFileSync(MAILBOX, 'utf8'));
const raw = fs.existsSync(LEDGER_RAW)
  ? fs.readFileSync(LEDGER_RAW, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const rawByMid = Object.fromEntries(raw.map((r) => [r.mid, r]));

const xmlText = (xml) => String(xml)
  .replace(/<w:p[ >]/g, '\n<w:p ')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/[ \t]+/g, ' ');

function unzip(file, tag) {
  const dir = path.join(TMP, tag);
  fs.mkdirSync(dir, { recursive: true });
  try {
    execFileSync(TAR, ['-xf', file, '-C', dir], { stdio: 'ignore', timeout: 180000 });
    return dir;
  } catch { return null; }
}
function docxText(dir) {
  const p = path.join(dir, 'word', 'document.xml');
  if (!fs.existsSync(p)) return '';
  return xmlText(fs.readFileSync(p, 'utf8'));
}
function xlsxStrings(dir) {
  const out = [];
  const ss = path.join(dir, 'xl', 'sharedStrings.xml');
  if (fs.existsSync(ss)) for (const m of fs.readFileSync(ss, 'utf8').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out.push(m[1]);
  const sheets = path.join(dir, 'xl', 'worksheets');
  if (fs.existsSync(sheets)) for (const f of fs.readdirSync(sheets)) {
    if (!f.endsWith('.xml')) continue;
    const t = fs.readFileSync(path.join(sheets, f), 'utf8');
    for (const m of t.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out.push(m[1]);
  }
  return out.map((s) => String(s).replace(/&amp;/g, '&').trim()).filter(Boolean);
}

const SCHOOL_SUFFIX = /(小学|中学|学校|一中|二中|三中|附小|分校|苑|幼儿园|中心校)/;
function schoolOf(text) {
  const s = String(text || '');
  const m1 = /学校名称\s*[：:]\s*([^\s\n|]+)/.exec(s);
  if (m1) return m1[1].trim();
  const m2 = /([\u4e00-\u9fa5]{2,12}(?:小学|中学|学校|附小|分校|中心校|一中|二中|三中|四中|五中|九中|十三中))/ .exec(s);
  if (m2) return m2[1].trim();
  return '';
}

const cases = [];
const filesByPrefix = (from) => localFiles.filter((f) => f.name.startsWith(from + '__'));

for (const mail of mailbox) {
  let files = filesByPrefix(mail.from);
  // 同一发件人可能有多封邮件：优先用采集记录里该 mid 的真实附件路径
  const rawAtt = (rawByMid[mail.mid]?.attachments || []).map((a) => a.path).filter(Boolean);
  if (rawAtt.length) {
    const arr = [];
    for (const p of new Set(rawAtt)) {
      const f = localFiles.find((x) => path.resolve(x.path) === path.resolve(p));
      if (f) arr.push(f);
      else if (fs.existsSync(p)) arr.push({ path: p, name: path.basename(p), rel: path.basename(p), size: fs.statSync(p).size });
    }
    if (arr.length) files = arr;
  }
  // 同一发件人交了多份材料时（用户 2026-11-06 指出：同校另交不等于内容重复），
  // 按「邮件主题 vs 文件名」的四字串重合度挑最匹配的那一份，避免两封邮件共用同一附件。
  if (files.length > 1) {
    const grams = (s) => {
      const t = String(s || '').replace(/[－—\-\s_（）()·、，,。.·]/g, '');
      const out = new Set();
      for (let i = 0; i + 4 <= t.length; i += 1) out.add(t.slice(i, i + 4));
      return out;
    };
    const sg = grams(mail.subject);
    const scored = files
      .map((f) => {
        const fg = grams(f.name);
        let hit = 0;
        for (const g of sg) if (fg.has(g)) hit += 1;
        return { f, score: hit };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0].score > 0 && scored[0].score > (scored[1] ? scored[1].score : 0)) files = [scored[0].f];
  }
  const text = mail.subject + ' ' + files.map((f) => f.name).join(' ');
  const classify = (t) => {
    if (/小学教研室/.test(t)) return '千问试用人员信息表（区级下发）';
    if (/课间一刻钟|课例|课件|教学案例|应用案例/.test(t)) return '课间一刻钟AI应用案例';
    if (/教师信息表/.test(t) && !/试用人员/.test(t)) return '创想微造-教师信息表';
    if (/试用人员|教师信息表|信息表/.test(t)) return '千问试用人员信息表';
    return '其他';
  };
  let type = classify(mail.subject);
  if (type === '其他') type = classify(files.map((f) => f.name).join(' '));
  if (mail.from === '网易邮箱账号安全') type = '系统通知';
  if (files.length > 1) {
    const preferArchive = type === '课间一刻钟AI应用案例';
    const sel = files.filter((f) => (preferArchive ? /\.(rar|zip|7z)$/i.test(f.name) : /\.(xlsx|docx|doc|pdf)$/i.test(f.name)));
    if (sel.length) files = sel;
  }

  const row = {
    school: '', title: mail.subject, type, from: mail.from, time: mail.time, mid: mail.mid,
    files: files.map((f) => f.rel).join(' | '), fileCount: files.length,
    innerList: [], innerCount: 0, media: 0, checks: [], verdict: '', issues: [], notes: [],
  };

  // 逐个体检本地文件
  for (const [i, f] of files.entries()) {
    const tag = `${Date.now()}-${i}`;
    const ext = path.extname(f.name).toLowerCase();
    if (ext === '.rar' || ext === '.zip' || ext === '.7z') {
      const dir = unzip(f.path, tag);
      if (!dir) { row.issues.push(`无法解包：${f.name}`); continue; }
      const inner = walk(dir).map((x) => x.rel);
      row.innerList.push(...inner);
      row.innerCount = (row.innerCount || 0) + inner.length;
      row.media += inner.filter((n) => /\.(jpg|jpeg|png|gif|mp4|mov|avi|wmv)$/i.test(n)).length;
      for (const n of inner.filter((x) => /\.(docx|doc)$/i.test(x))) {
        const full = path.join(dir, n);
        const sub = /\.docx$/i.test(n) ? unzip(full, tag + '-' + i + '-' + row.innerCount) : null;
        if (sub) row.innerList.push(...[]), row.notes.push('');
        const txt = sub ? docxText(sub) : '';
        if (!txt) continue;
        const isCase = /案例/.test(path.basename(n)) || /案例/.test(txt.slice(0, 400));
        if (isCase)

          { const mods = ['背景', '实施举措', '实践成效', '特色创新', '案例展示'];
            row.caseDoc = path.basename(n);
            row.caseLen = txt.length;
            row.hasUnit = /申报单位|学校名称|单位名称/.test(txt);
            row.hasContact = /联系人|联系电话/.test(txt);
            row.modules = mods.map((m) => [m, txt.includes(m)]);
            row.caseText = txt; }
      }
      row.hasContactSheet = inner.some((n) => /联系人|附件1|报送/.test(n)) ;
    } else if (ext === '.xlsx') {
      const dir = unzip(f.path, tag);
      const strs = dir ? xlsxStrings(dir) : [];
      row.xlsxStrings = strs.join(' | ');
      row.school = row.school || schoolOf(strs.join(' '));
      const joined = strs.join(' ');
      row.hasUnit = /学校名称|单位名称/.test(joined);
      row.hasContact = /姓名/.test(joined) && /职务/.test(joined) && /(手机|电话)/.test(joined);
      row.teacherCount = Math.max(0, (joined.match(/;\d{1,3}/g) || []).length);
      row.xlsxSchool = /学校名称\s*[：:]\s*([^ |]+)/.exec(joined)?.[1] || '';
    } else if (ext === '.docx') {
      const dir = unzip(f.path, tag);
      const txt = dir ? docxText(dir) : '';
      row.docLen = txt.length;
      row.school = row.school || schoolOf(txt.slice(0, 500));
      if (!row.caseText && /案例|信息表/.test(txt.slice(0, 300))) {
        row.hasUnit = /申报单位|学校名称|单位名称/.test(txt);
        row.hasContact = /联系人|联系电话/.test(txt);
        row.caseText = txt;
      }
    } else if (ext === '.doc' || ext === '.pdf' || ext === '.jpg' || ext === '.png') {
      row.notes.push(`非表格格式：${f.name}`);
    }
  }

  const schoolFromName = (name) => {
    let s = String(name || '').replace(/^[^_]+__/, '').replace(/\.[a-z]+$/i, '');
    s = s.split(/[\s（(【\[－\-—,，:：]/)[0].replace(/^附件\s*\d*/, '').replace(/(教师信息表|试用人员信息表|信息表).*$/, '').trim();
    return /(小学|中学|学校|分校|附小|幼儿园|中心校|中小|一中|二中|三中|四中|五中|九中|十三中)/.test(s) ? s : '';
  };
  const bad = (s) => !s || /联系人|信息表|附件|试用人员|教师信息|序号|单位$/.test(s);
  const cands = [
    schoolFromName(files[0]?.name),
    row.xlsxSchool,
    schoolFromName(mail.subject),
  ];
  if (!row.school || bad(row.school)) row.school = cands.find((c) => c && !bad(c)) || '';

  cases.push(row);
}

// —— 判定 ——
for (const r of cases) {
  const has = r.fileCount > 0;
  if (r.type === '创想微造-教师信息表') {
    r.bucket = 'archived';
    r.verdict = '活动已截止（2026-10-27），不再收集';
    r.passes = '属创想微造活动材料，该活动已结束，不计入本轮收集范围（材料已归档）';
    continue;
  }
  if (r.type === '系统通知') { r.verdict = '不涉及'; continue; }
  if (!has) { r.verdict = '未收到材料'; r.issues.push('邮件里没有附件'); continue; }

  if (r.type === '课间一刻钟AI应用案例') {
    const ok = [];
    if (r.caseDoc) ok.push(`案例文档：${r.caseDoc}（${r.caseLen} 字）`);
    if (r.modules) ok.push('六大模块：' + r.modules.map(([m, v]) => (v ? '✓' : '✗') + m).join(' '));
    if (r.hasUnit) ok.push('有申报单位'); else r.issues.push('缺申报单位');
    if (r.hasContact) ok.push('有联系人/电话'); else r.issues.push('缺联系人/联系电话');
    if (r.media > 0) ok.push(`素材 ${r.media} 个`); else r.issues.push('缺案例展示素材');
    if (!r.caseDoc) r.issues.push('未找到案例正文文档（可能是学习单等辅助材料）');
    if (r.hasContactSheet) ok.push('含报送联系人信息表'); else r.issues.push('缺「学校报送联系人信息表」（附件1）');
    const modOk = r.modules ? r.modules.filter(([, v]) => v).length >= 5 : false;
    if (!r.caseDoc || !modOk) r.verdict = '不符合，需补正';
    else if (r.issues.length) r.verdict = '基本符合，需补正';
    else r.verdict = '可以给予通过';
    r.passes = ok.join('；');
  } else if (r.type.startsWith('千问')) {
    const ok = [];
    if (r.type === '千问试用人员信息表（区级下发）') { r.verdict = '区级下发材料，非学校回交'; r.notes.push('教研室下发的信息表原件'); continue; }
    if (r.hasUnit) ok.push('含学校/单位名称'); else r.issues.push('缺学校（单位）名称');
    if (r.hasContact) ok.push('含联系人姓名/职务/手机'); else r.issues.push('缺校级联系人信息');
    if (r.xlsxStrings) ok.push('含教师信息表（电子表格）');
    else if (r.notes.some((n) => /\.doc\b|\.doc）/i.test(n))) r.issues.push('附件是 .doc 老格式（或扫描件），通知要求 xlsx 电子表格');
    else r.issues.push('未提供 xlsx 电子表格（通知要求电子表格 + 盖章 pdf）');
    if (r.xlsxSchool && !/联系人|信息表|附件/.test(r.xlsxSchool)) r.school = r.xlsxSchool;
    ok.push('盖章 pdf 需人工确认');
    r.verdict = r.issues.length === 0 ? '可以给予通过（盖章页请人工确认）' : (r.xlsxStrings ? '基本符合，需补正' : '不符合，需补正');
    r.passes = ok.join('；');
  } else if (r.type === '创想微造-教师信息表') {
    r.bucket = 'archived';
    r.verdict = '活动已截止（2026-10-27），不再收集';
    r.passes = '属创想微造活动材料，该活动已结束，不计入本轮收集范围';
  } else {
    r.verdict = r.caseDoc ? '基本符合，需补正' : '待人工确认';
  }
}

const summary = {};
for (const r of cases) summary[r.verdict] = (summary[r.verdict] || 0) + 1;
const byType = {};
for (const r of cases) byType[r.type] = (byType[r.type] || 0) + 1;

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rows: cases, byType, verdicts: summary }, null, 2), 'utf8');
console.log(JSON.stringify({ rows: cases.length, byType, verdicts: summary }));
