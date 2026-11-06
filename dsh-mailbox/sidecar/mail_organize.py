#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""归档整理 sidecar：按通知规则 → 学校子目录 → 解压 → 规范化命名 → 台账 + 缺件清单。

用法：python mail_organize.py --root D:/dsh-mailbox [--dry-run] [--uid 123] [--limit 50]
"""
from __future__ import annotations

import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mb_common import (  # noqa: E402
    append_log, arg_value, die, ensure_dir, has_flag, human_size, json_out, load_config,
    load_json, load_state, mask_pii, month_tag, normalize_sep, now_stamp, rel_to,
    safe_dirname, safe_filename, save_json, save_state, today_tag, unique_path,
)
from mail_unpack import extract, is_archive  # noqa: E402

# (正则, 取值分组)：分组 0 = 整个匹配；分组 1 = 只取冒号后的值
SCHOOL_PATTERNS = [
    (re.compile(r"(?:北京市)?(?:顺义区)?[\u4e00-\u9fa5A-Za-z0-9]{2,14}?(?:小学|中学|学校|幼儿园|学院|大学)"), 0),
    (re.compile(r"(?:单位名称|学校名称|报送单位)[：:]\s*([\u4e00-\u9fa5A-Za-z0-9]{4,24})"), 1),
]
CONTACT_RE = re.compile(r"联系人[：:]\s*([\u4e00-\u9fa5]{2,4})")
PHONE_RE = re.compile(r"(?:联系电话|办公电话|电话|手机|联系方式)[：:]?\s*((?:\d[\d\-—\s]{6,18}\d)|(?:【手机号已隐去】))")
DOC_EXT = {".doc", ".docx", ".pdf", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md",
           ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".mp4", ".mov", ".avi", ".m4a", ".mp3"}

LEDGER_HEADERS = ["序号", "收件时间", "邮件主题", "发件人", "学校", "联系人", "电话",
                  "通知（规则）", "附件数", "文件清单", "归档目录", "状态", "邮件UID", "备注"]
COL = {name: index + 1 for index, name in enumerate(LEDGER_HEADERS)}


def load_index(root: Path) -> list:
    data = load_json(root / "raw" / "index.json", {})
    if isinstance(data, dict):
        return data.get("mails") if isinstance(data.get("mails"), list) else []
    return data if isinstance(data, list) else []


def save_index(root: Path, mails: list) -> None:
    save_json(root / "raw" / "index.json", {"version": 1, "updatedAt": now_stamp(), "mails": mails})


def text_pool(record: dict, body: str = "") -> str:
    parts = [record.get("subject", ""), record.get("preview", ""), body]
    parts.extend(item.get("name", "") for item in record.get("attachments") or [])
    parts.append((record.get("from") or {}).get("name", ""))
    return "\n".join(part for part in parts if part)


def extract_school(text: str) -> str:
    for pattern, group in SCHOOL_PATTERNS:
        match = pattern.search(text or "")
        if not match:
            continue
        name = (match.group(group) or "").strip()
        if not name:
            continue
        name = re.sub(r"^北京市", "", name)
        if 3 <= len(name) <= 30:
            return name
    return ""


def extract_contact(text: str) -> tuple[str, str]:
    name_match = CONTACT_RE.search(text or "")
    phone_match = PHONE_RE.search(text or "")
    name = name_match.group(1) if name_match else ""
    phone = ""
    if phone_match:
        raw = phone_match.group(1).strip()
        if "已隐去" in raw:
            phone = "【手机号已隐去】"
        else:
            digits = re.sub(r"\D", "", raw)
            phone = digits if 7 <= len(digits) <= 12 else ""
    return name, phone


def resolve_dir(root: Path, config: dict, rule: dict | None, record: dict, school: str) -> tuple[Path, bool]:
    """返回（归档目录, 是否需要人工确认）。"""
    nested = (config.get("paths") or {}).get("archiveRoot") or ""
    base = ""
    if rule:
        base = rule.get("target") or ""
        if not base:
            base = str(Path(nested) / (rule.get("name") or rule.get("id") or "未命名通知")) if nested else ""
    if not base:
        base = str(root / "inbox" / "待人工" / (f"{today_tag()}-{safe_dirname(record.get('subject') or '无主题', '无主题', 40)}"))
    base_path = Path(base)
    if not base_path.is_absolute():
        base_path = root / base_path
    manual = not bool(rule)
    by_school = rule.get("bySchool", True) if rule else False
    if by_school:
        if school:
            return base_path / school, manual
        return base_path / "_待确认学校", True
    return base_path, manual


def naming_ok(name: str) -> bool:
    return normalize_sep(Path(name).stem).count("－") >= 4


def place_file(source: Path, target_dir: Path, config: dict, school: str, rule: dict | None) -> tuple[Path, str]:
    """复制单个文件到目标目录，返回（落地路径, 备注）。"""
    notes = []
    name = normalize_sep(safe_filename(source.name, "file"))
    prefix_school = (rule or {}).get("prefixSchool", True)
    if school and prefix_school and school not in name and not name.startswith("_"):
        name = school + "－" + name
    if not naming_ok(name):
        notes.append("文件名未按「学校－姓名－学段－学科－课例名称」口径")
    target = unique_path(target_dir / name)
    shutil.copy2(source, target)
    return target, "；".join(notes)


def flatten_single(dest: Path) -> None:
    """解压后若只有一个根文件夹，把它的内容上提一层。"""
    items = [item for item in dest.iterdir() if item.name != "__MACOSX"]
    if len(items) != 1 or not items[0].is_dir():
        return
    inner = items[0]
    for child in list(inner.iterdir()):
        candidate = dest / child.name
        if candidate.exists():
            candidate = unique_path(candidate)
        child.rename(candidate)
    try:
        inner.rmdir()
    except OSError:
        pass


def process_mail(root: Path, config: dict, record: dict, dry_run: bool) -> dict:
    rule_id = record.get("ruleId")
    rules = [item for item in (config.get("rules") or [])
             if isinstance(item, dict) and item.get("enabled") is not False]
    rule = next((item for item in rules if item.get("id") == rule_id), None)
    mail_dir = root / (record.get("dir") or "")
    body = ""
    body_file = mail_dir / "body.txt"
    if body_file.exists():
        try:
            body = body_file.read_text(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            body = ""
    pool = text_pool(record, body)
    if rule is None:  # 规则后加、或收信时还没建规则：按关键词补匹配
        for candidate in rules:
            keywords = [str(item) for item in (candidate.get("keywords") or []) if str(item).strip()]
            if keywords and any(keyword in pool for keyword in keywords):
                rule = candidate
                break
    school = extract_school(pool)
    contact, phone = extract_contact(body or record.get("preview", ""))
    dest_dir, manual = resolve_dir(root, config, rule, record, school)

    notes = []
    if not rule:
        notes.append("未匹配任何通知规则，已放待人工")
    if rule and rule.get("bySchool", True) and not school:
        notes.append("学校名称未识别")
    attachments = record.get("attachments") or []
    if not attachments:
        notes.append("邮件无附件")

    files, folders = [], []
    unpack_opts = dict(config.get("unpack") or {})
    for attachment in attachments:
        source = root / (attachment.get("path") or "")
        if not source.exists():
            notes.append("附件丢失：%s" % attachment.get("name"))
            continue
        if is_archive(source.name):
            folder_name = normalize_sep(safe_filename(source.stem, "附件"))
            if school and (rule or {}).get("prefixSchool", True) and school not in folder_name:
                folder_name = school + "－" + folder_name
            target_folder = dest_dir / folder_name
            files.append({"name": folder_name + "/", "kind": "folder"})
            if dry_run:
                continue
            ensure_dir(dest_dir)
            result = extract(source, target_folder, unpack_opts)
            if result.get("warnings"):
                notes.extend(result["warnings"])
            if unpack_opts.get("flattenSingle", True):
                flatten_single(target_folder)
            extracted = sorted(item.relative_to(target_folder).as_posix()
                               for item in target_folder.rglob("*") if item.is_file())
            folders.append({"folder": target_folder.name, "files": extracted,
                            "count": len(extracted)})
            files.extend({"name": item, "kind": "file"} for item in extracted)
        elif source.suffix.lower() in DOC_EXT:
            if dry_run:
                files.append({"name": source.name, "kind": "file"})
                continue
            ensure_dir(dest_dir)
            placed, note = place_file(source, dest_dir, config, school, rule)
            if note:
                notes.append(note)
            files.append({"name": placed.name, "kind": "file"})
        else:
            notes.append("跳过来路不明的附件：%s" % source.name)

    status = "已归档"
    if manual or notes:
        status = "待人工"
    return {
        "uid": record.get("uid"),
        "subject": record.get("subject"),
        "school": school,
        "contact": contact,
        "phone": phone,
        "rule": (rule or {}).get("name") or "",
        "status": status,
        "target": rel_to(dest_dir, root) if str(dest_dir).startswith(str(root)) else str(dest_dir),
        "dest": str(dest_dir),
        "files": [item["name"] for item in files],
        "folders": folders,
        "fileCount": len([item for item in files if item.get("kind") == "file"]),
        "notes": notes,
        "attachmentCount": len(attachments),
    }


def ledger_path(root: Path) -> Path:
    return ensure_dir(root / "ledger") / ("收件台账-%s.xlsx" % month_tag())


def append_ledger(root: Path, entries: list, dry_run: bool) -> str:
    path = ledger_path(root)
    if dry_run:
        return str(path)
    try:
        from openpyxl import Workbook, load_workbook
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
        from openpyxl.utils import get_column_letter
    except ImportError:
        return ""

    if path.exists():
        workbook = load_workbook(path)
        sheet = workbook["收件台账"] if "收件台账" in workbook.sheetnames else workbook.active
        try:
            sheet.title = "收件台账"
        except Exception:  # noqa: BLE001
            pass
    else:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "收件台账"
        for column, header in enumerate(LEDGER_HEADERS, start=1):
            cell = sheet.cell(row=1, column=column, value=header)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="2F5597")
            cell.alignment = Alignment(horizontal="center", vertical="center")
        widths = [6, 18, 34, 18, 20, 10, 16, 18, 8, 46, 36, 10, 12, 34]
        for column, width in enumerate(widths, start=1):
            sheet.column_dimensions[get_column_letter(column)].width = width
        sheet.freeze_panes = "A2"

    existing = set()
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if row and len(row) >= COL["邮件UID"] and row[COL["邮件UID"] - 1]:
            existing.add(str(row[COL["邮件UID"] - 1]))

    thin = Side(style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    added = 0
    for entry in entries:
        uid = str(entry.get("uid") or "")
        if uid and uid in existing:
            continue
        next_index = sheet.max_row + 1 if sheet.max_row >= 1 else 2
        row_values = [
            next_index - 1,
            entry.get("date") or now_stamp(),
            entry.get("subject"),
            entry.get("sender"),
            entry.get("school") or "未识别",
            entry.get("contact") or "",
            mask_pii(entry.get("phone") or "", {}),
            entry.get("rule") or "未匹配",
            entry.get("attachmentCount") or 0,
            "；".join(entry.get("files") or [])[:900],
            entry.get("target"),
            entry.get("status"),
            uid,
            "；".join(entry.get("notes") or "")[:600],
        ]
        for column, value in enumerate(row_values, start=1):
            cell = sheet.cell(row=next_index, column=column, value=value)
            cell.alignment = Alignment(vertical="top", wrap_text=column in (3, 10, 11, 14))
            cell.border = border
        added += 1
    if added:
        workbook.save(path)
    return str(path)


def write_missing(root: Path, results: list, dry_run: bool) -> str:
    directory = ensure_dir(root / "ledger")
    path = directory / ("缺件清单-%s.md" % month_tag())
    if dry_run:
        return str(path)
    pending = [item for item in results if item.get("status") != "已归档"]
    lines = ["# 缺件 / 待人工清单（%s）" % now_stamp(), ""]
    if not pending:
        lines.append("本轮全部归档完成，无待人工项。")
    else:
        lines.append("| 邮件主题 | 学校 | 规则 | 归档目录 | 待确认原因 |")
        lines.append("| --- | --- | --- | --- | --- |")
        for item in pending:
            lines.append("| %s | %s | %s | %s | %s |" % (
                (item.get("subject") or "").replace("|", "/"),
                item.get("school") or "未识别",
                item.get("rule") or "未匹配",
                item.get("target") or "",
                "；".join(item.get("notes") or [])[:200].replace("|", "/") or "待确认",
            ))
    lines.append("")
    lines.append("> 手机号等敏感信息按规范不落盘；如需联系请回原邮箱查看。")
    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)


def main() -> None:
    root = Path(arg_value(sys.argv, "--root", "D:/dsh-mailbox")).resolve()
    dry_run = has_flag(sys.argv, "--dry-run")
    only_uid = arg_value(sys.argv, "--uid", "")
    limit = int(arg_value(sys.argv, "--limit", "50"))
    config = load_config(root)
    if not root.exists():
        die("工作目录不存在：%s" % root, code="bad-root")
    index = load_index(root)
    if not index:
        json_out({"ok": True, "processed": 0, "organized": 0, "needsHuman": 0,
                  "message": "没有已收取的邮件（先跑 mailbox_scan）", "mails": []})
        return

    def sort_key(item):
        try:
            return int(item.get("uid") or 0)
        except (TypeError, ValueError):
            return 0

    todo = []
    for record in sorted(index, key=sort_key):
        if record.get("status") not in ("fetched", None):
            continue
        if only_uid and str(record.get("uid")) != str(only_uid):
            continue
        todo.append(record)
        if limit > 0 and len(todo) >= limit:
            break

    results = []
    for record in todo:
        result = process_mail(root, config, record, dry_run)
        result["date"] = record.get("date")
        result["sender"] = (record.get("from") or {}).get("name") or (record.get("from") or {}).get("address")
        results.append(result)
        if not dry_run:
            record["status"] = "organized"
            record["organizedAt"] = now_stamp()
            record["target"] = result.get("target")
            record["files"] = result.get("files")
            record["notes"] = result.get("notes")

    ledger = append_ledger(root, results, dry_run)
    missing = write_missing(root, results, dry_run)
    if not dry_run:
        save_index(root, index)
        state = load_state(root)
        state["lastOrganizeAt"] = now_stamp()
        state["lastOrganizeResult"] = {
            "processed": len(results),
            "organized": len([item for item in results if item.get("status") == "已归档"]),
            "needsHuman": len([item for item in results if item.get("status") != "已归档"]),
        }
        save_state(root, state)
        append_log(root, "归档 %d 封（待人工 %d）" % (len(results), state["lastOrganizeResult"]["needsHuman"]))

    json_out({
        "ok": True,
        "dryRun": dry_run,
        "processed": len(results),
        "organized": len([item for item in results if item.get("status") == "已归档"]),
        "needsHuman": len([item for item in results if item.get("status") != "已归档"]),
        "ledger": ledger,
        "missingList": missing,
        "mails": results,
    })


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        die("归档失败：%s" % error, code="organize-crash")
