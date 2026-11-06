# -*- coding: utf-8 -*-
"""Generate Shunyi district school survey workbook (fill-in template)."""
from __future__ import annotations

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.page import PageMargins
from openpyxl.chart import BarChart, Reference

OUT = r"D:\dsh-workbench\北京市顺义区学校基本情况调查表.xlsx"

NAVY = "0F5C56"
NAVY_FILL = PatternFill("solid", fgColor=NAVY)
HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFF", size=11)
TITLE_FONT = Font(name="Arial", bold=True, size=18, color=NAVY)
SUB_FONT = Font(name="Arial", bold=True, size=13, color=NAVY)
LABEL_FONT = Font(name="Arial", bold=True, size=10, color="1B1916")
BODY_FONT = Font(name="Arial", size=10, color="1B1916")
INPUT_FONT = Font(name="Arial", size=10, color="0000FF")
FORMULA_FONT = Font(name="Arial", size=10, color="000000")
XSHEET_FONT = Font(name="Arial", size=10, color="008000")
MUTED_FONT = Font(name="Arial", size=9, italic=True, color="5C574F")
EXAMPLE_FONT = Font(name="Arial", size=10, italic=True, color="0000FF")

YELLOW = PatternFill("solid", fgColor="FFFF00")
CREAM = PatternFill("solid", fgColor="F4EFE6")
PALE = PatternFill("solid", fgColor="E8F3F1")
EXAMPLE_FILL = PatternFill("solid", fgColor="FFF3BF")
WARN_FILL = PatternFill("solid", fgColor="F8D7DA")
OK_FILL = PatternFill("solid", fgColor="D4EDDA")
THIN = Border(
    left=Side(style="thin", color="C4BDB0"),
    right=Side(style="thin", color="C4BDB0"),
    top=Side(style="thin", color="C4BDB0"),
    bottom=Side(style="thin", color="C4BDB0"),
)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)

SCHOOL_TYPES = "幼儿园,小学,初中,高中,九年一贯制,十二年一贯制,完全中学,中等职业学校,特殊教育学校,其他"
HOLDERS = "公办,民办,其他"
STATUS = "未填,已填,待核"
YESNO = "是,否"

NAME_ROWS = 50  # blank rows after example
NAME_START = 4  # first real data row
NAME_END = NAME_START + NAME_ROWS - 1  # 53
CAMPUS_START = 4
CAMPUS_END = 53


def style_title(ws, cell, text, font=TITLE_FONT):
    ws[cell] = text
    ws[cell].font = font
    ws[cell].alignment = Alignment(horizontal="left", vertical="center")


def input_cell(ws, cell, value="", example=False):
    ws[cell] = value
    ws[cell].font = EXAMPLE_FONT if example else INPUT_FONT
    ws[cell].fill = EXAMPLE_FILL if example else YELLOW
    ws[cell].alignment = LEFT
    ws[cell].border = THIN


def label_cell(ws, cell, text):
    ws[cell] = text
    ws[cell].font = LABEL_FONT
    ws[cell].alignment = LEFT
    ws[cell].fill = CREAM
    ws[cell].border = THIN


def formula_cell(ws, cell, formula, xsheet=False, num_fmt=None):
    ws[cell] = formula
    ws[cell].font = XSHEET_FONT if xsheet else FORMULA_FONT
    ws[cell].alignment = CENTER
    ws[cell].border = THIN
    if num_fmt:
        ws[cell].number_format = num_fmt


def header_row(ws, row, headers, fill=NAVY_FILL):
    for col, text in enumerate(headers, 1):
        cell = ws.cell(row, col, text)
        cell.font = HEADER_FONT
        cell.fill = fill
        cell.alignment = CENTER
        cell.border = THIN


def set_widths(ws, widths):
    for col, width in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width


def page_setup(ws, landscape=True, paper="A4", fit_width=1):
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A3 if paper == "A3" else ws.PAPERSIZE_A4
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = fit_width
    ws.page_setup.fitToHeight = 0
    ws.page_margins = PageMargins(left=0.5, right=0.5, top=0.6, bottom=0.6)
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True


