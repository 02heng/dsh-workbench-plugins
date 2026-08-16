import json
import os
import sys
import time
import traceback
import urllib.error
import urllib.request

from listen_helpers import CONTACT, inbound_allowed, is_self, require_send_ok
from weixin_inbox import WeixinInbox
from weixin_keys import redact
from weixin_send import SendError, send_file, send_screenshot, send_text

BASE = os.environ.get("DSH_MESSENGER", "http://127.0.0.1:3080").rstrip("/")
INBOUND = "/plugins/dsh-messenger/wx/inbound"
HEALTH = "/plugins/dsh-messenger/wx/health"
OUTBOX = "/plugins/dsh-messenger/wx/outbox"
ACK = "/plugins/dsh-messenger/wx/outbox/ack"


def log(msg):
    print(msg, flush=True)


def request(path, method="GET", body=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"} if data is not None else {},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def post_health(ok, error=None):
    payload = {"ok": bool(ok)}
    if error:
        payload["error"] = str(error)
    try:
        request(HEALTH, "POST", payload)
    except Exception as exc:
        log(f"health 上报失败: {exc}")


def msg_kind(msg):
    kind = str(getattr(msg, "type", "") or "text").lower()
    if kind in ("text", "quote"):
        return "text"
    if kind == "image":
        return "image"
    if kind == "file":
        return "file"
    return "other"


def on_message(msg, chat=None):
    try:
        if isinstance(msg, dict):
            payload = {
                "from": CONTACT,
                "text": str(msg.get("content") or ""),
                "kind": msg.get("kind") or "text",
            }
        else:
            if is_self(msg):
                return
            if not inbound_allowed(msg, chat, CONTACT):
                return
            payload = {
                "from": CONTACT,
                "text": str(getattr(msg, "content", "") or ""),
                "kind": msg_kind(msg),
            }
        request(INBOUND, "POST", payload)
    except Exception as exc:
        log(f"inbound 失败: {redact(exc)}")


def msg_id(msg):
    return str(getattr(msg, "id", "") or getattr(msg, "hash", "") or f"{getattr(msg, 'content', '')}-{id(msg)}")


def snapshot_ids(wx):
    ids = set()
    try:
        for msg in wx.GetAllMessage() or []:
            ids.add(msg_id(msg))
    except Exception as exc:
        log(f"snapshot 失败: {exc}")
    return ids


def poll_new(wx, seen):
    try:
        msgs = wx.GetAllMessage() or []
    except Exception as exc:
        log(f"GetAllMessage 失败: {exc}")
        return
    for msg in msgs:
        mid = msg_id(msg)
        if mid in seen:
            continue
        seen.add(mid)
        on_message(msg, wx)


def list_weixin_windows():
    rows = []
    try:
        import win32gui
        import win32process
        import psutil
    except Exception:
        return rows

    def walk(hwnd, acc):
        title = win32gui.GetWindowText(hwnd) or ""
        cls = win32gui.GetClassName(hwnd) or ""
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            name = psutil.Process(pid).name()
        except Exception:
            return
        if name.lower() not in ("weixin.exe", "wechat.exe"):
            return
        acc.append({
            "title": title,
            "cls": cls,
            "visible": bool(win32gui.IsWindowVisible(hwnd)),
        })

    try:
        win32gui.EnumWindows(lambda hwnd, acc: walk(hwnd, acc) or True, rows)
    except Exception:
        return rows
    return rows


def connect():
    return WeixinInbox(CONTACT).bind()


def drain_outbox(wx=None, inbox=None):
    try:
        jobs = request(OUTBOX, "GET")
    except Exception as exc:
        log(f"outbox 拉取失败: {redact(exc)}")
        return
    if not isinstance(jobs, list):
        return
    for job in jobs:
        job_id = job.get("id")
        try:
            to = job.get("to") or CONTACT
            file_path = job.get("file")
            text = job.get("text") or ""
            before = inbox.latest_seq() if inbox is not None else None
            if wx is not None and (hasattr(wx, "SendFiles") or hasattr(wx, "SendMsg")):
                if job.get("type") == "image" or file_path:
                    require_send_ok(wx.SendFiles(file_path, to), "SendFiles")
                    if text:
                        require_send_ok(wx.SendMsg(text, to), "SendMsg")
                else:
                    require_send_ok(wx.SendMsg(text, to), "SendMsg")
            elif job.get("type") == "image":
                send_screenshot(to, text)
            elif file_path:
                send_file(file_path, text, to)
            else:
                send_text(text, to)
            if inbox is not None and not inbox.wait_new(before, timeout=12):
                raise SendError("微信会话里没有出现新消息，未发出")
            request(ACK, "POST", {"id": job_id, "ok": True})
        except Exception as exc:
            log(f"outbox 发送失败 {job_id}: {redact(exc)}")
            try:
                request(ACK, "POST", {"id": job_id, "ok": False, "error": redact(exc)})
            except Exception as ack_exc:
                log(f"outbox ack 失败: {redact(ack_exc)}")


def main():
    while True:
        box = None
        try:
            box = connect()
            log(f"已监听 {CONTACT} mode=db")
            post_health(True)
            while True:
                drain_outbox(inbox=box)
                for msg in box.poll():
                    on_message(msg)
                time.sleep(2)
        except Exception as exc:
            err = redact(exc)
            log(f"未登录或找不到{CONTACT}: {err}")
            post_health(False, err)
            time.sleep(10)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
