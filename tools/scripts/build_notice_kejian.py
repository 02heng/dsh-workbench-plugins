# -*- coding: utf-8 -*-
import docx
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# 落盘位置（2026-11-06 更正）：通知属于「通知与附件」，一律进 02_通知与启事 子目录；
# 事项目录最外层只放一张汇总检查表。运行前先确认该目录现有文件是否用户改过，不得盲跑覆盖。
OUT = r"E:\桌面\办公文件\办公文档\2026年\10月\课件15分钟\02_通知与启事\关于开展顺义区“课间一刻钟”AI应用案例征集活动的通知.docx"

doc = Document()

# ---------- page setup ----------
sec = doc.sections[0]
sec.page_width = Cm(21.0)
sec.page_height = Cm(29.7)
sec.top_margin = Cm(3.7)
sec.bottom_margin = Cm(3.5)
sec.left_margin = Cm(2.8)
sec.right_margin = Cm(2.6)

# ---------- default style ----------
st = doc.styles['Normal']
st.font.name = '仿宋_GB2312'
st.font.size = Pt(16)
st._element.rPr.rFonts.set(qn('w:eastAsia'), '仿宋_GB2312')
st._element.rPr.rFonts.set(qn('w:ascii'), 'Times New Roman')
st._element.rPr.rFonts.set(qn('w:hAnsi'), 'Times New Roman')


def set_run(r, font='仿宋_GB2312', size=16, bold=False):
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.name = 'Times New Roman'
    r._element.rPr.rFonts.set(qn('w:eastAsia'), font)
    return r


def para(text='', font='仿宋_GB2312', size=16, bold=False, align=None,
         first_indent=2, space_before=0, space_after=0, line=28, exact=True):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    if align is not None:
        p.alignment = align
    if first_indent:
        pf.first_line_indent = Pt(size * first_indent)
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    if exact:
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(line)
    else:
        pf.line_spacing = line
    if text:
        set_run(p.add_run(text), font, size, bold)
    return p


def set_cell(cell, text, font='仿宋_GB2312', size=10.5, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT):
    cell.text = ''
    p = cell.paragraphs[0]
    p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(1)
    pf.space_after = Pt(1)
    pf.line_spacing = 1.0
    set_run(p.add_run(text), font, size, bold)
    tcPr = cell._tc.get_or_add_tcPr()
    va = OxmlElement('w:vAlign')
    va.set(qn('w:val'), 'center')
    tcPr.append(va)


# ================= 正文 =================
para('关于开展顺义区“课间一刻钟”AI应用案例',
     font='方正小标宋简体', size=22, align=WD_ALIGN_PARAGRAPH.CENTER,
     first_indent=0, space_before=0, space_after=0, line=34)
para('征集活动的通知',
     font='方正小标宋简体', size=22, align=WD_ALIGN_PARAGRAPH.CENTER,
     first_indent=0, space_before=0, space_after=12, line=34)

para('各中小学：', first_indent=0)

para('为深入贯彻落实“健康第一”教育理念，落实《顺义区中小学人工智能素养提升三年行动计划（2026—2028年）》有关安排，推动人工智能技术与校园活动、管理深度融合，探索育人新模式，根据北京市数字教育中心（北京电化教育馆）《关于开展“课间一刻钟”AI应用案例征集活动的通知》安排，经研究，决定面向全区中小学校开展“课间一刻钟”AI应用案例征集活动。现将有关事项通知如下：')

para('一、征集范围', font='黑体', bold=False, space_before=6)
para('本次活动面向全区义务教育阶段学校开展，高中阶段学校可结合实际自主参与。')

para('二、征集内容', font='黑体', space_before=6)
para('1.AI赋能课间活动：开展丰富的课间活动，拓展健康第一的育人新域。')
para('2.AI赋能学生关怀：提供情绪调节、友善帮扶的助手。')
para('3.AI赋能课间管理：实现安全监测、危险预警、人员密集管控、活动组织与资源调配优化，驱动课间管理的变革。')
para('4.其他创新应用：其他具有创新和推广价值的案例。')

para('三、案例要求', font='黑体', space_before=6)
para('1.真实性：案例须为真实落地实践，不得虚构。')
para('2.完整性：呈现从问题诊断到成效产出的实践闭环。')

