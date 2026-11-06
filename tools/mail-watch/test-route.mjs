// 只验证分流函数，不碰浏览器/邮箱
import fs from 'node:fs';
const src = fs.readFileSync('D:/dsh-workbench/mail-watch/collect.mjs', 'utf8');
const start = src.indexOf('function route(');
const end = src.indexOf('function uniqueTarget(');
if (start < 0 || end < 0) throw new Error('cannot locate route()');
const routeSrc = src.slice(start, end).replace(/^\/\/.*$/gm, '');
const rules = JSON.parse(fs.readFileSync('D:/dsh-workbench/mail-watch/rules.json', 'utf8'));
const route = new Function('rules', routeSrc + '; return route;')(rules);

const cases = [
  ['分工协作', '顺义小店小学-贾砚舟-草木羽裳-课间一刻钟AI应用案例.zip'],
  ['北京市第四中学顺义分校－课间一刻钟AI应用案例（智慧操场）', '课间一刻钟AI应用案例.rar'],
  ['课间一刻钟AI应用案例征集（补充联系人）', '附件1：学校报送联系人信息表.xlsx'],
  ['附件3：试用人员信息表（李丹）', '李丹-试用人员信息表.xlsx'],
  ['试用人员信息表', '孟颖-府学胡同小学顺义分校-试用人员信息表.xlsx'],
  ['赵全营中小——人工智能创想微造工作室申报表', '赵全营中小——人工智能创想微造工作室申报表.pdf'],
  ['杨镇一中教师信息表 增加人员', '杨镇一中教师信息表 增加人员.xlsx'],
  ['后沙峪第二小学课间一刻钟材料', null],
  ['随便一封邮件', '说明.docx'],
];
for (const [s, f] of cases) {
  const r = route(s, f);
  console.log(`${(r.bucket + '').padEnd(8)} ${(r.basis || '').padEnd(10)} kw=${String(r.keyword).padEnd(14)} <= [${s}] [${f}]`);
}
