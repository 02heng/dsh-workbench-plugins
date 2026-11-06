#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""离线自检：不联网，不需要真实邮箱。覆盖脱敏、文件名、GBK 解压、学校/联系人识别、归档落盘、台账。"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mb_common import (  # noqa: E402
    arg_value, json_out, mask_pii, normalize_sep, safe_filename, safe_dirname, save_json,
)
from mail_unpack import extract, is_archive, zip_member_name  # noqa: E402
from mail_organize import (  # noqa: E402
    append_ledger, extract_contact, extract_school, naming_ok, process_mail, write_missing,
)

CHECKS = []


def check(name, passed, detail=""):
    CHECKS.append({"name": name, "pass": bool(passed), "detail": str(detail)[:300]})


def make_gbk_zip(path: Path) -> None:
    """手工写一个真正的 GBK 文件名 zip（flag_bits=0），模拟国内压缩包。"""
    import binascii
    import struct
    entries = [
        ("课例－张三－初中－数学－勾股定理.docx", b"fake-docx-content"),
        ("说明.txt", "解压测试".encode("utf-8")),
    ]
    local, central, offset = b"", b"", 0
    for name, data in entries:
        raw_name = name.encode("gbk")
        crc = binascii.crc32(data) & 0xFFFFFFFF
        size = len(data)
        header = struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0, 0, 0, 0, crc, size, size, len(raw_name), 0)
        local += header + raw_name + data
        central += struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 0, 0, 0, 0, crc, size, size,
                               len(raw_name), 0, 0, 0, 0, 0, offset) + raw_name
        offset += len(header) + len(raw_name) + size
    eocd = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(entries), len(entries), len(central), offset, 0)
    path.write_bytes(local + central + eocd)