def add_dv(ws, formula, ref, name):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True)
    dv.error = "请从下拉列表中选择"
    dv.errorTitle = "取值不在列表"
    dv.prompt = name
    dv.promptTitle = "请选择"
    ws.add_data_validation(dv)
    dv.add(ref)


def build_cover(wb):
    ws = wb.active
    ws.title = "封面"
    set_widths(ws, [22, 36, 14, 28, 14, 22])
    ws.row_dimensions[1].height = 28
    ws.row_dimensions[2].height = 20
    ws.merge_cells("A1:F1")
    style_title(ws, "A1", "北京市顺义区学校基本情况调查表")
    ws.merge_cells("A2:F2")
    ws["A2"] = "工作底稿模板 · 非正式发文 · 知识库无对应制度条文，不引用未确认文件号"
    ws["A2"].font = MUTED_FONT

    rows = [
        (4, "A4", "调查学期", "B4", "2025-2026-1", "与工作区 school.json 学期口径一致，可改。"),
        (5, "A5", "填报单位", "B5", "", "填写实际填报科室或学校。"),
        (6, "A6", "填报人", "B6", "", ""),
        (7, "A7", "职务", "B7", "", ""),
        (8, "A8", "联系电话", "B8", "", "办公电话，勿填私人敏感信息。"),
        (9, "A9", "填报日期", "B9", "", "文本，如 2026-08-16。"),
        (10, "A10", "名录是否齐备", "B10", "否", "齐备后再做全区汇总。"),
    ]
    for r, lc, lt, vc, default, tip in rows:
        label_cell(ws, lc, lt)
        input_cell(ws, vc, default)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        if tip:
            ws[vc].comment = Comment(tip, "调查表")
        ws.row_dimensions[r].height = 22

    add_dv(ws, '"是,否"', "B10", "名录是否齐备")

    label_cell(ws, "D4", "已填学校数")
    formula_cell(ws, "E4", "=汇总!B4", xsheet=True)
    label_cell(ws, "D5", "教学班合计")
    formula_cell(ws, "E5", "=汇总!B5", xsheet=True)
    label_cell(ws, "D6", "在编教职工合计")
    formula_cell(ws, "E6", "=汇总!B6", xsheet=True)
    label_cell(ws, "D7", "机房合计")
    formula_cell(ws, "E7", "=汇总!B8", xsheet=True)
    label_cell(ws, "D8", "录播教室合计")
    formula_cell(ws, "E8", "=汇总!B9", xsheet=True)
    label_cell(ws, "D9", "校区明细行数")
    formula_cell(ws, "E9", "=汇总!B10", xsheet=True)
    label_cell(ws, "D10", "名录与明细是否一致")
    formula_cell(ws, "E10", "=汇总!B12", xsheet=True)

    ws.merge_cells("A12:F12")
    style_title(ws, "A12", "填写规则", SUB_FONT)
    notes = [
        "黄色单元格、蓝色字体为填写区；黑色为公式，绿色为跨表引用，不要改公式。",
        "「学校名录」第3行为示例，是否示例=是，汇总公式已排除。填报前请删除或覆盖该行。",
        "只填学校汇总口径：教学班、在编教职工、专任教师、在校学生（合计）。不要粘贴全员名单或精确个人成绩。",
        "机房 / 录播只填间数。未联通设备不要写在线、离线或已监控。",
        "街镇、学校全称按本校或主管单位确认口径填写。本表不预置顺义区学校名单。",
        "办学类型、举办者、填报状态请用下拉列表。",
        "校区多于 1 个时，在「校区明细」按校区分行，机房与录播按校区填写，名录填全校合计。",
    ]
    for i, text in enumerate(notes):
        row = 13 + i
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=6)
        ws.cell(row, 1, f"{i + 1}. {text}").font = BODY_FONT
        ws.cell(row, 1).alignment = LEFT
        ws.row_dimensions[row].height = 20

    ws.merge_cells("A21:F21")
    style_title(ws, "A21", "字段与知识库对齐", SUB_FONT)
    ws.merge_cells("A22:F22")
    ws["A22"] = "学期取值示例 2025-2026-1，见 D:\\dsh-kb\\dictionary\\学校数据字典-模板.md。学号等个人字段本表不采集。"
    ws["A22"].font = MUTED_FONT

    ws.freeze_panes = "A4"
    page_setup(ws, landscape=False, paper="A4")
    ws.print_title_rows = "1:2"
    ws.oddHeader.left.text = "北京市顺义区学校基本情况调查表"
    ws.oddFooter.center.text = "工作底稿 · 第 &P 页 / 共 &N 页"


