import os

CONTACT = os.environ.get("DSH_WX_CONTACT", "黄山")
QT_SHELL_HINT = (
	"微信窗口开着，但当前是 Qt 加速渲染（Qt51514QWindowIcon），"
	"里面没有 mmui 主窗口，wxauto4 认不到会话列表。"
	"请完全退出微信（托盘也退出），再用软件渲染启动："
	"set QT_OPENGL=software && set QT_QUICK_BACKEND=software && start \"\" \"D:\\Weixin\\Weixin.exe\""
	" 登录后把主窗口留在前台（不要只留独立聊天小窗），再点「开始监听」。"
)
_FAIL_STATUS = frozenset({"失败", "错误", "fail", "failed", "error", "false", "0"})
_OK_STATUS = frozenset({"成功", "success", "ok", "true", "1"})


def listen_ok(result):
    if result is False or result is None:
        return False
    is_success = getattr(result, "is_success", None)
    if callable(is_success):
        return bool(is_success())
    if isinstance(is_success, bool):
        return is_success
    status = None
    if isinstance(result, dict):
        status = result.get("status")
        if status is None and "ok" in result:
            return bool(result.get("ok"))
    else:
        status = getattr(result, "status", None)
    if status is not None:
        token = str(status).strip().lower()
        if token in _FAIL_STATUS:
            return False
        if token in _OK_STATUS:
            return True
    return bool(result)


def require_opened(result, contact=None):
    contact = contact or CONTACT
    if not listen_ok(result):
        raise RuntimeError(f"找不到{contact}: {result}")
    return result


def is_self(msg):
    attr = str(getattr(msg, "attr", "") or "").lower()
    kind = str(getattr(msg, "type", "") or "").lower()
    if attr == "self" or kind == "self":
        return True
    return type(msg).__name__.lower().startswith("self")


def chat_name(chat):
    for key in ("who", "nickname", "name", "chat_name"):
        value = getattr(chat, key, None)
        if value:
            return str(value)
    return str(chat)


def sender_name(msg):
    return str(getattr(msg, "sender_remark", "") or getattr(msg, "sender", "") or "").strip()


def inbound_allowed(msg, chat, contact=None):
    contact = contact or CONTACT
    sender = sender_name(msg)
    name = chat_name(chat)
    if not sender:
        return False
    if sender != contact:
        return False
    if name == contact:
        return True
    return hasattr(chat, "AddListenChat")


def require_send_ok(result, action):
    if not listen_ok(result):
        raise RuntimeError(f"{action} 失败: {result}")
    return result


def weixin_render_hint(windows):
    visible = [row for row in windows if row.get("visible") and "微信" in str(row.get("title") or "")]
    if not visible:
        return None
    classes = [str(row.get("cls") or "") for row in windows]
    if any(cls == "mmui::MainWindow" for cls in classes):
        return None
    if any("Qt51514" in cls for cls in classes):
        return QT_SHELL_HINT
    return None


def explain_connect_error(exc, windows=None):
    raw = str(exc) or ""
    if "未找到已登录的客户端主窗口" not in raw:
        return raw
    hint = weixin_render_hint(windows or [])
    return hint or raw
