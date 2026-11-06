# -*- coding: utf-8 -*-
"""扫一份 Word/文本，把“可能要进待办”的信息挑出来：日期、邮箱、电话、联系人、报送/截止字样。
用法：python scan_doc_dates.py <文件路径> [更多路径...]
输出：按文件列出命中的原文行，供写完后问用户“要不要加到待办事项”。
"""
import re
import sys
from pathlib import Path

PATTERNS = [
    ("日期", re.compile(r"(20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}月\d{1,2}日)")),
    ("邮箱", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("电话", re.compile(r"(?:电话|联系|手机)[^\n]{0,12}?(\d{3,4}-?\d{7,8}|1[3-9]\d{9})")),
    ("时限词", re.compile(r"(截止|报送|报名|上交|提交|前报|之前|之前报|务必|逾期|请于|于\d)")),
]


def text_of(p: Path) -> str:
    if p.suffix.lower() == ".docx":
        from docx import Document
        d = Document(str(p))
        lines = [par.text for par in d.paragraphs]
        for tb in d.tables:
            for row in tb.rows:
                for cell in row.cells:
                    lines.append(cell.text.replace("\n", " "))
        return "\n".join(lines)
    if p.suffix.lower() in (".txt", ".md"):
        return p.read_text(encoding="utf-8", errors="ignore")
    return ""


def scan(p: Path) -> None:
    txt = text_of(p)
    if not txt:
        print(f"[{p.name}] 读不了（只支持 docx/txt/md）")
        return
    print(f"=== {p} ===")
    hits = 0
    for raw in txt.splitlines():
        line = raw.strip()
        if not line:
            continue
        found = [name for name, rx in PATTERNS if rx.search(line)]
        if found:
            hits += 1
            print(f"  [{'/'.join(found)}] {line}")
    if hits == 0:
        print("  （没有日期/邮箱/时限字样）")
    print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    for arg in sys.argv[1:]:
        scan(Path(arg))
