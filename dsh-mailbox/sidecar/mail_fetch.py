#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""IMAP 收信 sidecar：连接/自检 → 拉取新邮件 → 落 raw/ → 写 index.json。

用法：
  python mail_fetch.py --root D:/dsh-mailbox [--limit 40] [--test] [--since-date 2026-10-01] [--all]
输出：最后一行 JSON（ok/mode/...）。
"""
from __future__ import annotations

import email
import email.policy
import imaplib
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mb_common import (  # noqa: E402
    append_log, arg_value, die, ensure_dir, has_flag, human_size, json_out, load_config,
    load_secret, load_state, log, mask_pii, now_stamp, rel_to, safe_dirname, safe_filename,
    save_json, save_state, today_tag,
)

imaplib.Commands.setdefault("ID", ("NONAUTH", "AUTH", "SELECTED"))


def decode_mime(value) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(str(value))))
    except Exception:  # noqa: BLE001
        return str(value)


def html_to_text(html: str) -> str:
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html or "")
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<")
            .replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'"))
    text = re.sub(r"[ \t\u3000]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


def body_parts(message):
    plain, html = [], []
    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get("Content-Disposition", "").lower().startswith("attachment"):
            continue
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html"):
            continue
        try:
            payload = part.get_payload(decode=True) or b""
            charset = part.get_content_charset() or "utf-8"
            try:
                text = payload.decode(charset, errors="replace")
            except LookupError:
                text = payload.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        (plain if ctype == "text/plain" else html).append(text)
    if plain:
        return "\n".join(plain).strip()
    if html:
        return html_to_text("\n".join(html))
    return ""


def message_date(message) -> str:
    raw = message.get("Date")
    if not raw:
        return now_stamp()
    try:
        from email.utils import parsedate_to_datetime
        moment = parsedate_to_datetime(raw)
        if moment.tzinfo is not None:
            moment = moment.astimezone().replace(tzinfo=None)
        return moment.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:  # noqa: BLE001
        return str(raw)[:40]


def sender_of(message) -> dict:
    name = decode_mime(message.get("From", ""))
    address = ""
    match = re.search(r"<([^>]+)>", name)
    if match:
        address = match.group(1).strip()
        name = name[:match.start()].strip().strip('"')
    else:
        match = re.search(r"[\w.+-]+@[\w.-]+", name)
        if match:
            address = match.group(0)
    return {"name": name or address, "address": address}


def rule_match(config, subject, body, sender_name) -> dict | None:
    rules = config.get("rules") or []
    text = (subject or "") + "\n" + (body or "")[:4000]
    best = None
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("enabled") is False:
            continue
        keywords = [str(item) for item in (rule.get("keywords") or []) if str(item).strip()]
        sender_keywords = [str(item) for item in (rule.get("senderKeywords") or []) if str(item).strip()]
        if not keywords and not sender_keywords:
            continue
        hit = next((kw for kw in keywords if kw in text), None)
        if hit is None and sender_keywords:
            hit = next((kw for kw in sender_keywords if kw in (sender_name or "")), None)
        if hit is None:
            continue
        score = len(hit)
        if best is None or score > best[0]:
            best = (score, rule, hit)
    if best is None:
        return None
    return {"id": best[1].get("id"), "name": best[1].get("name") or best[1].get("id"), "hit": best[2]}


def connect(config, secret):
    address = (config.get("mailbox") or {}).get("address") or ""
    password = secret.get("password") or ""
    if not address or not password:
        die("尚未配置邮箱地址或授权码，请先在网页工作台填写", code="not-configured")
    host = (config.get("mailbox") or {}).get("imapHost") or "imap.126.com"
    port = int((config.get("mailbox") or {}).get("imapPort") or 993)
    try:
        client = imaplib.IMAP4_SSL(host, port, timeout=30)
    except Exception as error:  # noqa: BLE001
        die("连接 IMAP 失败 %s:%s -> %s" % (host, port, error), code="imap-connect")
    try:
        client.login(address, password)
    except imaplib.IMAP4.error as error:
        die("登录失败（126 需要「客户端授权码」，不是登录密码）：%s" % error, code="imap-login")
    try:  # 网易系邮箱需要 ID 命令，否则会报 Unsafe Login
        client.xatom("ID", '("name" "dsh-mailbox" "version" "0.1.0" "vendor" "dsh")')
    except Exception as error:  # noqa: BLE001
        log("IMAP ID 命令失败（不致命）：%s" % error)
    return client


def ensure_index(root: Path) -> list:
    index_path = root / "raw" / "index.json"
    data = load_index(root)
    if not index_path.exists():
        save_json(index_path, data)
    return data


def load_index(root: Path) -> list:
    data = load_index_file(root / "raw" / "index.json")
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("mails"), list):
        return data["mails"]
    return []


def load_index_file(path: Path):
    from mb_common import load_json
    return load_json(path, [])


def save_index(root: Path, mails: list) -> None:
    save_json(root / "raw" / "index.json", {"version": 1, "updatedAt": now_stamp(), "mails": mails})


def fetch_one(client, uid: bytes, config, root: Path) -> dict | None:
    status, data = client.uid("fetch", uid, "(RFC822)")
    if status != "OK" or not data or not isinstance(data[0], tuple):
        return None
    raw = data[0][1]
    message = email.message_from_bytes(raw, policy=email.policy.default)
    subject = decode_mime(message.get("Subject", "")) or "(无主题)"
    sender = sender_of(message)
    when = message_date(message)
    body = body_parts(message)
    uid_text = uid.decode() if isinstance(uid, bytes) else str(uid)
    folder_name = safe_dirname("%s-%s" % (uid_text, subject), "mail")
    day = today_tag()
    mail_dir = ensure_dir(root / "raw" / day / folder_name)
    (mail_dir / "mail.eml").write_bytes(raw)
    (mail_dir / "body.txt").write_text(mask_pii(body, config), encoding="utf-8")

    attachments = []
    attach_dir = ensure_dir(mail_dir / "attachments")
    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue
        filename = part.get_filename()
        disposition = (part.get("Content-Disposition") or "").lower()
        if not filename and not disposition.startswith("attachment"):
            continue
        filename = decode_mime(filename) if filename else "attachment-%d" % (len(attachments) + 1)
        payload = part.get_payload(decode=True) or b""
        if not payload:
            continue
        target = attach_dir / safe_filename(filename, "attachment-%d" % (len(attachments) + 1))
        if target.exists():
            target = target.with_name("%s(%d)%s" % (target.stem, len(attachments) + 1, target.suffix))
        target.write_bytes(payload)
        attachments.append({
            "name": target.name,
            "path": rel_to(target, root),
            "size": len(payload),
            "sizeText": human_size(len(payload)),
        })

    rule = rule_match(config, subject, body, sender["name"])
    record = {
        "uid": uid_text,
        "date": when,
        "from": sender,
        "subject": subject,
        "preview": mask_pii(re.sub(r"\s+", " ", body)[:300], config),
        "dir": rel_to(mail_dir, root),
        "attachments": attachments,
        "ruleId": (rule or {}).get("id"),
        "ruleName": (rule or {}).get("name"),
        "status": "fetched",
        "fetchedAt": now_stamp(),
    }
    return record


def main() -> None:
    root = Path(arg_value(sys.argv, "--root", "D:/dsh-mailbox")).resolve()
    limit = int(arg_value(sys.argv, "--limit", "40"))
    test_only = has_flag(sys.argv, "--test")
    want_all = has_flag(sys.argv, "--all")
    since_date = arg_value(sys.argv, "--since-date", "")
    folder = arg_value(sys.argv, "--folder", "")

    config = load_config(root)
    secret = load_secret(root)
    mailbox = config.get("mailbox") or {}
    box = folder or mailbox.get("folder") or "INBOX"

    client = connect(config, secret)
    try:
        status, data = client.select(box, readonly=False)
        if status != "OK":
            die("选择邮箱文件夹失败：%s" % (data,), code="select")
        status, data = client.uid("search", None, "ALL")
        uids = [item for item in (data[0].split() if data and data[0] else []) if item]
        if test_only:
            json_out({
                "ok": True, "mode": "test", "connected": True, "folder": box,
                "address": mailbox.get("address"), "totalMessages": len(uids),
                "host": mailbox.get("imapHost"), "port": mailbox.get("imapPort"),
                "sampleSubjects": [
                    decode_mime(email.message_from_bytes(raw[1]).get("Subject", ""))
                    for raw in [client.uid("fetch", uids[-1], "(RFC822)")[1][0]] if uids
                ],
            })
            return

        state = load_state(root)
        imap_state = state.get("imap") or {}
        last_uid = int(imap_state.get("lastUid") or 0)
        max_uid = max([int(item) for item in uids] or [0])
        first_run = last_uid <= 0

        candidates = [item for item in uids if int(item) > last_uid]
        if first_run and not want_all:
            window_days = int(mailbox.get("firstRunDays") or 7)
            cutoff = datetime.now() - timedelta(days=window_days)
            status, since_data = client.uid(
                "search", None, "SINCE", cutoff.strftime("%d-%b-%Y")
            )
            recent = set(item for item in (since_data[0].split() if since_data and since_data[0] else []))
            candidates = [item for item in candidates if item in recent]
        if since_date:
            try:
                moment = datetime.strptime(since_date, "%Y-%m-%d")
                status, since_data = client.uid("search", None, "SINCE", moment.strftime("%d-%b-%Y"))
                recent = set(item for item in (since_data[0].split() if since_data and since_data[0] else []))
                candidates = [item for item in candidates if item in recent]
            except ValueError:
                log("忽略非法 --since-date：%s" % since_date)

        skipped = 0
        if limit > 0 and len(candidates) > limit:
            skipped = len(candidates) - limit
            candidates = candidates[-limit:]

        index = load_index(root)
        known = {str(item.get("uid")) for item in index if isinstance(item, dict)}
        new_records = []
        errors = []
        for uid in candidates:
            uid_text = uid.decode() if isinstance(uid, bytes) else str(uid)
            if uid_text in known:
                continue
            try:
                record = fetch_one(client, uid, config, root)
                if record is None:
                    errors.append({"uid": uid_text, "error": "拉取失败"})
                    continue
                new_records.append(record)
                if mailbox.get("markSeen", True):
                    try:
                        client.uid("store", uid, "+FLAGS", "(\\Seen)")
                    except Exception:  # noqa: BLE001
                        pass
            except Exception as error:  # noqa: BLE001
                errors.append({"uid": uid_text, "error": str(error)})

        index.extend(new_records)
        save_index(root, index)

        state["imap"] = {"lastUid": max_uid, "folder": box, "updatedAt": now_stamp()}
        state["lastFetchAt"] = now_stamp()
        save_state(root, state)
        append_log(root, "收信 %d 封（候选 %d，跳过旧信 %d）" % (len(new_records), len(candidates), skipped))

        json_out({
            "ok": True, "mode": "fetch", "root": str(root), "folder": box,
            "totalMessages": len(uids), "newCount": len(new_records),
            "skippedBacklog": skipped, "lastUid": max_uid,
            "mails": new_records, "errors": errors,
            "note": ("首次收信只处理最近 %d 天，历史邮件未动；需要补收请用 --all 或 --since-date。" % int(mailbox.get("firstRunDays") or 7)) if first_run and not want_all else "",
        })
    finally:
        try:
            client.logout()
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        die("收信失败：%s" % error, code="fetch-crash")