para('四、材料报送', font='黑体', space_before=6)
para('各校填写学校报送联系人信息表（附件1），组织教师参照案例模板（附件2）填报案例材料，以学校为单位于2026年11月10日（星期二）17:00前将案例材料与展示图片、视频素材一并报送至邮箱zhjyfzcjzx3@126.com。')
para('单件材料文件名命名为“学校名称－案例名称－材料名称”，如“××小学－AI智能律动赋能课间一刻钟案例－案例材料”；图片、视频素材文件命名为“学校名称－案例名称－素材内容”，如“××小学－AI智能律动赋能课间一刻钟案例－课间活动实况”；学校报送材料压缩包命名为“学校名称－课间一刻钟AI应用案例”，如“××小学－课间一刻钟AI应用案例”，邮件主题与压缩包名称一致。')
para('不需要盖章的材料只报送word文档；需要加盖学校公章的，word文档和pdf文件一并报送，不得以照片或扫描图片代替pdf文件，两类文件同名，扩展名分别为.docx和.pdf。')

para('五、其他', font='黑体', space_before=6)
para('1.各校指定专人负责本校案例征集的动员和组织工作，支持教师结合课间实际积极参与。')
para('2.我中心将组织专家对报送案例进行评审，择优遴选，颁发证书，并择优报送市级参评。')

para('', first_indent=0)
para('附件：1.学校报送联系人信息表', first_indent=0)
para('      2.顺义区中小学“课间一刻钟”AI应用案例模板', first_indent=0)

para('', first_indent=0)
para('', first_indent=0)
para('顺义区智慧教育发展促进中心', first_indent=0, align=WD_ALIGN_PARAGRAPH.RIGHT)
para('2026年10月23日', first_indent=0, align=WD_ALIGN_PARAGRAPH.RIGHT)
para('（联系人：李妍、杨衡，联系电话：81487550）', first_indent=0, align=WD_ALIGN_PARAGRAPH.RIGHT)

# ================= 附件1 =================
doc.add_page_break()
para('附件1', first_indent=0, size=16)
para('学校报送联系人信息表', font='方正小标宋简体', size=22,
     align=WD_ALIGN_PARAGRAPH.CENTER, first_indent=0, space_before=6, space_after=10, line=34)

t1 = doc.add_table(rows=4, cols=4)
t1.style = 'Table Grid'
t1.alignment = WD_TABLE_ALIGNMENT.CENTER
heads = ['学校名称', '姓名', '职务', '联系电话']
for i, h in enumerate(heads):
    set_cell(t1.rows[0].cells[i], h, size=12, align=WD_ALIGN_PARAGRAPH.CENTER)
for r in range(1, 4):
    for c in range(4):
        set_cell(t1.rows[r].cells[c], '', size=12)
for row in t1.rows:
    row.height = Cm(1.1)
widths = [Cm(5.0), Cm(3.6), Cm(3.6), Cm(4.2)]
for row in t1.rows:
    for i, w in enumerate(widths):
        row.cells[i].width = w

para('', first_indent=0, size=12)
para('注：请各校于2026年11月10日17:00前随案例材料一并报送本表。', size=12, first_indent=0)

# ================= 附件2 =================
doc.add_page_break()
para('附件2', first_indent=0, size=16)
para('顺义区中小学“课间一刻钟”AI应用案例模板',
     font='方正小标宋简体', size=22, align=WD_ALIGN_PARAGRAPH.CENTER,
     first_indent=0, space_before=6, space_after=10, line=34)

