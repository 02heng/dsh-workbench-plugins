import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const files = [
  'E:/桌面/办公文件/办公文档/2026年/10月/课件15分钟/sallysmart__北京市第四中学顺义分校－课间一刻钟AI应用案例（智慧操场）-课间一刻钟AI应用案例.rar',
  'E:/桌面/办公文件/办公文档/2026年/10月/课件15分钟/贾砚舟__顺义小店小学-贾砚舟-草木羽裳-课间一刻钟AI应用案例.zip',
];
const TMP = 'D:/dsh-workbench/mail/126/_dbg';
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const walk = (dir, base = dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out;
};

for (const [i, f] of files.entries()) {
  const dest = path.join(TMP, 'a' + i);
  fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync('tar', ['-xf', f, '-C', dest], { encoding: 'utf8' });
  console.log('=== ' + path.basename(f) + ' tarStatus=' + r.status + (r.stderr ? ' err=' + r.stderr.slice(0, 120) : ''));
  const list = walk(dest);
  console.log('inner count=' + list.length);
  for (const x of list.slice(0, 40)) console.log('   ' + x);
  const docx = list.find((x) => /\.docx$/i.test(x) && !/~\$/.test(x));
  if (docx) {
    const d2 = path.join(TMP, 'd' + i);
    fs.mkdirSync(d2, { recursive: true });
    spawnSync('tar', ['-xf', path.join(dest, docx), '-C', d2], { encoding: 'utf8' });
    const xml = fs.readFileSync(path.join(d2, 'word', 'document.xml'), 'utf8');
    const text = xml.replace(/<w:p[ >]/g, '\n').replace(/<[^>]+>/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    console.log('docx=' + docx + ' textLen=' + text.length);
    console.log('--- text head ---');
    console.log(text.slice(0, 1200));
    for (const kw of ['案例名称', '申报单位', '联系人', '联系电话', '覆盖范围', '背景', '实施举措', '实践成效', '特色创新', '优化计划', '展示素材']) {
      console.log('  kw ' + kw + ' = ' + text.includes(kw));
    }
  }
}