def build_guide(wb):
    ws = wb.create_sheet("填表说明")
    set_widths(ws, [18, 28, 36, 42])
    ws.merge_cells("A1:D1")
    style_title(ws, "A1", "填表说明与图例")
    ws.row_dimensions[1].height = 26
    ws.merge_cells("A2:D2")
    ws["A2"] = "本表供顺义区学校基本情况采集。不是区教委正式调查通知，发文文号待主管单位确认后再补。"
    ws["A2"].font = MUTED_FONT

    header_row(ws, 4, ["图例", "样式", "谁改", "说明"])
    legends = [
        ("填写区", "黄底蓝字", "填报人", "封面、名录、校区明细的输入格"),
        ("示例行", "浅橙底斜体", "填报前删除", "只示范格式，不进入汇总"),
        ("公式", "黑字", "勿改", "本表自动计算"),
        ("跨表引用", "绿字", "勿改", "封面指标、汇总校验"),
    ]
    for i, row in enumerate(legends):
        r = 5 + i
        for c, val in enumerate(row, 1):
            cell = ws.cell(r, c, val)
            cell.font = BODY_FONT
            cell.alignment = LEFT
            cell.border = THIN
        if i == 0:
            ws.cell(r, 2).font = INPUT_FONT
            ws.cell(r, 2).fill = YELLOW
        elif i == 1:
            ws.cell(r, 2).font = EXAMPLE_FONT
            ws.cell(r, 2).fill = EXAMPLE_FILL
        elif i == 3:
            ws.cell(r, 2).font = XSHEET_FONT

    header_row(ws, 10, ["字段", "含义", "取值", "注意"])
    fields = [
        ("学校全称", "公章或章程上的全称", "文本", "不要用简称当正式名录"),
        ("学校标识码", "教育部学校标识码（如有）", "10 位数字或空", "没有则留空，不要编造"),
        ("办学类型", "学段或学校类别", "下拉", "一贯制选对应项，不要拆成两行学校"),
        ("举办者", "公办 / 民办 / 其他", "下拉", "其他须在备注写清"),
        ("属地街镇", "学校所在街镇", "文本", "按主管单位确认口径，本表不预置街镇表"),
        ("教学班", "本学期教学班个数", "整数", "与 school.json 的 classes 口径一致"),
        ("在编教职工", "在编人数", "整数", "与 school.json 的 staff 口径一致；不填编外名单"),
        ("专任教师", "专任教师人数", "整数", "含在编专任；不要填身份证号"),
        ("在校学生", "在校生合计", "整数", "只填合计，禁止全员名单"),
        ("机房数", "计算机教室间数", "整数", "与 school.json 的 rooms 中机房部分对应"),
        ("录播教室数", "录播教室间数", "整数", "未接通设备不写运行状态"),
        ("学期", "调查学期", "如 2025-2026-1", "封面一处填写，各表共用"),
    ]
    for i, row in enumerate(fields):
        r = 11 + i
        for c, val in enumerate(row, 1):
            cell = ws.cell(r, c, val)
            cell.font = BODY_FONT
            cell.alignment = LEFT
            cell.border = THIN
            if c == 1:
                cell.fill = PALE
        ws.row_dimensions[r].height = 28

    ws.freeze_panes = "A5"
    page_setup(ws, landscape=True, paper="A4")


