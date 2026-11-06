# -*- coding: utf-8 -*-
from openpyxl import load_workbook

paths = [
    r'E:\桌面\办公文件\办公文档\2026年\10月\课件15分钟\课间一刻钟AI应用案例-汇总检查表-20261103.xlsx',
    r'E:\桌面\办公文件\办公文档\2026年\10月\千问账号发送\千问试用人员信息表-汇总检查表-20261103.xlsx',
    r'E:\桌面\办公文件\办公文档\2026年\10月\其他邮件材料-汇总检查表-20261103.xlsx',
    r'E:\桌面\办公文件\办公文档\2026年\10月\邮件材料检查汇总表-20261103.xlsx',
]
for p in paths:
    wb = load_workbook(p)
    print('==', p.rsplit('\\', 1)[-1], wb.sheetnames)
    ws = wb['汇总']
    print('   标题:', ws['A1'].value, '| 副标题:', ws['A2'].value)
    for r in range(4, min(ws.max_row, 7) + 1):
        vals = [ws.cell(row=r, column=c).value for c in (2, 3, 4, 12)]
        print('   ', vals)