def main() -> None:
    mailbox_root = Path(arg_value(sys.argv, "--root", "D:/dsh-mailbox"))
    base = Path(arg_value(sys.argv, "--work", "") or (mailbox_root / "selftest"))
    if base.exists() and arg_value(sys.argv, "--clean", "1") == "1":
        shutil.rmtree(base, ignore_errors=True)
    base.mkdir(parents=True, exist_ok=True)
    root = base / "work"
    (root / "raw" / "20261023" / "1-课间一刻钟").mkdir(parents=True, exist_ok=True)
    attach_dir = root / "raw" / "20261023" / "1-课间一刻钟" / "attachments"
    attach_dir.mkdir(parents=True, exist_ok=True)

    # 1) 隐私脱敏
    masked = mask_pii("联系人：联系人A，手机 13812345678，办公电话 00000000，身份证 110101199001011234")
    check("手机号被隐去", "13812345678" not in masked and "手机号已隐去" in masked, masked)
    check("办公座机保留", "00000000" in masked, masked)
    check("身份证被隐去", "110101199001011234" not in masked, masked)

    # 2) 文件名 / 目录名
    check("非法字符被替换", safe_filename('a/b:c*?"<>|.docx') == "a_b_c______.docx", safe_filename('a/b:c*?"<>|.docx'))
    check("保留名加前缀", safe_filename("CON.txt").startswith("_CON"), safe_filename("CON.txt"))
    check("分隔符归一", normalize_sep("甲—乙＋丙") == "甲－乙－丙", normalize_sep("甲—乙＋丙"))

    # 3) GBK zip 解压
    sample_zip = attach_dir / "课例材料.zip"
    make_gbk_zip(sample_zip)
    check("识别为压缩包", is_archive("a.zip") and is_archive("b.rar") and not is_archive("c.docx"))
    with zipfile.ZipFile(sample_zip) as archive:
        names = [zip_member_name(info) for info in archive.infolist()]
        flags = [info.flag_bits for info in archive.infolist()]
    check("测试 zip 未置 UTF-8 标志", all(flag & 0x800 == 0 for flag in flags), flags)
    check("GBK 文件名解码", any("课例－张三" in name for name in names), names)
    unpacked = extract(sample_zip, root / "tmp" / "unzip", {"maxMB": 100, "maxFiles": 50})
    check("zip 解压成功", len(unpacked["extracted"]) >= 2, unpacked)
    check("GBK 文件落盘", any("勾股定理" in name for name in unpacked["extracted"]), unpacked["extracted"])

    # 4) 学校/联系人识别
    text = "顺义区东风小学报送：课间一刻钟案例。联系人：王芳，办公电话 00000000"
    check("学校识别", extract_school(text) == "顺义区东风小学", extract_school(text))
    contact, phone = extract_contact(text)
    check("联系人识别", contact == "王芳", contact)
    check("座机识别", phone == "00000000", phone)
    check("报送口径判定", naming_ok("东风小学－王芳－小学－数学－认识钟表.docx")
          and not naming_ok("附件1.docx"))

    # 5) 配置 + 归档流水线
    config = {
        "paths": {"archiveRoot": str(base / "档案")},
        "naming": {}, "unpack": {"maxMB": 100, "maxFiles": 100, "flattenSingle": True},
        "pii": {"maskMobile": True, "maskIdCard": True},
        "rules": [{"id": "kjykt", "name": "课间一刻钟", "keywords": ["课间一刻钟"],
                   "target": str(base / "档案" / "2026年" / "10月" / "课间一刻钟"),
                   "bySchool": True, "prefixSchool": True}],
    }
    save_json(root / "config.json", config)
    (root / "raw" / "20261023" / "1-课间一刻钟" / "body.txt").write_text(
        "顺义区东风小学报送课间一刻钟案例。联系人：王芳，办公电话 00000000", encoding="utf-8")
    record = {
        "uid": "1", "date": "2026-10-23 09:00:00",
        "from": {"name": "东风小学 王芳", "address": "wang@example.com"},
        "subject": "课间一刻钟案例报送", "preview": "课间一刻钟", "ruleId": "kjykt",
        "dir": "raw/20261023/1-课间一刻钟", "status": "fetched",
        "attachments": [{"name": "课例材料.zip", "path": "raw/20261023/1-课间一刻钟/attachments/课例材料.zip"}],
    }
    result = process_mail(root, config, record, dry_run=False)
    dest = Path(result["dest"])
    check("归档到学校子目录", dest.name == "顺义区东风小学" and dest.exists(), result["dest"])
    check("状态已归档", result["status"] == "已归档", result["notes"])
    files = [item for item in dest.rglob("*") if item.is_file()]
    check("解压文件落盘", len(files) >= 2, [str(item.relative_to(dest)) for item in files])
    ledger = append_ledger(root, [dict(result, date=record["date"], sender=record["from"]["name"],
                                      attachmentCount=1)], dry_run=False)
    check("台账生成", bool(ledger) and Path(ledger).exists(), ledger)
    missing = write_missing(root, [result], dry_run=False)
    check("缺件清单生成", Path(missing).exists(), missing)

    # 6) 未匹配规则的邮件进待人工
    loose_dir = root / "raw" / "20261023" / "2-随便一封邮件" / "attachments"
    loose_dir.mkdir(parents=True, exist_ok=True)
    (loose_dir / "a.docx").write_bytes(b"fake")
    (loose_dir.parent / "body.txt").write_text("这封信和课例无关，也没有关键词。", encoding="utf-8")
    loose = dict(record, uid="2", subject="随便一封邮件", ruleId=None, preview="这封信与课例无关",
                 dir="raw/20261023/2-随便一封邮件",
                 attachments=[{"name": "a.docx", "path": "raw/20261023/2-随便一封邮件/attachments/a.docx"}])
    loose_result = process_mail(root, config, loose, dry_run=False)
    check("无规则进待人工", "待人工" in loose_result["status"] and "inbox" in loose_result["dest"], loose_result["dest"])

    passed = len([item for item in CHECKS if item["pass"]])
    json_out({
        "ok": passed == len(CHECKS), "passed": passed, "total": len(CHECKS),
        "checks": CHECKS, "workspace": str(root),
    })


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        import traceback
        json_out({"ok": False, "error": str(error), "trace": traceback.format_exc()[-2000:]})
