import ctypes
import json
import os
import subprocess
import sys
import time

CONTACT = os.environ.get("DSH_WX_CONTACT", "黄山")
CREATE_NEW_CONSOLE = 0x00000010
OFFICE_EXTS = {".docx", ".xlsx", ".pdf"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp"}
ZIP_EXTS = {".zip", ".7z", ".rar", ".tar", ".gz"}
SEND_PAUSE = 0.3


def pace():
    time.sleep(SEND_PAUSE)


class SendError(RuntimeError):
    pass


HIGH_IL = "S-1-16-12288"
MEDIUM_IL = "S-1-16-8192"
ELEVATED_WX = "微信在用管理员权限跑，点不了输入框也贴不进文件。请退出微信，用普通方式再打开（不要右键管理员运行）。"


def integrity_sid(pid):
    import win32api
    import win32con
    import win32security

    handle = win32api.OpenProcess(0x1000, False, int(pid))
    token = win32security.OpenProcessToken(handle, win32con.TOKEN_QUERY)
    sid, _unused = win32security.GetTokenInformation(token, win32security.TokenIntegrityLevel)
    return win32security.ConvertSidToStringSid(sid)


def is_elevated_sid(sid):
    return str(sid or "") == HIGH_IL


def weixin_is_elevated():
    import psutil

    for proc in psutil.process_iter(["pid", "name"]):
        if not is_weixin_name(proc.info.get("name")):
            continue
        try:
            if is_elevated_sid(integrity_sid(proc.info["pid"])):
                return True
        except Exception:
            continue
    return False


def assert_can_drive_weixin():
    try:
        self_sid = integrity_sid(os.getpid())
    except Exception:
        self_sid = MEDIUM_IL
    if weixin_is_elevated() and not is_elevated_sid(self_sid):
        raise SendError(ELEVATED_WX)


def assert_sendable(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in ZIP_EXTS:
        raise SendError("不发送压缩包，只发 docx / pdf / xlsx")
    if ext in OFFICE_EXTS or ext in IMAGE_EXTS:
        return ext
    raise SendError("只发送 docx / pdf / xlsx")


def score_window(row):
    if not is_weixin_name(row.get("exe")):
        return -1
    title = str(row.get("title") or "")
    cls = str(row.get("cls") or "")
    if "Tray" in cls:
        return -1
    titled = "微信" in title or "weixin" in title.lower() or "wechat" in title.lower()
    if not titled:
        return -1
    width = max(int(row.get("w") or 0), 1)
    height = max(int(row.get("h") or 0), 1)
    if width < 400 or height < 300:
        if not row.get("visible") and not row.get("iconic"):
            return -1
    score = width * height
    if "Qt" in cls:
        score += 1000
    if row.get("visible"):
        # 可见窗口必须压过任何隐藏的幽灵窗口，否则点击会打进看不见的窗口
        score += 100_000_000
    if row.get("iconic"):
        score += 100
    if width >= 800 and height >= 600:
        score += 1_000_000
    return score


def is_weixin_name(name):
    return str(name or "").lower() in ("weixin.exe", "wechat.exe")


def pick_main_window(windows):
    ranked = []
    for row in windows:
        points = score_window(row)
        if points < 0:
            continue
        ranked.append((points, row))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked[0][1]


def open_ok(opened_name, contact=None):
    contact = contact or CONTACT
    if str(opened_name or "").strip() != contact:
        raise SendError(f"搜索对不上{contact}，未发送")
    return True


def list_windows():
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
        visible = bool(win32gui.IsWindowVisible(hwnd))
        if not visible and not ("微信" in title and "Qt" in cls):
            return
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            proc = psutil.Process(pid)
            name = proc.name()
        except Exception:
            return
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        acc.append({
            "hwnd": hwnd,
            "exe": name,
            "visible": visible,
            "iconic": bool(win32gui.IsIconic(hwnd)),
            "w": max(0, right - left),
            "h": max(0, bottom - top),
            "title": title,
            "cls": cls,
        })

    try:
        win32gui.EnumWindows(lambda hwnd, acc: walk(hwnd, acc) or True, rows)
    except Exception:
        return rows
    return rows


TRAY_WX = "微信收在托盘里，唤不出主窗，没法发送。请把微信主窗口打开一次再试。"


def is_tray_hidden(row):
    if not row:
        return True
    if row.get("iconic"):
        return False
    if not row.get("visible"):
        return True
    return int(row.get("w") or 0) < 400 or int(row.get("h") or 0) < 300


def _window_row(hwnd):
    for row in list_windows():
        if int(row.get("hwnd") or 0) == int(hwnd):
            return row
    return {"hwnd": hwnd, "visible": False, "iconic": False, "w": 0, "h": 0}


def _click_tray_weixin():
    names = ("微信", "Weixin", "WeChat")
    if _click_tray_uia(names):
        return True
    return _click_tray_overflow_then_icon(names)


def _click_tray_uia(names):
    try:
        import uiautomation as auto
        import win32gui
    except Exception:
        return False
    overflow_names = ("显示隐藏的图标", "Show hidden icons", "通知折叠")
    try:
        for title in overflow_names:
            btn = auto.ButtonControl(Name=title, searchDepth=8)
            if btn.Exists(0.2):
                btn.Click()
                time.sleep(0.35)
                break
        handles = []
        for cls in (
            "NotifyIconOverflowWindow",
            "TopLevelWindowForOverflowXamlIsland",
            "Shell_TrayWnd",
        ):
            hwnd = win32gui.FindWindow(cls, None)
            if hwnd:
                handles.append(hwnd)
        roots = []
        for hwnd in handles:
            try:
                roots.append(auto.ControlFromHandle(int(hwnd)))
            except Exception:
                continue
        for root in roots:
            if _click_named_weixin(root, names, depth=0):
                time.sleep(0.4)
                return True
    except Exception:
        return False
    return False


def _click_named_weixin(ctrl, names, depth):
    if depth > 8 or ctrl is None:
        return False
    try:
        name = str(ctrl.Name or "")
        ctype = str(ctrl.ControlTypeName or "")
        if any(token in name for token in names) and ctype in (
            "ButtonControl",
            "ListItemControl",
            "MenuItemControl",
            "PaneControl",
            "TextControl",
        ):
            ctrl.Click()
            return True
        for child in ctrl.GetChildren():
            if _click_named_weixin(child, names, depth + 1):
                return True
    except Exception:
        return False
    return False


def _click_tray_overflow_then_icon(names):
    # 找不到托盘图标就停，绝不 ShowWindow 硬拉隐藏主窗
    return False


def _focus_visible(hwnd):
    import win32api
    import win32con
    import win32gui
    import win32process

    hwnd = int(hwnd)
    cur_tid = win32api.GetCurrentThreadId()
    fg = win32gui.GetForegroundWindow()
    fg_tid = win32process.GetWindowThreadProcessId(fg)[0] if fg else 0
    tgt_tid = win32process.GetWindowThreadProcessId(hwnd)[0]
    attached = []
    try:
        for tid in (fg_tid, tgt_tid):
            if tid and tid != cur_tid:
                if ctypes.windll.user32.AttachThreadInput(cur_tid, tid, True):
                    attached.append(tid)
        win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
        try:
            win32gui.BringWindowToTop(hwnd)
            win32gui.SetForegroundWindow(hwnd)
        except Exception:
            pass
        finally:
            win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
    finally:
        for tid in attached:
            ctypes.windll.user32.AttachThreadInput(cur_tid, tid, False)


def _wake(hwnd, row=None):
    import win32con
    import win32gui

    row = row or _window_row(hwnd)
    if is_tray_hidden(row):
        _click_tray_weixin()
        return
    if row.get("iconic"):
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        except Exception:
            pass
    _focus_visible(hwnd)


def _window_ready(hwnd):
    import win32gui

    try:
        return bool(win32gui.IsWindowVisible(hwnd)) and not win32gui.IsIconic(hwnd) and not _is_offscreen(hwnd)
    except Exception:
        return False


def _show(hwnd, timeout=8):
    deadline = time.time() + timeout
    while True:
        if _window_ready(hwnd) and _hwnd_foreground(hwnd):
            time.sleep(0.2)
            return
        if time.time() >= deadline:
            raise SendError(TRAY_WX)
        _wake(hwnd)
        time.sleep(0.6)


def _focus(hwnd):
    _show(hwnd)


def _is_offscreen(hwnd):
    import win32gui
    left, top, right, bottom = win32gui.GetWindowRect(hwnd)
    return right - left < 400 or bottom - top < 300 or left < -10000


def _hwnd_foreground(hwnd):
    try:
        import win32gui
        fg = win32gui.GetForegroundWindow()
        if not fg:
            return False
        if int(fg) == int(hwnd):
            return True
        root = win32gui.GetAncestor(fg, 2)
        return int(root) == int(hwnd)
    except Exception:
        return False


def _foreground_is_weixin():
    try:
        import win32gui
        import win32process
        import psutil
        fg = win32gui.GetForegroundWindow()
        if not fg:
            return False
        _, pid = win32process.GetWindowThreadProcessId(fg)
        return is_weixin_name(psutil.Process(pid).name())
    except Exception:
        return False


class DROPFILES(ctypes.Structure):
    _fields_ = [
        ("pFiles", ctypes.c_uint),
        ("x", ctypes.c_long),
        ("y", ctypes.c_long),
        ("fNC", ctypes.c_int),
        ("fWide", ctypes.c_bool),
    ]


def input_box_point(width, height, from_bottom=48):
    width = int(width)
    height = int(height)
    if width < 400 or height < 300:
        raise SendError("微信窗口太小，点不到输入框")
    chat_left = min(320, int(width * 0.36))
    return chat_left + max(40, (width - chat_left) // 2), height - int(from_bottom)


def file_button_point(width, height):
    width = int(width)
    height = int(height)
    if width < 400 or height < 300:
        raise SendError("微信窗口太小，点不到发文件按钮")
    chat_left = min(320, int(width * 0.36))
    return chat_left + 88, height - 44


def screenshot_button_point(width, height):
    x, y = file_button_point(width, height)
    return x + 40, y


def send_button_point(width, height):
    width = int(width)
    height = int(height)
    if width < 400 or height < 300:
        raise SendError("微信窗口太小，点不到发送")
    return width - 52, height - 28


def pack_hdrop(paths):
    files = ("\0".join(os.path.abspath(p) for p in paths)).replace("/", "\\")
    data = files.encode("U16")[2:] + b"\0\0\0\0"
    drop = DROPFILES()
    drop.pFiles = ctypes.sizeof(DROPFILES)
    drop.fWide = True
    return bytes(drop) + data


def _post_click_client(hwnd, x, y):
    import win32api
    import win32con
    import win32gui

    lparam = win32api.MAKELONG(int(x), int(y))
    try:
        win32gui.SendMessage(hwnd, win32con.WM_MOUSEACTIVATE, hwnd, lparam)
        win32gui.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
        time.sleep(0.04)
        win32gui.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)
    except Exception:
        pass


def _click_screen(x, y):
    import win32api
    import win32con

    x, y = int(x), int(y)
    sw = max(win32api.GetSystemMetrics(0), 1)
    sh = max(win32api.GetSystemMetrics(1), 1)
    nx = int(x * 65535 / sw)
    ny = int(y * 65535 / sh)
    try:
        win32api.SetCursorPos((x, y))
    except Exception:
        pass
    move = win32con.MOUSEEVENTF_MOVE | win32con.MOUSEEVENTF_ABSOLUTE
    win32api.mouse_event(move, nx, ny, 0, 0)
    time.sleep(0.03)
    win32api.mouse_event(win32con.MOUSEEVENTF_ABSOLUTE | win32con.MOUSEEVENTF_LEFTDOWN, nx, ny, 0, 0)
    time.sleep(0.05)
    win32api.mouse_event(win32con.MOUSEEVENTF_ABSOLUTE | win32con.MOUSEEVENTF_LEFTUP, nx, ny, 0, 0)


def _click_client_point(hwnd, x, y):
    import win32gui

    _post_click_client(hwnd, x, y)
    sx, sy = win32gui.ClientToScreen(hwnd, (int(x), int(y)))
    _click_screen(sx, sy)
    time.sleep(0.12)


def _click_input(hwnd):
    import win32gui

    left, top, right, bottom = win32gui.GetClientRect(hwnd)
    x, y = input_box_point(right - left, bottom - top, 48)
    _click_client_point(hwnd, x, y)


def _click_file_button(hwnd):
    import win32gui

    left, top, right, bottom = win32gui.GetClientRect(hwnd)
    x, y = file_button_point(right - left, bottom - top)
    _click_client_point(hwnd, x, y)


def _click_screenshot_button(hwnd):
    import win32gui

    left, top, right, bottom = win32gui.GetClientRect(hwnd)
    x, y = screenshot_button_point(right - left, bottom - top)
    _click_client_point(hwnd, x, y)


def _click_send(hwnd):
    import win32gui

    left, top, right, bottom = win32gui.GetClientRect(hwnd)
    x, y = send_button_point(right - left, bottom - top)
    _click_client_point(hwnd, x, y)


def _drag_screen(x1, y1, x2, y2):
    import win32api
    import win32con

    sw = max(win32api.GetSystemMetrics(0), 1)
    sh = max(win32api.GetSystemMetrics(1), 1)

    def abs_pos(x, y):
        return int(int(x) * 65535 / sw), int(int(y) * 65535 / sh)

    nx1, ny1 = abs_pos(x1, y1)
    nx2, ny2 = abs_pos(x2, y2)
    try:
        win32api.SetCursorPos((int(x1), int(y1)))
    except Exception:
        pass
    move = win32con.MOUSEEVENTF_MOVE | win32con.MOUSEEVENTF_ABSOLUTE
    win32api.mouse_event(move, nx1, ny1, 0, 0)
    time.sleep(0.05)
    win32api.mouse_event(win32con.MOUSEEVENTF_ABSOLUTE | win32con.MOUSEEVENTF_LEFTDOWN, nx1, ny1, 0, 0)
    time.sleep(0.08)
    win32api.mouse_event(move, nx2, ny2, 0, 0)
    try:
        win32api.SetCursorPos((int(x2), int(y2)))
    except Exception:
        pass
    time.sleep(0.08)
    win32api.mouse_event(win32con.MOUSEEVENTF_ABSOLUTE | win32con.MOUSEEVENTF_LEFTUP, nx2, ny2, 0, 0)


def _capture_weixin_shot(already_open=False):
    import win32api
    import win32con

    if not already_open:
        _hotkey([win32con.VK_MENU], ord("A"))
    overlay = _find_shot_overlay(3)
    if not overlay:
        raise SendError("没有出现微信截图层")
    sw = max(win32api.GetSystemMetrics(0), 1)
    sh = max(win32api.GetSystemMetrics(1), 1)
    x1, y1, x2, y2 = 80, 80, sw - 80, sh - 120
    _drag_screen(x1, y1, x2, y2)
    time.sleep(0.35)
    cx, cy = find_shot_confirm(x2, y2)
    _click_screen(cx, cy)
    time.sleep(0.35)
    if _find_shot_overlay(0.2):
        _click_screen(x2 - 35, y2 + 40)
        time.sleep(0.25)
    time.sleep(0.25)


def _post_key(hwnd, vk, down=True):
    import win32con
    import win32gui

    msg = win32con.WM_KEYDOWN if down else win32con.WM_KEYUP
    scan = 0x1C if vk == win32con.VK_RETURN else 0
    lparam = 1 | (scan << 16)
    if not down:
        lparam |= 1 << 30 | 1 << 31
    try:
        win32gui.PostMessage(hwnd, msg, vk, lparam)
    except Exception:
        pass


def _hotkey(mods, vk):
    import win32api
    import win32con

    for mod in mods:
        win32api.keybd_event(mod, 0, 0, 0)
    win32api.keybd_event(vk, 0, 0, 0)
    win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
    for mod in reversed(mods):
        win32api.keybd_event(mod, 0, win32con.KEYEVENTF_KEYUP, 0)


def _send_keys_to_edit(hwnd, keys):
    import win32con

    if not _hwnd_foreground(hwnd):
        _wake(hwnd)
        time.sleep(0.2)
    if not _hwnd_foreground(hwnd):
        raise SendError("按键前微信不在前台，会发到别的窗口")
    for key in keys:
        if key == "ctrl+a":
            _hotkey([win32con.VK_CONTROL], ord("A"))
        elif key == "ctrl+v":
            _hotkey([win32con.VK_CONTROL], ord("V"))
        elif key == "enter":
            _hotkey([], win32con.VK_RETURN)
        time.sleep(0.05)


def _clip_text(text):
    import win32clipboard
    import win32con

    deadline = time.time() + 10
    last = None
    while time.time() < deadline:
        try:
            win32clipboard.OpenClipboard()
            try:
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardData(win32con.CF_UNICODETEXT, text)
                return
            finally:
                win32clipboard.CloseClipboard()
        except Exception as exc:
            last = exc
            time.sleep(0.1)
    raise SendError(f"设置剪贴板超时：{last}")


def set_clipboard_files(paths):
    import win32clipboard

    for path in paths:
        if not os.path.exists(path):
            raise SendError(f"文件不存在：{path}")
    payload = pack_hdrop(paths)
    deadline = time.time() + 10
    last = None
    while time.time() < deadline:
        try:
            win32clipboard.OpenClipboard()
            try:
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardData(win32clipboard.CF_HDROP, payload)
                return
            finally:
                win32clipboard.CloseClipboard()
        except Exception as exc:
            last = exc
            time.sleep(0.1)
    raise SendError(f"设置剪贴板文件超时：{last}")


def _paste_into_edit(hwnd):
    import win32con
    import win32gui

    _click_input(hwnd)
    pace()
    _send_keys_to_edit(hwnd, ["ctrl+v"])
    try:
        win32gui.PostMessage(hwnd, win32con.WM_PASTE, 0, 0)
    except Exception:
        pass
    time.sleep(0.45)
    pace()
    _send_keys_to_edit(hwnd, ["enter"])
    pace()


def shot_confirm_from_image(img, x2, y2):
    width, height = img.size
    hits = []
    top = max(0, int(y2) + 20)
    bottom = min(height, int(y2) + 80)
    left = max(0, int(x2) - 80)
    right = min(width, int(x2) + 20)
    for y in range(top, bottom):
        for x in range(left, right):
            red, green, blue = img.getpixel((x, y))[:3]
            if red < 80 and 140 < green < 230 and 70 < blue < 160 and green > red + 50:
                hits.append((x, y))
    if len(hits) < 10:
        return int(x2) - 35, int(y2) + 40
    return sum(p[0] for p in hits) // len(hits), sum(p[1] for p in hits) // len(hits)


def _save_clipboard_image(path):
    try:
        from PIL import ImageGrab
    except ImportError as exc:
        raise SendError("没有 Pillow，存不了截图") from exc
    image = ImageGrab.grabclipboard()
    if image is None:
        raise SendError("微信截图没有进剪贴板")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.convert("RGB").save(path)


def find_shot_confirm(x2, y2):
    try:
        from PIL import ImageGrab
        return shot_confirm_from_image(ImageGrab.grab(all_screens=True).convert("RGB"), x2, y2)
    except Exception:
        return int(x2) - 35, int(y2) + 40


def is_shot_overlay(title, cls, width, height):
    title = str(title or "")
    cls = str(cls or "")
    return "Qt" in cls and title == "Weixin" and int(width) >= 1600 and int(height) >= 900


def _find_shot_overlay(timeout=3):
    import win32gui

    deadline = time.time() + timeout
    while time.time() < deadline:
        found = []

        def walk(hwnd, acc):
            if not win32gui.IsWindowVisible(hwnd):
                return
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
            if is_shot_overlay(
                win32gui.GetWindowText(hwnd),
                win32gui.GetClassName(hwnd),
                right - left,
                bottom - top,
            ):
                acc.append(hwnd)

        try:
            win32gui.EnumWindows(lambda hwnd, acc: walk(hwnd, acc) or True, found)
        except Exception:
            found = []
        if found:
            return found[0]
        time.sleep(0.1)
    return None


def is_file_dialog(title, cls):
    title = str(title or "")
    cls = str(cls or "")
    if cls != "#32770":
        return False
    return "打开" in title or "选择文件" in title or title in ("Open", "打开文件")


def _find_open_dialog(timeout=4):
    import win32gui

    deadline = time.time() + timeout
    while time.time() < deadline:
        found = []

        def walk(hwnd, acc):
            if not win32gui.IsWindowVisible(hwnd):
                return
            title = win32gui.GetWindowText(hwnd) or ""
            cls = win32gui.GetClassName(hwnd) or ""
            if is_file_dialog(title, cls):
                acc.append(hwnd)

        try:
            win32gui.EnumWindows(lambda hwnd, acc: walk(hwnd, acc) or True, found)
        except Exception:
            found = []
        if found:
            return found[0]
        time.sleep(0.2)
    return None


def _set_dialog_path(dlg, path):
    import win32con
    import win32gui

    edit = win32gui.FindWindowEx(dlg, 0, "Edit", None)
    if not edit:
        combo = win32gui.FindWindowEx(dlg, 0, "ComboBoxEx32", None)
        box = win32gui.FindWindowEx(combo, 0, "ComboBox", None) if combo else 0
        edit = win32gui.FindWindowEx(box, 0, "Edit", None) if box else 0
    if not edit:
        raise SendError("选文件框没有路径栏")
    win32gui.SendMessage(edit, win32con.WM_SETTEXT, 0, path)
    time.sleep(0.2)
    win32gui.SendMessage(dlg, win32con.WM_COMMAND, 1, 0)
    time.sleep(0.4)


def _close_open_dialogs():
    import win32con
    import win32gui

    for _unused in range(4):
        dlg = _find_open_dialog(0.05)
        if not dlg:
            return
        try:
            win32gui.PostMessage(dlg, win32con.WM_CLOSE, 0, 0)
        except Exception:
            pass
        _hotkey([], win32con.VK_ESCAPE)
        time.sleep(0.25)


def _wait_dialog_gone(timeout=4):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _find_open_dialog(0.05) is None:
            return True
        time.sleep(0.1)
    return False


def _press_send(hwnd):
    _click_input(hwnd)
    pace()
    _send_keys_to_edit(hwnd, ["enter"])
    pace()


def _send_via_file_dialog(hwnd, path):
    if not _hwnd_foreground(hwnd):
        _wake(hwnd)
        time.sleep(0.3)
    _close_open_dialogs()
    _click_file_button(hwnd)
    dlg = _find_open_dialog(4)
    if not dlg:
        raise SendError("没有出现微信选文件框")
    _set_dialog_path(dlg, path)
    if not _wait_dialog_gone(4):
        _close_open_dialogs()
        raise SendError("微信选文件框没有关掉")
    pace()
    _press_send(hwnd)


def open_contact(contact=None, timeout=10):
    contact = contact or CONTACT
    assert_can_drive_weixin()
    deadline = time.time() + timeout
    woke = False
    hit = None
    while True:
        # 托盘唤醒可能换出新的主窗句柄，每一轮都重新找一遍
        hit = pick_main_window(list_windows())
        if hit and _window_ready(hit["hwnd"]) and _hwnd_foreground(hit["hwnd"]):
            # 刚从托盘唤出来的窗口界面还没画完，点早了会丢点击
            time.sleep(1.2 if woke else 0.2)
            open_ok(contact, contact)
            return hit
        if time.time() >= deadline:
            raise SendError(TRAY_WX if hit else "找不到微信主窗")
        if hit:
            _wake(hit["hwnd"], hit)
            woke = True
        time.sleep(0.6)


def _open_inbox(contact):
    try:
        from weixin_inbox import WeixinInbox
        return WeixinInbox(contact).bind()
    except Exception:
        return None


def _paste_and_confirm(hwnd, contact, file_path=None):
    box = _open_inbox(contact)
    if box is None:
        raise SendError("没法核对微信是否发出，未发送")
    try:
        before = box.latest_seq()
    except Exception as exc:
        raise SendError(f"没法核对微信是否发出，未发送：{exc}") from exc
    _paste_into_edit(hwnd)
    for attempt in range(3):
        if box.wait_new(before, timeout=12):
            return True
        if file_path and attempt >= 1:
            _send_via_file_dialog(hwnd, file_path)
        else:
            _click_input(hwnd)
            pace()
            _send_keys_to_edit(hwnd, ["enter"])
            pace()
            _click_send(hwnd)
            pace()
    raise SendError("内容粘进了输入框但没送出去，微信没收到")


def _must_drop_integrity():
    try:
        return is_elevated_sid(integrity_sid(os.getpid()))
    except Exception:
        return False


def _as_child():
    return os.environ.get("DSH_WX_SEND_CHILD") == "1"


def _result_path():
    return os.environ.get("DSH_WX_SEND_RESULT") or ""


def _write_result(text):
    path = _result_path()
    if not path:
        return
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def _spawn(args):
    result_path = os.path.join(
        r"D:\dsh-workbench\messenger",
        f"wx-send-{os.getpid()}-{int(time.time() * 1000)}.txt",
    )
    try:
        os.remove(result_path)
    except OSError:
        pass
    env = os.environ.copy()
    env["DSH_WX_SEND_CHILD"] = "1"
    env["DSH_WX_SEND_RESULT"] = result_path
    env["PYTHONIOENCODING"] = "utf-8"
    script = os.path.abspath(__file__)
    pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    runner = pythonw if os.path.exists(pythonw) else sys.executable
    job_path = result_path[:-4] + ".json"
    bat_path = result_path[:-4] + ".bat"
    with open(job_path, "w", encoding="utf-8") as fh:
        json.dump({"args": args, "result": result_path}, fh, ensure_ascii=False)
    with open(bat_path, "w", encoding="ascii") as fh:
        fh.write(
            "@echo off\r\n"
            "set DSH_WX_SEND_CHILD=1\r\n"
            f"set DSH_WX_SEND_RESULT={result_path}\r\n"
            "set PYTHONIOENCODING=utf-8\r\n"
            f"{subprocess.list2cmdline([runner, script, '--job', job_path])}\r\n"
        )
    task = "DshMessengerWxSend"
    created = subprocess.run(
        ["schtasks", "/Create", "/TN", task, "/TR", bat_path, "/SC", "ONCE", "/ST", "23:59", "/F", "/IT", "/RL", "LIMITED"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if created.returncode != 0:
        cmdline = "start \"\" " + subprocess.list2cmdline([runner, script, *args])
        subprocess.Popen(cmdline, shell=True, env=env, cwd=os.path.dirname(script))
    else:
        subprocess.run(
            ["schtasks", "/Run", "/TN", task],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    deadline = time.time() + 50
    while time.time() < deadline:
        if os.path.exists(result_path):
            with open(result_path, encoding="utf-8") as fh:
                text = fh.read().strip()
            try:
                os.remove(result_path)
            except OSError:
                pass
            if text == "OK" or text.startswith("OK"):
                return True
            raise SendError(text[4:] if text.startswith("ERR ") else (text or "发送失败"))
        time.sleep(0.2)
    raise SendError("发送进程没有回执")


def send_text(text, contact=None):
    contact = contact or CONTACT
    if not _as_child() and _must_drop_integrity():
        return _spawn(["--text", text or "", "--to", contact])
    hit = open_contact(contact)
    _clip_text(text or "")
    _paste_and_confirm(hit["hwnd"], contact)
    return True


def send_screenshot(contact=None, text=""):
    contact = contact or CONTACT
    if not _as_child() and _must_drop_integrity():
        args = ["--shot", "--to", contact]
        if text:
            args.extend(["--text", text])
        return _spawn(args)
    hit = open_contact(contact)
    import win32con
    _hotkey([], win32con.VK_ESCAPE)
    time.sleep(0.2)
    _capture_weixin_shot(already_open=False)
    time.sleep(0.25)
    dest = os.path.join(r"D:\dsh-workbench\messenger\shots", "wx-live.png")
    _save_clipboard_image(dest)
    set_clipboard_files([dest])
    _paste_and_confirm(hit["hwnd"], contact, file_path=dest)
    if text:
        time.sleep(0.5)
        pace()
        os.environ["DSH_WX_SEND_CHILD"] = "1"
        send_text(text, contact)
    return True


def send_file(path, text="", contact=None):
    contact = contact or CONTACT
    path = os.path.abspath(path)
    assert_sendable(path)
    if not _as_child() and _must_drop_integrity():
        args = ["--file", path, "--to", contact]
        if text:
            args.extend(["--text", text])
        return _spawn(args)
    hit = open_contact(contact)
    set_clipboard_files([path])
    _paste_and_confirm(hit["hwnd"], contact, file_path=path)
    if text:
        time.sleep(0.5)
        pace()
        os.environ["DSH_WX_SEND_CHILD"] = "1"
        send_text(text, contact)
    return True


def main(argv=None):
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--file")
    parser.add_argument("--text", default="")
    parser.add_argument("--to", default=CONTACT)
    parser.add_argument("--job")
    parser.add_argument("--shot", action="store_true")
    ns = parser.parse_args(argv)
    if ns.job:
        with open(ns.job, encoding="utf-8") as fh:
            job = json.load(fh)
        os.environ["DSH_WX_SEND_RESULT"] = job.get("result") or os.environ.get("DSH_WX_SEND_RESULT") or ""
        return main(job.get("args") or [])
    os.environ["DSH_WX_SEND_CHILD"] = "1"
    if ns.shot:
        send_screenshot(ns.to, ns.text)
    elif ns.file:
        send_file(ns.file, ns.text, ns.to)
    else:
        send_text(ns.text, ns.to)


if __name__ == "__main__":
    try:
        main()
        _write_result("OK\n")
    except Exception as exc:
        _write_result("ERR " + str(exc) + "\n")
        sys.stderr.write(str(exc) + "\n")
        sys.exit(1)
