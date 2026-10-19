import inspect
import os
import sys
import tempfile
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import listen
from listen_helpers import (
    QT_SHELL_HINT,
    explain_connect_error,
    inbound_allowed,
    is_self,
    listen_ok,
    require_opened,
    require_send_ok,
    weixin_render_hint,
)


class Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class WxResp(dict):
    def __init__(self, status, message=""):
        super().__init__(status=status, message=message, data=None)

    @property
    def is_success(self):
        return self["status"] == "成功"

    def __bool__(self):
        return self.is_success


def check(cond, msg):
    if not cond:
        raise SystemExit(f"FAIL {msg}")


check(listen_ok(False) is False, "false")
check(listen_ok(True) is True, "true")
check(listen_ok(None) is False, "none must not auto-succeed")
check(listen_ok(WxResp("失败", "找不到会话")) is False, "WxResponse 失败")
check(listen_ok(WxResp("错误", "未登录")) is False, "WxResponse 错误")
check(listen_ok(WxResp("成功")) is True, "WxResponse 成功")
check(listen_ok({"status": "失败"}) is False, "dict 失败")
check(listen_ok({"status": "错误"}) is False, "dict 错误")
check(listen_ok({"status": "fail"}) is False, "dict fail")
check(listen_ok({"status": "error"}) is False, "dict error")
check(listen_ok({"status": "成功"}) is True, "dict 成功")
check(listen_ok(Obj(is_success=False, status="失败")) is False, "is_success false")
check(listen_ok(Obj(is_success=True, status="成功")) is True, "is_success true")

try:
    require_opened(WxResp("失败", "no chat"), "黄山")
except RuntimeError as exc:
    check("黄山" in str(exc), f"ChatWith raise text {exc}")
else:
    raise SystemExit("FAIL ChatWith must raise on 失败")

check(is_self(Obj(attr="self")) is True, "self attr")
check(is_self(Obj(attr="friend", type="text")) is False, "friend")


class SelfMsg:
    pass


check(is_self(SelfMsg()) is True, "Self* type")

contact = "黄山"
check(inbound_allowed(Obj(sender=""), Obj(who="黄山"), contact) is False, "empty sender")
check(inbound_allowed(Obj(sender="别人"), Obj(who="别人"), contact) is False, "other chat")
check(inbound_allowed(Obj(sender="黄山"), Obj(who="别人"), contact) is False, "sender 黄山 other chat")
check(inbound_allowed(Obj(sender="黄山"), Obj(who="黄山"), contact) is True, "huangshan chat")
check(inbound_allowed(Obj(sender_remark="黄山", sender="x"), Obj(who="黄山"), contact) is True, "remark")


class Host:
    def AddListenChat(self, *_a, **_k):
        return True


check(inbound_allowed(Obj(sender="黄山"), Host(), contact) is True, "poll host bound 黄山")
check(inbound_allowed(Obj(sender="别人"), Host(), contact) is False, "poll host other sender")
check(inbound_allowed(Obj(sender=""), Host(), contact) is False, "poll host empty sender")

try:
    require_send_ok({"status": "失败", "message": "boom"}, "SendMsg")
except RuntimeError as exc:
    check("SendMsg" in str(exc), f"send raise {exc}")
else:
    raise SystemExit("FAIL SendMsg must raise on 失败")

posts = []

def fake_request(path, method="GET", body=None):
    posts.append((path, method, body))
    if path == listen.OUTBOX:
        return [{"id": "j1", "text": "hi", "to": "黄山"}]
    return {}

listen.request = fake_request


class FailWx:
    def SendMsg(self, text, to):
        return {"status": "失败", "message": "boom"}

    def SendFiles(self, path, to):
        return {"status": "错误", "message": "no file"}


listen.drain_outbox(FailWx())
acks = [body for path, _method, body in posts if path == listen.ACK]
check(len(acks) == 1 and acks[0].get("ok") is False, f"ack fail {acks}")
check("error" in acks[0], f"ack error field {acks}")

posts.clear()


class OkWx:
    def SendMsg(self, text, to):
        return {"status": "成功"}


listen.drain_outbox(OkWx())
acks = [body for path, _method, body in posts if path == listen.ACK]
check(len(acks) == 1 and acks[0].get("ok") is True, f"ack ok {acks}")

posts.clear()
shot_calls = []
file_calls = []
orig_shot = listen.send_screenshot
orig_file = listen.send_file
listen.send_screenshot = lambda to, text="": shot_calls.append((to, text))
listen.send_file = lambda path, text="", to=None: file_calls.append((path, text, to))


def fake_image_job(path, method="GET", body=None):
    posts.append((path, method, body))
    if path == listen.OUTBOX:
        return [{
            "id": "j-img-file",
            "type": "image",
            "file": r"D:\dsh-workbench\messenger\shots\T-0817-03.png",
            "text": "任务 T-0817-03 已完成",
            "to": "黄山",
        }]
    return {}


listen.request = fake_image_job
listen.drain_outbox()
listen.send_screenshot = orig_shot
listen.send_file = orig_file
check(file_calls and not shot_calls, f"image with file must use send_file {file_calls} {shot_calls}")
check("pace()" in inspect.getsource(listen.drain_outbox), "outbox jobs must pace")

posts.clear()
sleeps = []
orig_sleep = listen.time.sleep
listen.time.sleep = lambda s: sleeps.append(s)