def build_roster(wb):
    ws = wb.create_sheet("学校名录")
    headers = [
        "序号",
        "学校全称",
        "学校标识码",
        "办学类型",
        "举办者",
        "属地街镇",
        "详细地址",
        "校区数",
        "教学班",
        "在编教职工",
        "专任教师",
        "在校学生",
        "机房数",
        "录播教室数",
        "联系人",
        "联系电话",
        "填报状态",
        "备注",
        "是否示例",
    ]
    ws.merge_cells("A1:S1")
    style_title(ws, "A1", "学校名录（一行一所学校）")
    ws.merge_cells("A2:S2")
    ws["A2"] = "黄格填写。第4行为示例（是否示例=是）。学期见封面。勿填学生名单或个人成绩。"
    ws["A2"].font = MUTED_FONT
    header_row(ws, 3, headers)
    set_widths(
        ws,
        [6, 28, 16, 14, 10, 14, 28, 8, 8, 12, 10, 10, 8, 12, 10, 14, 10, 18, 10],
    )

    example = [
        1,
        "示例学校（请删除本行）",
        "",
        "初中",
        "公办",
        "示例街镇",
        "示例路1号",
        1,
        24,
        86,
        72,
        980,
        3,
        2,
        "张老师",
        "010-00000000",
        "已填",
        "格式示例，禁止当作真实学校",
        "是",
    ]

    for col, val in enumerate(example, 1):
        cell = ws.cell(4, col, val)
        cell.font = EXAMPLE_FONT
        cell.fill = EXAMPLE_FILL
        cell.alignment = CENTER if col not in (2, 7, 18) else LEFT
        cell.border = THIN
    ws.cell(4, 1).value = '=IF(B4="","",1)'
    ws.cell(4, 1).font = FORMULA_FONT
    ws.cell(4, 1).fill = EXAMPLE_FILL

    data_start, data_end = 5, 54
    for r in range(data_start, data_end + 1):
        ws.row_dimensions[r].height = 20
        for c in range(1, 20):
            cell = ws.cell(r, c)
            cell.border = THIN
            cell.alignment = CENTER if c not in (2, 7, 18) else LEFT
            if c == 1:
                cell.value = f'=IF(B{r}="","",ROW()-4)'
                cell.font = FORMULA_FONT
            elif c == 19:
                cell.value = "否"
                cell.font = INPUT_FONT
                cell.fill = YELLOW
            else:
                cell.font = INPUT_FONT
                cell.fill = YELLOW

    add_dv(ws, f'"{SCHOOL_TYPES}"', f"D4:D{data_end}", "办学类型")
    add_dv(ws, f'"{HOLDERS}"', f"E4:E{data_end}", "举办者")
    add_dv(ws, f'"{STATUS}"', f"Q4:Q{data_end}", "填报状态")
    add_dv(ws, f'"{YESNO}"', f"S4:S{data_end}", "是否示例")

    ws.freeze_panes = "B4"
    ws.auto_filter.ref = f"A3:S{data_end}"
    ws.conditional_formatting.add(
        f"B5:B{data_end}",
        FormulaRule(formula=['AND(B5<>"",COUNTA($C5:$P5)<3)'], fill=WARN_FILL),
    )
    page_setup(ws, landscape=True, paper="A3")
    ws.print_title_rows = "1:3"
    ws.oddHeader.left.text = "顺义区学校名录"
    # store range for other sheets via defined names later
    ws.sheet_properties.tabColor = NAVY
    return data_start, data_end


