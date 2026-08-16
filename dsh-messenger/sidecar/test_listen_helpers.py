import os
import sys

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
listen.on_message(Obj(sender="", content="漏网", type="text"), Obj(who="别人"))
listen.on_message(Obj(sender="别人", content="旁路", type="text"), Obj(who="别人"))
listen.on_message(Obj(sender="黄山", content="串台", type="text"), Obj(who="别人"))
inbounds = [body for path, _method, body in posts if path == listen.INBOUND]
check(inbounds == [], f"foreign inbound {inbounds}")

listen.on_message(Obj(sender="黄山", content="你好", type="text"), Obj(who="黄山"))
inbounds = [body for path, _method, body in posts if path == listen.INBOUND]
check(len(inbounds) == 1 and inbounds[0].get("from") == "黄山", f"huangshan inbound {inbounds}")
check(inbounds[0].get("text") == "你好", f"inbound text {inbounds}")

qt_windows = [
    {"title": "微信", "cls": "Qt51514QWindowIcon", "visible": True},
]
check(weixin_render_hint(qt_windows) == QT_SHELL_HINT, "qt shell hint")
check(weixin_render_hint([{"title": "微信", "cls": "mmui::MainWindow", "visible": True}]) is None, "mmui no hint")
check(
    "Qt 加速渲染" in explain_connect_error("未找到已登录的客户端主窗口", qt_windows),
    "explain qt",
)

print("PASS listen-helpers")
