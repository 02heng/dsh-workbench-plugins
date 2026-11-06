#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""压缩包解压 sidecar：zip（GBK 文件名兜底）、tar/tgz、7z/rar（有 7-Zip 时）。

安全约束：拒绝绝对路径与 .. 穿越；单文件/总大小与文件数上限；嵌套 zip 只展开一层。
"""
from __future__ import annotations

import gzip
import os
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mb_common import (  # noqa: E402
    arg_value, die, ensure_dir, has_flag, json_out, load_config, log, rel_to, safe_filename,
)

ARCHIVE_EXT = {".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".tar.gz"}
SEVEN_ZIP_CANDIDATES = [
    r"C:\Program Files\7-Zip\7z.exe",
    r"C:\Program Files (x86)\7-Zip\7z.exe",
    r"D:\PS-V\7z.exe",
    r"D:\7-Zip\7z.exe",
]


def find_7z():
    for candidate in SEVEN_ZIP_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    found = shutil.which("7z") or shutil.which("7za")
    return found


def is_archive(name) -> bool:
    lower = str(name or "").lower()
    return any(lower.endswith(ext) for ext in ARCHIVE_EXT)


def zip_member_name(info: zipfile.ZipInfo) -> str:
    """zip 规范：未置 UTF-8 标志时名字是 cp437，国内压缩包多为 GBK。"""
    name = info.filename
    if info.flag_bits & 0x800:
        return name
    raw = name.encode("cp437", errors="replace")
    for encoding in ("gbk", "gb18030", "utf-8"):
        try:
            decoded = raw.decode(encoding)
            if decoded.strip():
                return decoded
        except UnicodeDecodeError:
            continue
    return name


def safe_join(base: Path, name: str) -> Path | None:
    cleaned = str(name or "").replace("\\", "/").lstrip("/")
    parts = [part for part in cleaned.split("/") if part not in ("", ".", "..")]
    if not parts:
        return None
    target = base.joinpath(*parts)
    try:
        target.resolve().relative_to(base.resolve())
    except Exception:  # noqa: BLE001
        return None
    return target


def extract_zip(path: Path, dest: Path, opts: dict) -> dict:
    extracted, warnings = [], []
    max_bytes = int(opts.get("maxMB") or 800) * 1024 * 1024
    max_files = int(opts.get("maxFiles") or 600)
    total = 0
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            if len(extracted) >= max_files:
                warnings.append("文件数超过上限 %d，其余未解压" % max_files)
                break
            name = zip_member_name(info)
            if name.startswith("__MACOSX/") or "/." in name or name.startswith("."):
                continue
            target = safe_join(dest, name)
            if target is None:
                warnings.append("跳过可疑路径：%s" % name)
                continue
            if not opts.get("keepStructure", True):
                target = dest / safe_filename(Path(name).name, "file")
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                index = 2
                while True:
                    candidate = target.with_name("%s(%d)%s" % (target.stem, index, target.suffix))
                    if not candidate.exists():
                        target = candidate
                        break
                    index += 1
            try:
                with archive.open(info) as source, open(target, "wb") as handle:
                    shutil.copyfileobj(source, handle, 1024 * 256)
                size = target.stat().st_size
                total += size
                if total > max_bytes:
                    warnings.append("解压总量超过 %dMB，已停止" % int(max_bytes / 1024 / 1024))
                    break
                extracted.append(rel_to(target, dest))
            except Exception as error:  # noqa: BLE001
                warnings.append("解压失败 %s：%s" % (name, error))
    return {"extracted": extracted, "warnings": warnings, "method": "zipfile"}


def extract_tar(path: Path, dest: Path, opts: dict) -> dict:
    extracted, warnings = [], []
    try:
        with tarfile.open(path) as archive:
            for member in archive.getmembers():
                if not member.isfile():
                    continue
                target = safe_join(dest, member.name)
                if target is None:
                    warnings.append("跳过可疑路径：%s" % member.name)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    continue
                with open(target, "wb") as handle:
                    shutil.copyfileobj(source, handle)
                extracted.append(rel_to(target, dest))
    except Exception as error:  # noqa: BLE001
        warnings.append("tar 解压失败：%s" % error)
    return {"extracted": extracted, "warnings": warnings, "method": "tarfile"}


def extract_gzip(path: Path, dest: Path, opts: dict) -> dict:
    name = path.name[:-3] if path.name.lower().endswith(".gz") else path.stem
    target = dest / safe_filename(name, "file")
    try:
        with gzip.open(path, "rb") as source, open(target, "wb") as handle:
            shutil.copyfileobj(source, handle)
        return {"extracted": [rel_to(target, dest)], "warnings": [], "method": "gzip"}
    except Exception as error:  # noqa: BLE001
        return {"extracted": [], "warnings": ["gz 解压失败：%s" % error], "method": "gzip"}


def extract_7z(path: Path, dest: Path, opts: dict) -> dict:
    binary = find_7z()
    if not binary:
        return {"extracted": [], "warnings": ["本机未安装 7-Zip，无法解压 %s" % path.suffix], "method": "none"}
    command = [binary, "x", "-y", "-o%s" % dest, str(path)]
    try:
        result = subprocess.run(command, capture_output=True, timeout=300)
        if result.returncode != 0:
            return {"extracted": [], "warnings": ["7z 解压失败：%s" % result.stderr.decode("utf-8", "replace")[:300]], "method": "7z"}
        files = [rel_to(item, dest) for item in dest.rglob("*") if item.is_file()]
        return {"extracted": files, "warnings": [], "method": "7z"}
    except Exception as error:  # noqa: BLE001
        return {"extracted": [], "warnings": ["7z 解压失败：%s" % error], "method": "7z"}


def extract(path, dest, opts=None) -> dict:
    path = Path(path)
    dest = Path(dest)
    opts = opts or {}
    if not path.exists():
        return {"extracted": [], "warnings": ["文件不存在：%s" % path], "method": "none"}
    if dest.exists():
        index = 2
        while True:
            candidate = dest.with_name("%s(%d)" % (dest.name, index))
            if not candidate.exists():
                dest = candidate
                break
            index += 1
    ensure_dir(dest)
    lower = path.name.lower()
    if lower.endswith(".zip"):
        try:
            return extract_zip(path, dest, opts)
        except zipfile.BadZipFile:
            return {"extracted": [], "warnings": ["压缩包损坏或不是 zip：%s" % path.name], "method": "zipfile"}
    if lower.endswith((".tar", ".tgz", ".tar.gz", ".tar.bz2", ".tar.xz")):
        return extract_tar(path, dest, opts)
    if lower.endswith(".gz"):
        return extract_gzip(path, dest, opts)
    if find_7z():
        return extract_7z(path, dest, opts)
    return {"extracted": [], "warnings": ["本机没有 7-Zip，无法解压 %s" % path.name], "method": "none"}


def main() -> None:
    root = Path(arg_value(sys.argv, "--root", "D:/dsh-mailbox")).resolve()
    config = load_config(root)
    archive = arg_value(sys.argv, "--archive")
    if not archive:
        die("需要 --archive 参数", code="bad-args")
    dest = arg_value(sys.argv, "--dest") or str(root / "tmp" / Path(archive).stem)
    result = extract(archive, dest, config.get("unpack") or {})
    result["ok"] = True
    result["dest"] = str(dest)
    json_out(result)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        die("解压失败：%s" % error, code="unpack-crash")