def build_campus(wb):
    ws = wb.create_sheet("校区明细")
    ws.merge_cells("A1:I1")
    style_title(ws, "A1", "校区明细（一校区一行）")
    ws.merge_cells("A2:I2")
    ws["A2"] = "学校全称须与名录一致。机房、录播按校区填间数，不填设备运行状态。"
    ws["A2"].font = MUTED_FONT
    headers = [
        "序号",
        "学校全称",
        "校区名称",
        "校区地址",
        "教学班",
        "机房数",
        "录播教室数",
        "是否示例",
        "备注",
    ]
    header_row(ws, 3, headers)
    set_widths(ws, [6, 28, 16, 28, 10, 10, 12, 10, 22])

    example = [
        '=IF(B4="","",1)',
        "示例学校（请删除本行）",
        "本校区",
        "示例路1号",
        24,
        3,
        2,
        "是",
        "格式示例",
    ]
    for col, val in enumerate(example, 1):
        cell = ws.cell(4, col, val)
        cell.font = EXAMPLE_FONT if col != 1 else FORMULA_FONT
        cell.fill = EXAMPLE_FILL
        cell.alignment = CENTER if col not in (2, 3, 4, 9) else LEFT
        cell.border = THIN

    data_start, data_end = 5, 54
    for r in range(data_start, data_end + 1):
        for c in range(1, 10):
            cell = ws.cell(r, c)
            cell.border = THIN
            cell.alignment = CENTER if c not in (2, 3, 4, 9) else LEFT
            if c == 1:
                cell.value = f'=IF(B{r}="","",ROW()-4)'
                cell.font = FORMULA_FONT
            elif c == 8:
                cell.value = "否"
                cell.font = INPUT_FONT
                cell.fill = YELLOW
            else:
                cell.font = INPUT_FONT
                cell.fill = YELLOW

    add_dv(ws, f'"{YESNO}"', f"H4:H{data_end}", "是否示例")
    ws.freeze_panes = "C4"
    ws.auto_filter.ref = f"A3:I{data_end}"
    page_setup(ws, landscape=True, paper="A4")
    ws.sheet_properties.tabColor = "8A6D3B"
    return data_start, data_end


