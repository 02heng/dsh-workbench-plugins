#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""dsh-mailbox 公共工具：路径、JSON 契约、隐私脱敏、文件名清洗、文本清洗。"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

APP_NAME = "dsh-mailbox"
WINDOWS_RESERVED = {"con", "prn", "aux", "nul"} | {f"com{i}" for i in range(1, 10)} | {f"lpt{i}" for i in range(1, 10)}
ILLEGAL = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
MOBILE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
IDCARD = re.compile(r"(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)")
BANKCARD = re.compile(r"(?<!\d)\d{16,19}(?!\d)")
SEP = re.compile(r"\s*[－—–＋+]\s*")


def json_out(payload: dict) -> None:
    """sidecar 契约：最后一行输出 JSON，退出码 0。"""
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def die(message: str, **extra) -> "NoReturn":  # type: ignore[valid-type]
    payload = {"ok": False, "error": str(message)}
    payload.update(extra)
    json_out(payload)
    sys.exit(2)


def log(message: str) -> None:
    sys.stderr.write("[mailbox] " + str(message) + "\n")
    sys.stderr.flush()


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8-sig") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default
    except Exception as error:  # noqa: BLE001
        log("读取 JSON 失败 %s: %s" % (path, error))
        return default


def save_json(path, payload) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp-%d" % os.getpid())
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def mask_pii(text, config=None) -> str:
    """敏感信息红线：手机号/身份证/银行卡一律脱敏，办公座机保留。"""
    if not text:
        return text or ""
    cfg = (config or {}).get("pii", {}) if isinstance(config, dict) else {}
    out = str(text)
    if cfg.get("maskIdCard", True):
        out = IDCARD.sub("【身份证号已隐去】", out)
        out = BANKCARD.sub("【卡号已隐去】", out)
    if cfg.get("maskMobile", True):
        out = MOBILE.sub("【手机号已隐去】", out)
    return out


def safe_filename(name, fallback="file", max_length=90) -> str:
    text = (name or "").strip().replace("\u3000", " ")
    text = ILLEGAL.sub("_", text).strip(" .")
    if not text:
        text = fallback
    stem, dot, ext = text.rpartition(".")
    if not dot:
        stem, ext = text, ""
    if stem.lower() in WINDOWS_RESERVED:
        stem = "_" + stem
    if len(stem) + len(ext) > max_length:
        keep = max(1, max_length - len(ext))
        stem = stem[:keep]
    return stem + ("." + ext if ext else "")


def safe_dirname(name, fallback="未命名", max_length=80) -> str:
    text = ILLEGAL.sub("_", (name or "").replace("\u3000", " ")).strip(" .")
    text = re.sub(r"\s+", " ", text)
    if not text:
        text = fallback
    return text[:max_length].strip(" .") or fallback


def normalize_sep(name) -> str:
    """把「-／—／+」等分隔符统一成全角「－」，便于按报送三处口径排版。"""
    return SEP.sub("－", (name or "").strip())


def human_size(num) -> str:
    try:
        value = float(num)
    except (TypeError, ValueError):
        return "?"
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return ("%.0f%s" if unit == "B" else "%.1f%s") % (value, unit)
        value /= 1024.0
    return "%.1fGB" % value


def ensure_dir(path) -> Path:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return target


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem, ext = path.stem, path.suffix
    index = 2
    while True:
        candidate = path.with_name("%s (%d)%s" % (stem, index, ext))
        if not candidate.exists():
            return candidate
        index += 1


def rel_to(path, base) -> str:
    try:
        return Path(path).relative_to(Path(base)).as_posix()
    except Exception:  # noqa: BLE001
        return str(path)


def now_stamp() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def today_tag() -> str:
    return time.strftime("%Y%m%d")


def month_tag(when=None) -> str:
    return time.strftime("%Y-%m", when or time.localtime())


def arg_value(argv, flag, default=None):
    if flag in argv:
        index = argv.index(flag)
        if index + 1 < len(argv):
            return argv[index + 1]
    return default


def has_flag(argv, flag) -> bool:
    return flag in argv


def load_config(root) -> dict:
    config = load_json(Path(root) / "config.json", {})
    return config if isinstance(config, dict) else {}


def load_secret(root) -> dict:
    secret = load_json(Path(root) / "secret.json", {})
    return secret if isinstance(secret, dict) else {}


def load_state(root) -> dict:
    state = load_json(Path(root) / "state.json", {})
    return state if isinstance(state, dict) else {}


def save_state(root, state) -> None:
    save_json(Path(root) / "state.json", state)


def append_log(root, text) -> None:
    try:
        directory = ensure_dir(Path(root) / "logs")
        with open(directory / "mailbox.log", "a", encoding="utf-8") as handle:
            handle.write("%s %s\n" % (now_stamp(), text))
    except Exception:  # noqa: BLE001
        pass