rows2 = [
    ('案例名称', '（示例：××小学AI智能律动赋能课间一刻钟案例）'),
    ('案例申报人', '如：项目牵头人、实际管理人、主要实施人员等'),
    ('申报单位', '按学校公章名称规范填写'),
    ('所属区', '顺义区'),
    ('联系人', ''),
    ('联系电话', ''),
    ('覆盖范围', '如包含年级、班级、学生人数及值守教师数。如：小学3—6年级所有班级共800人，需要值守的教师为体育教师、班主任共10人'),
    ('应用场景', '□AI互动健体/运动    □AI趣味益智/美育活动    □学生情绪疏导与心理陪伴\n'
                 '□AI智能安全监管    □课间管理数字化    □个性化活动适配\n'
                 '□大数据决策优化    □其他（请说明）____________'),
    ('案例关键词', '3—5个关键词标签，如：“AI律动”“智慧操场”“课间安全”'),
    ('案例亮点', '用一句话概括案例最打动人心的亮点，用于平台推荐展示，不超过30字'),
]
t2 = doc.add_table(rows=len(rows2), cols=2)
t2.style = 'Table Grid'
t2.alignment = WD_TABLE_ALIGNMENT.CENTER
for i, (k, v) in enumerate(rows2):
    set_cell(t2.rows[i].cells[0], k, size=10.5, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell(t2.rows[i].cells[1], v, size=10.5)
    t2.rows[i].cells[0].width = Cm(3.6)
    t2.rows[i].cells[1].width = Cm(12.4)

para('', first_indent=0, size=10.5)

def body_block(title, tip):
    para(title, font='黑体', size=14, space_before=8)
    if tip:
        para(tip, size=14, line=24)

body_block('一、背景、问题与整体设计思路（必填）',
           '（结合本校实际，阐述本校课间活动的背景情况及存在的核心问题。问题应包含具体数据或现象描述。整体设计思路需要聚焦课间场景的需求，阐明如何用AI精准破解上述痛点的问题解决逻辑和AI核心赋能点，建议画出设计思路图。）')
body_block('二、实施举措（必填）', None)
para('（一）组织实施', size=14, line=24)
para('（项目启动前，从机制、队伍、资源、数据四方面落实基础保障：建立专项工作组，编制实施方案；组建核心团队，落实智能硬件、软件平台部署及场地改造；采集数据，制定安全预案。项目实施明确各阶段时间节点、核心任务与阶段性成果；设置动态监控机制，突出阶段衔接与关键决策。）', size=14, line=24)
para('（二）落地应用', size=14, line=24)
para('（重点阐述AI在课间的具体应用场景与操作流程。落地应用部分应还原真实实施场景，突出“谁在什么时间、什么地点、做了什么、AI如何发挥作用”。）', size=14, line=24)

rows3 = [
    ('项目', '内容'),
    ('适配学段/人数', '例如：全体学生、小学中高年级、初中'),
    ('解决的实际问题', '对应“一、背景、问题与整体设计思路”中的某一项或几项具体问题，说明该活动如何精准破解'),
    ('AI核心赋能点', '重点阐述：1.AI核心技术（如人体动作识别、语音交互、情绪识别等）；2.AI应用场景（详细描述AI赋能的核心活动场景与运作机制）'),
    ('完整实施步骤', '以场景参与者的视角，按时间顺序描述活动从发起到结束的完整流程，包括：开场组织→活动进行→收尾总结'),
    ('安全保障细节', '说明安全管理措施、应急处理流程、学生隐私保护机制等'),
]
t3 = doc.add_table(rows=len(rows3), cols=2)
t3.style = 'Table Grid'
t3.alignment = WD_TABLE_ALIGNMENT.CENTER
for i, (k, v) in enumerate(rows3):
    set_cell(t3.rows[i].cells[0], k, size=10.5, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell(t3.rows[i].cells[1], v, size=10.5)
    t3.rows[i].cells[0].width = Cm(3.6)
    t3.rows[i].cells[1].width = Cm(12.4)

para('', first_indent=0, size=10.5)
body_block('三、实践成效（必填）',
           '（可从下列维度呈现实施前后的变化，可只填部分维度，实施前与实施后可以定量填定量数据，无法定量填写定性描述。）')

rows4 = [
    ('成效维度', '核心指标', '实施前', '实施后', '提升效果'),
    ('学生参与', '课间活动参与率/主动参与比例', '', '', '比如：多数学生能主动参与多样化课间活动，课间追逐打闹现象明显减少'),
    ('安全管理', '课间安全隐患/事故数量', '', '', '比如：课间安全秩序良好，未发生安全事故'),
    ('身心发展', '体能/视力/情绪状态相关指标', '', '', '比如：学生课间体能活动频次增加，久坐状态得到缓解'),
    ('教师减负', '课间管理耗时/工作量变化', '', '', '比如：教师课间管理压力减轻，可将更多精力投入教学准备'),
    ('满意度', '学生/教师/家长满意度', '', '', '比如：学生、教师及家长对课间活动形式与效果普遍认可'),
]
t4 = doc.add_table(rows=len(rows4), cols=5)
t4.style = 'Table Grid'
t4.alignment = WD_TABLE_ALIGNMENT.CENTER
for i, row in enumerate(rows4):
    for j, val in enumerate(row):
        al = WD_ALIGN_PARAGRAPH.CENTER if (i == 0 or j < 2) else WD_ALIGN_PARAGRAPH.LEFT
        set_cell(t4.rows[i].cells[j], val, size=10.5, align=al)
cw = [Cm(2.6), Cm(4.2), Cm(2.0), Cm(2.0), Cm(5.2)]
for row in t4.rows:
    for j, w in enumerate(cw):
        row.cells[j].width = w

para('', first_indent=0, size=10.5)
body_block('四、特色创新（必填）',
           '（提炼核心亮点，聚焦AI技术应用、课间模式优化、育人方式创新等维度，突出差异化优势。每个亮点用一段话概括核心理念与实践特色。）')
body_block('五、优化计划（选填）',
           '（简述项目落地过程中遇到的难点、现存不足，以及针对性的解决方案和后续迭代计划。）')
body_block('六、案例展示素材（必填）',
           '（请将学校展示“课间一刻钟”AI应用活动实况的图片、视频素材，以独立文件形式随案例材料一并报送。）')

doc.save(OUT)
print('saved:', OUT)
print('tables:', len(doc.tables), 'paragraphs:', len(doc.paragraphs))
