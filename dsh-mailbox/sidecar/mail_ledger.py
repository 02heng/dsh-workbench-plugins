#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""读收件台账（xlsx）为 JSON，供工具与网页展示。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mb_common import arg_value, die, json_out, month_tag  # noqa: E402


def main() -> None:
    root = Path(arg_value(sys.argv, "--root", "D:/dsh-mailbox")).resolve()
    month = arg_value(sys.argv, "--month", "") or month_tag()
    limit = int(arg_value(sys.argv, "--limit", "300"))
    path = root / "ledger" / ("收件台账-%s.xlsx" % month)
    if not path.exists():
        json_out({"ok": True, "month": month, "path": str(path), "headers": [], "rows": [], "count": 0,
                  "message": "该月还没有台账（收信后跑 mailbox_process 生成）"})
        return
    try:
        from openpyxl import load_workbook
    except ImportError:
        die("缺少 openpyxl", code="no-openpyxl")
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["收件台账"] if "收件台账" in workbook.sheetnames else workbook.active
    rows = []
    headers = []
    for index, row in enumerate(sheet.iter_rows(values_only=True)):
        if index == 0:
            headers = [str(item or "") for item in row]
            continue
        if index > limit:
            break
        rows.append({headers[column] if column < len(headers) else str(column): value
                     for column, value in enumerate(row)})
    workbook.close()
    json_out({"ok": True, "month": month, "path": str(path), "headers": headers,
              "rows": rows, "count": len(rows)})


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        die("读取台账失败：%s" % error, code="ledger-crash")
