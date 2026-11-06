#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""批量发信 sidecar（默认干跑）。计划文件 JSON：
{
  "subject": "关于开展……的通知", "body": "各学校：\n……", "attachments": ["D:/a.pdf"],
  "recipients": [{"to": "a@b.com", "name": "某某", "fields": {"学校": "××小学"}}]
}
干跑输出回执草稿（ledger/发信回执-*.md），--send 才真正投递。
"""
from __future__ import annotations

import json
import os
import smtplib
import sys
import time
from email.message import EmailMessage
from email.utils import formataddr, formatdate
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mb_common import (  # noqa: E402
    append_log, arg_value, die, ensure_dir, has_flag, json_out, load_config, load_secret,
    month_tag, now_stamp, safe_filename,
)


class SafeDict(dict):
    def __missing__(self, key):
        return "{%s}" % key


def render(template: str, context: dict) -> str:
    try:
        return str(template or "").format_map(SafeDict(context or {}))
    except Exception:  # noqa: BLE001
        return str(template or "")


def load_plan(path: Path) -> dict:
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() in (".json", ""):
        return json.loads(text)
    raise ValueError("目前只支持 JSON 计划文件：%s" % path)


def write_receipt(root: Path, plan: dict, results: list, sent: bool) -> str:
    directory = ensure_dir(root / "ledger")
    path = directory / ("发信回执-%s.md" % month_tag())
    lines = ["# 批量发信回执（%s）" % now_stamp(), "",
             "- 模式：%s" % ("已投递" if sent else "干跑（未投递）"),
             "- 主题：%s" % plan.get("subject", ""),
             "- 收件人数：%d" % len(results), "",
             "| 收件人 | 邮箱 | 结果 | 备注 |", "| --- | --- | --- | --- |"]
    for item in results:
        lines.append("| %s | %s | %s | %s |" % (
            item.get("name", ""), item.get("to", ""), item.get("status", ""), item.get("error", "")))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(path)


def main() -> None:
    root = Path(arg_value(sys.argv, "--root", "D:/dsh-mailbox")).resolve()
    plan_path = arg_value(sys.argv, "--plan")
    dry_run = not has_flag(sys.argv, "--send")
    limit = int(arg_value(sys.argv, "--limit", "80"))
    if not plan_path:
        die("需要 --plan 计划文件", code="bad-args")
    plan = load_plan(Path(plan_path).resolve())
    recipients = plan.get("recipients") or []
    if not isinstance(recipients, list) or not recipients:
        die("计划文件里没有 recipients", code="bad-plan")
    recipients = recipients[:limit]
    config = load_config(root)
    secret = load_secret(root)
    mailbox = config.get("mailbox") or {}
    sender = mailbox.get("address") or ""
    password = secret.get("password") or ""

    attachments = [Path(item) for item in (plan.get("attachments") or [])]
    missing = [str(item) for item in attachments if not item.exists()]
    if missing:
        die("附件不存在：%s" % "、".join(missing), code="missing-attachment")

    results, errors = [], []
    smtp = None
    if not dry_run:
        if not sender or not password:
            die("尚未配置邮箱地址或授权码", code="not-configured")
        host = mailbox.get("smtpHost") or "smtp.126.com"
        port = int(mailbox.get("smtpPort") or 465)
        try:
            smtp = smtplib.SMTP_SSL(host, port, timeout=30)
            smtp.login(sender, password)
        except Exception as error:  # noqa: BLE001
            die("SMTP 登录失败 %s:%s -> %s" % (host, port, error), code="smtp-login")

    for recipient in recipients:
        to = str(recipient.get("to") or "").strip()
        name = str(recipient.get("name") or "").strip()
        fields = dict(recipient.get("fields") or {})
        fields.setdefault("学校", fields.get("学校") or name)
        item = {"to": to, "name": name, "status": "成功" if not dry_run else "干跑", "error": ""}
        if not to or "@" not in to:
            item.update({"status": "跳过", "error": "邮箱为空或格式不对"})
            results.append(item)
            continue
        message = EmailMessage()
        message["From"] = formataddr(("顺义区智慧教育发展促进中心", sender))
        message["To"] = formataddr((name, to)) if name else to
        message["Subject"] = render(plan.get("subject", ""), fields)
        message["Date"] = formatdate(localtime=True)
        message.set_content(render(plan.get("body", ""), fields))
        for attachment in attachments:
            data = attachment.read_bytes()
            message.add_attachment(data, maintype="application", subtype="octet-stream",
                                   filename=safe_filename(attachment.name, "attachment"))
        if dry_run:
            results.append(item)
            continue
        try:
            smtp.send_message(message)
            time.sleep(1.2)
        except Exception as error:  # noqa: BLE001
            item.update({"status": "失败", "error": str(error)[:200]})
            errors.append({"to": to, "error": str(error)[:200]})
        results.append(item)

    if smtp is not None:
        try:
            smtp.quit()
        except Exception:  # noqa: BLE001
            pass
    receipt = write_receipt(root, plan, results, sent=not dry_run)
    append_log(root, "批量发信 %d 封（dry-run=%s）" % (len(results), dry_run))
    json_out({
        "ok": True, "dryRun": dry_run, "count": len(results),
        "sent": len([item for item in results if item.get("status") == "成功"]),
        "failed": errors, "receipt": receipt,
        "preview": [{"to": item["to"], "subject": render(plan.get("subject", ""), dict(item, **{"学校": item.get("name", "")}))}
                    for item in results[:5]],
    })


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        die("发信失败：%s" % error, code="send-crash")