def fake_two_jobs(path, method="GET", body=None):
    posts.append((path, method, body))
    if path == listen.OUTBOX:
        return [
            {"id": "j-doc", "file": r"D:\a\报告.docx", "to": "黄山"},
            {"id": "j-shot", "type": "image", "file": r"D:\a\回图.png", "text": "任务 T-1 已完成", "to": "黄山"},
        ]
    return {}

listen.request = fake_two_jobs
listen.send_file = lambda path, text="", to=None: file_calls.append((path, text, to))
file_calls.clear()
listen.drain_outbox()
listen.time.sleep = orig_sleep
listen.send_file = orig_file
check(sleeps.count(listen.SEND_PAUSE) >= 1, f"300ms between outbox jobs {sleeps}")
check(len(file_calls) == 2, f"two jobs sent {file_calls}")
acks = [body for path, _method, body in posts if path == listen.ACK]
check(len(acks) == 2 and all(a.get("ok") is True for a in acks), f"ack two jobs {acks}")

posts.clear()
file_calls.clear()
boom_calls = []

def boom_file(path, text="", to=None):
    boom_calls.append(path)
    raise listen.SendError("boom")

def fake_stop_jobs(path, method="GET", body=None):
    posts.append((path, method, body))
    if path == listen.OUTBOX:
        return [
            {"id": "j-stop-1", "file": r"D:\a\一.docx", "to": "黄山"},
            {"id": "j-stop-2", "file": r"D:\a\二.xlsx", "to": "黄山"},
        ]
    return {}

listen.request = fake_stop_jobs
listen.send_file = boom_file
listen.drain_outbox()
listen.send_file = orig_file
check(len(boom_calls) == 1, f"must stop after first send fail {boom_calls}")
stop_acks = [body for path, _method, body in posts if path == listen.ACK]
check(len(stop_acks) == 1 and stop_acks[0].get("ok") is False, f"only first job acked {stop_acks}")

posts.clear()
listen.on_message(Obj(sender="", content="漏网", type="text"), Obj(who="别人"))
listen.on_message(Obj(sender="别人", content="旁路", type="text"), Obj(who="别人"))
listen.on_message(Obj(sender="黄山", content="串台", type="text"), Obj(who="别人"))
inbounds = [body for path, _method, body in posts if path == listen.INBOUND]
check(inbounds == [], f"foreign inbound {inbounds}")

listen.on_message(Obj(sender="黄山", content="你好", type="text"), Obj(who="黄山"))
inbounds = [body for path, _method, body in posts if path == listen.INBOUND]
check(len(inbounds) == 1 and inbounds[0].get("from") == "黄山", f"huangshan inbound {inbounds}")
check(inbounds[0].get("text") == "你好", f"inbound text {inbounds}")
check(listen.on_message({"content": "任务: 再发", "kind": "text", "sort_seq": 9}, contact="黄山") is True, "dict inbound ok")

def boom_inbound(path, method="GET", body=None):
    raise OSError("proxy refused")

listen.request = boom_inbound
check(listen.on_message({"content": "任务: 丢了", "kind": "text", "sort_seq": 10}, contact="黄山") is False, "inbound fail must retry")
listen.request = fake_request

from weixin_db import load_cursor, save_cursor
from weixin_inbox import WeixinInbox
import weixin_inbox as inbox_mod

td = Path(tempfile.mkdtemp())
cursor_path = str(td / "wx-cursor.json")
old_cursor = inbox_mod.CURSOR_PATH
inbox_mod.CURSOR_PATH = cursor_path
box = WeixinInbox.__new__(WeixinInbox)
box.contact = "黄山"
box.username = "wxid_h"
box.cursor = 10
box._raw_messages = lambda since: [{
    "sort_seq": 21,
    "real_sender_id": 2,
    "content": "任务: 本机绿气泡",
    "local_type": 1,
}]
fresh = box.poll()
check(len(fresh) == 1 and fresh[0]["sort_seq"] == 21, f"poll rows {fresh}")
check(box.cursor == 10, "poll must not advance memory cursor")
check(load_cursor(cursor_path, "黄山") is None, "poll must not persist cursor")
again = box.poll()
check(len(again) == 1, "failed inbound must see the same message again")
box.mark_seen(21)
check(box.cursor == 21, "mark_seen advances")
check(load_cursor(cursor_path, "黄山") == 21, "mark_seen persists")
inbox_mod.CURSOR_PATH = old_cursor

qt_windows = [
    {"title": "微信", "cls": "Qt51514QWindowIcon", "visible": True},
]
check(weixin_render_hint(qt_windows) == QT_SHELL_HINT, "qt shell hint")
check(weixin_render_hint([{"title": "微信", "cls": "mmui::MainWindow", "visible": True}]) is None, "mmui no hint")
check(
    "Qt 加速渲染" in explain_connect_error("未找到已登录的客户端主窗口", qt_windows),
    "explain qt",
)

proxy_urls = [getattr(h, "proxies", None) for h in listen._OPENER.handlers if getattr(h, "proxies", None)]
check(not proxy_urls, "dsh requests skip HTTP_PROXY")
check("HTTP_PROXY" not in os.environ and "http_proxy" not in os.environ, "env proxy stripped")

print("PASS listen-helpers")