def build_summary(wb, roster_start, roster_end, campus_start, campus_end):
    ws = wb.create_sheet("汇总")
    ws.merge_cells("A1:D1")
    style_title(ws, "A1", "汇总与校验")
    ws.merge_cells("A2:D2")
    ws["A2"] = "全部为公式。示例行（是否示例=是）已排除。名录未齐备时合计仅作过程数。"
    ws["A2"].font = MUTED_FONT

    set_widths(ws, [28, 14, 28, 16])
    header_row(ws, 3, ["指标", "数值", "口径", "来源"])

    rs, re_ = roster_start, roster_end
    cs, ce = campus_start, campus_end
    roster = "学校名录"
    campus = "校区明细"

    metrics = [
        (4, "已填学校数", f'=COUNTIFS({roster}!B{rs}:B{re_},"<>",{roster}!S{rs}:S{re_},"<>是")', "名录有全称且非示例", "学校名录"),
        (5, "教学班合计", f'=SUMIFS({roster}!I{rs}:I{re_},{roster}!S{rs}:S{re_},"<>是")', "名录教学班", "学校名录"),
        (6, "在编教职工合计", f'=SUMIFS({roster}!J{rs}:J{re_},{roster}!S{rs}:S{re_},"<>是")', "名录在编教职工", "学校名录"),
        (7, "在校学生合计", f'=SUMIFS({roster}!L{rs}:L{re_},{roster}!S{rs}:S{re_},"<>是")', "仅合计，无名单", "学校名录"),
        (8, "机房合计（名录）", f'=SUMIFS({roster}!M{rs}:M{re_},{roster}!S{rs}:S{re_},"<>是")', "学校级合计", "学校名录"),
        (9, "录播教室合计（名录）", f'=SUMIFS({roster}!N{rs}:N{re_},{roster}!S{rs}:S{re_},"<>是")', "学校级合计", "学校名录"),
        (10, "校区明细行数", f'=COUNTIFS({campus}!B{cs}:B{ce},"<>",{campus}!H{cs}:H{ce},"<>是")', "非示例校区行", "校区明细"),
        (11, "名录校区数合计", f'=SUMIFS({roster}!H{rs}:H{re_},{roster}!S{rs}:S{re_},"<>是")', "名录填报的校区数", "学校名录"),
        (
            12,
            "名录与明细是否一致",
            f'=IF(B10=B11,"一致","不一致")',
            "明细行数应等于名录校区数合计",
            "本表",
        ),
        (
            13,
            "机房明细合计",
            f'=SUMIFS({campus}!F{cs}:F{ce},{campus}!H{cs}:H{ce},"<>是")',
            "按校区加总",
            "校区明细",
        ),
        (
            14,
            "机房名录与明细是否一致",
            f'=IF(B8=B13,"一致","不一致")',
            "有多校区时两边都应填",
            "本表",
        ),
        (15, "调查学期", "=封面!B4", "封面填写", "封面"),
        (16, "名录是否齐备", "=封面!B10", "封面声明", "封面"),
    ]

    for row, name, formula, caliber, source in metrics:
        label_cell(ws, f"A{row}", name)
        xsheet = "!" in str(formula)
        formula_cell(ws, f"B{row}", formula, xsheet=xsheet)
        ws.cell(row, 3, caliber).font = BODY_FONT
        ws.cell(row, 3).alignment = LEFT
        ws.cell(row, 3).border = THIN
        ws.cell(row, 4, source).font = BODY_FONT
        ws.cell(row, 4).alignment = CENTER
        ws.cell(row, 4).border = THIN
        ws.row_dimensions[row].height = 22

    ws.conditional_formatting.add(
        "B12",
        FormulaRule(formula=['B12="不一致"'], fill=WARN_FILL),
    )
    ws.conditional_formatting.add(
        "B12",
        FormulaRule(formula=['B12="一致"'], fill=OK_FILL),
    )
    ws.conditional_formatting.add(
        "B14",
        FormulaRule(formula=['B14="不一致"'], fill=WARN_FILL),
    )
    ws.conditional_formatting.add(
        "B14",
        FormulaRule(formula=['B14="一致"'], fill=OK_FILL),
    )

    ws.merge_cells("A18:D18")
    style_title(ws, "A18", "按办学类型计数（排除示例）", SUB_FONT)
    header_row(ws, 19, ["办学类型", "学校数", "", ""])
    types = [
        "幼儿园",
        "小学",
        "初中",
        "高中",
        "九年一贯制",
        "十二年一贯制",
        "完全中学",
        "中等职业学校",
        "特殊教育学校",
        "其他",
    ]
    for i, t in enumerate(types):
        r = 20 + i
        ws.cell(r, 1, t).font = BODY_FONT
        ws.cell(r, 1).border = THIN
        ws.cell(r, 1).alignment = LEFT
        formula_cell(
            ws,
            f"B{r}",
            f'=COUNTIFS({roster}!D{rs}:D{re_},A{r},{roster}!S{rs}:S{re_},"<>是")',
        )
        ws.cell(r, 3).border = THIN
        ws.cell(r, 4).border = THIN

    formula_cell(ws, "B30", "=SUM(B20:B29)")
    label_cell(ws, "A30", "类型计数合计")
    ws["C30"] = "应等于已填学校数"
    ws["C30"].font = MUTED_FONT

    chart = BarChart()
    chart.type = "col"
    chart.title = "办学类型分布（排除示例）"
    chart.y_axis.title = "学校数"
    chart.x_axis.title = None
    data = Reference(ws, min_col=2, min_row=19, max_row=29)
    cats = Reference(ws, min_col=1, min_row=20, max_row=29)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    chart.shape = 4
    chart.style = 10
    chart.legend = None
    chart.y_axis.scaling.min = 0
    chart.width = 18
    chart.height = 8
    ws.add_chart(chart, "A32")

    ws.freeze_panes = "A4"
    page_setup(ws, landscape=False, paper="A4")
    ws.sheet_properties.tabColor = "1B4F72"


def main():
    wb = Workbook()
    wb.calculation.calcMode = "auto"
    wb.calculation.fullCalcOnLoad = True
    build_cover(wb)
    build_guide(wb)
    roster_start, roster_end = build_roster(wb)
    campus_start, campus_end = build_campus(wb)
    build_summary(wb, roster_start, roster_end, campus_start, campus_end)

    # Fix cover note: 学校名录 example is row 4
    cover = wb["封面"]
    cover["A13"] = "1. 黄色单元格、蓝色字体为填写区；黑色为公式，绿色为跨表引用，不要改公式。"
    cover["A14"] = "2. 「学校名录」「校区明细」第4行为示例，是否示例=是，汇总已排除。填报前请删除或覆盖。"

    wb.properties.title = "北京市顺义区学校基本情况调查表"
    wb.properties.creator = "dsh-workbench"
    wb.properties.description = (
        "工作底稿模板，非正式发文。不预置学校名单，不采集学生个人数据。"
    )
    wb.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
