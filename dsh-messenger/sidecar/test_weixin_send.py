import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from weixin_send import (
    DROPFILES,
    ELEVATED_WX,
    HIGH_IL,
    MEDIUM_IL,
    SEND_PAUSE,
    TRAY_WX,
    SendError,
    _as_child,
    _click_input,
    _click_tray_weixin,
    _must_drop_integrity,
    _paste_and_confirm,
    _paste_into_edit,
    _show,
    _wake,
    open_contact,
    assert_sendable,
    file_button_point,
    input_box_point,
    screenshot_button_point,
    send_button_point,
    is_elevated_sid,
    is_file_dialog,
    is_shot_overlay,
    is_tray_hidden,
    shot_confirm_from_image,
    is_weixin_name,
    open_ok,
    pack_hdrop,
    pace,
    pick_main_window,
    send_file,
    send_screenshot,
    send_text,
)


def check(cond, msg):
    if not cond:
        raise SystemExit(f"FAIL {msg}")


windows = [
    {"exe": "notepad.exe", "visible": True, "w": 1200, "h": 800, "title": "微信", "cls": "Qt51514QWindowIcon"},
    {"exe": "Weixin.exe", "visible": False, "w": 1200, "h": 800, "title": "微信", "cls": "Qt51514QWindowIcon"},
    {"exe": "Weixin.exe", "visible": True, "iconic": True, "w": 160, "h": 28, "title": "微信", "cls": "Qt51514QWindowIcon"},
    {"exe": "Weixin.exe", "visible": True, "w": 200, "h": 200, "title": "微信", "cls": "Qt51514QWindowIcon"},
    {"exe": "Weixin.exe", "visible": True, "w": 1100, "h": 720, "title": "微信", "cls": "Chrome_WidgetWin_1"},
    {"exe": "Weixin.exe", "visible": True, "w": 1280, "h": 800, "title": "微信", "cls": "Qt51514QWindowIcon"},
]
hit = pick_main_window(windows)
check(hit["w"] == 1280, f"pick large weixin {hit}")
check(is_weixin_name("Weixin.exe") is True, "weixin name")
check(is_weixin_name("chrome.exe") is False, "not weixin")

mini = pick_main_window([
    {"exe": "Weixin.exe", "visible": True, "iconic": True, "w": 160, "h": 28, "title": "微信", "cls": "Qt51514QWindowIcon"},
])
check(mini and mini["iconic"] is True, "pick minimized weixin")
check(pick_main_window([]) is None, "empty")
hidden = pick_main_window([
    {"exe": "Weixin.exe", "visible": False, "iconic": False, "w": 891, "h": 614, "title": "微信", "cls": "Qt51514QWindowIcon"},
])
check(hidden and hidden["w"] == 891, f"pick hidden weixin {hidden}")
check(open_ok("黄山", "黄山") is True, "match")
try:
    open_ok("文件传输助手", "黄山")
    raise SystemExit("FAIL must refuse other chat")
except SendError as exc:
    check("黄山" in str(exc), f"refuse text {exc}")

check(assert_sendable(r"D:\a\方案.docx") == ".docx", "docx ok")
check(assert_sendable(r"D:\a\表.xlsx") == ".xlsx", "xlsx ok")
check(assert_sendable(r"D:\a\回图.png") == ".png", "png ok")
import inspect
check("send_screenshot" not in inspect.getsource(send_file), "png must not use weixin shot overlay")
check("set_clipboard_files" in inspect.getsource(send_file), "send file by clipboard paste")
check("_send_via_file_dialog" not in inspect.getsource(send_file), "file picker freezes weixin")
check("HWND_TOPMOST" not in inspect.getsource(_show), "must not pin weixin always-on-top")
check("托盘" in TRAY_WX, "tray error text")
src_show = inspect.getsource(_show)
check("_hwnd_foreground" in src_show and "SendError" in src_show, "show must verify foreground or fail")
check(is_tray_hidden({"visible": False, "iconic": False, "w": 891, "h": 614}) is True, "hidden main is tray")
check(is_tray_hidden({"visible": True, "iconic": True, "w": 160, "h": 28}) is False, "taskbar minimize is not tray")
check(is_tray_hidden({"visible": True, "iconic": False, "w": 891, "h": 614}) is False, "open main is not tray")
check(is_tray_hidden({"visible": True, "iconic": False, "w": 200, "h": 200}) is True, "tiny visible is tray-like")
src_wake = inspect.getsource(_wake)
check("is_tray_hidden" in src_wake, "wake must detect tray before yanking")
check("_click_tray_weixin" in src_wake, "tray restore must click notify icon")
src_tray = inspect.getsource(_click_tray_weixin)
check("ShowWindow" not in src_tray, "tray click must not ShowWindow")
check("SW_RESTORE" not in src_tray, "tray click must not SW_RESTORE")
check("start \"\"" not in inspect.getsource(_click_tray_weixin), "must not cmd-start weixin")
src_file = inspect.getsource(send_file)
check("_must_drop_integrity" in src_file, "ordinary session must not go through cmd bat")
src_text = inspect.getsource(send_text)
check("_must_drop_integrity" in src_text, "text send must not always cmd-spawn")
src_must = inspect.getsource(_must_drop_integrity)
check("is_elevated_sid" in src_must, "only elevated helper needs schtasks")
src_open = inspect.getsource(open_contact)
check('_wake(hit["hwnd"], hit)' in src_open, "open_contact must pass window row into wake")
src_open = inspect.getsource(open_contact)
check("pick_main_window" in src_open and "_wake" in src_open, "open_contact must re-pick and wake per retry")
check("_hwnd_foreground" in src_open, "open_contact must verify weixin foreground")
check("return hit" in src_open, "open_contact must hand back the verified window")
check("woke" in src_open, "freshly woken window needs extra settle time")

visible_beats_hidden = pick_main_window([
    {"exe": "Weixin.exe", "visible": False, "w": 1280, "h": 800, "title": "微信", "cls": "Qt51514QWindowIcon"},
    {"exe": "Weixin.exe", "visible": True, "w": 891, "h": 614, "title": "微信", "cls": "Qt51514QWindowIcon"},
])
check(visible_beats_hidden["visible"] is True, f"visible window must beat bigger hidden ghost {visible_beats_hidden}")

src_confirm = inspect.getsource(_paste_and_confirm)
check("wait_new" in src_confirm, "confirm delivery via db")
check("enter" in src_confirm, "retry enter when stuck in compose")
check("SendError" in src_confirm, "must report honest failure")
check("except Exception:\n            return True" not in src_confirm, "inbox errors must not look like sent")
check("box is None" in src_confirm and "return True" not in src_confirm.split("if box is None")[1][:80], "missing inbox must not skip confirm")
check("_click_send" in src_confirm, "retry must click 发送")
check("_paste_and_confirm" in inspect.getsource(send_file), "send_file must confirm delivery")
check("_paste_and_confirm" in inspect.getsource(send_screenshot), "send_screenshot must confirm delivery")
check("HWND_TOPMOST" not in inspect.getsource(_paste_into_edit), "paste must not pin weixin")
sx, sy = send_button_point(1280, 800)
check(sx > 1000, f"send btn right {sx}")
check(sy > 740, f"send btn bottom {sy}")
src_open = inspect.getsource(open_contact)
check("_hwnd_foreground" in src_open, "open_contact must require THIS weixin hwnd in front")
src_keys = inspect.getsource(__import__("weixin_send")._send_keys_to_edit)
check("_hwnd_foreground" in src_keys or "SetForegroundWindow" in src_keys, "keys must not go to chrome")
check("SendKeys" not in src_keys, "uiautomation SendKeys cannot paste files")
check("_send_via_file_dialog" in inspect.getsource(_paste_and_confirm), "file dialog fallback when paste fails")
check("file_path" in inspect.getsource(_paste_and_confirm), "confirm must know the file for dialog fallback")
from weixin_inbox import WeixinInbox
src_seq = inspect.getsource(WeixinInbox.latest_seq)
check("MAX(sort_seq)" in src_seq, "latest_seq must read true max not oldest 200")
src_wait = inspect.getsource(WeixinInbox.wait_new)
check("_raw_messages(0)" not in src_wait, "wait_new must not scan from seq 0")
check("_paste_and_confirm" in inspect.getsource(send_file), "send_file must confirm delivery")
check("_paste_and_confirm" in inspect.getsource(send_screenshot), "send_screenshot must confirm delivery")
check("HWND_TOPMOST" not in inspect.getsource(_paste_into_edit), "paste must not pin weixin")
check("(48, 64, 80, 96)" not in inspect.getsource(_click_input), "one compose click only")
check("set_clipboard_files" in inspect.getsource(send_screenshot), "shot png also clipboard")
check(SEND_PAUSE == 0.3, f"send pause 300ms {SEND_PAUSE}")
check("pace()" in inspect.getsource(send_file), "send_file must pace before follow-up text")
check(callable(pace), "pace helper")
try:
    assert_sendable(r"D:\a\pack.zip")
    raise SystemExit("FAIL zip must be refused")
except SendError as exc:
    check("压缩包" in str(exc), f"zip text {exc}")

os.environ.pop("DSH_WX_SEND_CHILD", None)
check(_as_child() is False, "parent not child")
os.environ["DSH_WX_SEND_CHILD"] = "1"
check(_as_child() is True, "child flag")
os.environ.pop("DSH_WX_SEND_CHILD", None)

x, y = input_box_point(1280, 800)
check(x > 320, f"input x in chat pane {x}")
check(y == 752, f"input y near compose {y}")
x2, y2 = input_box_point(1280, 800, 88)
check(y2 == 712, f"input y alt {y2}")
fx, fy = file_button_point(875, 606)
check(380 < fx < 430, f"file btn x {fx}")
check(550 < fy < 580, f"file btn y {fy}")
sx, sy = screenshot_button_point(875, 606)
check(sx == fx + 40, f"shot btn right of file {sx}")
check(sy == fy, f"shot btn same row {sy}")
try:
    input_box_point(160, 28)
    raise SystemExit("FAIL tiny window must refuse")
except SendError as exc:
    check("输入框" in str(exc), f"tiny text {exc}")

payload = pack_hdrop([r"D:\a\方案.docx"])
check(payload[:4] == __import__("struct").pack("I", __import__("ctypes").sizeof(DROPFILES)), "hdrop pFiles")
check("方案.docx".encode("utf-16le") in payload, "hdrop utf16 path")
check(payload.endswith(b"\x00\x00\x00\x00"), "hdrop list terminator")

check(is_elevated_sid(HIGH_IL) is True, "high il")
check(is_elevated_sid(MEDIUM_IL) is False, "medium il")
check("管理员" in ELEVATED_WX, "elevated text")

check(is_file_dialog("选择文件", "#32770") is True, "choose file dialog")
check(is_file_dialog("打开", "#32770") is True, "open dialog")
check(is_file_dialog("微信", "Qt51514QWindowIcon") is False, "not weixin")
check(is_shot_overlay("Weixin", "Qt51514QWindowIcon", 1920, 1080) is True, "shot overlay")
check(is_shot_overlay("微信", "Qt51514QWindowIcon", 891, 614) is False, "main not overlay")
try:
    from PIL import Image
    canvas = Image.new("RGB", (1920, 1080), (250, 250, 250))
    for y in range(994, 1006):
        for x in range(1797, 1815):
            canvas.putpixel((x, y), (7, 193, 120))
    cx, cy = shot_confirm_from_image(canvas, 1840, 960)
    check(1795 <= cx <= 1815 and 994 <= cy <= 1006, f"check center {cx, cy}")
except ImportError:
    pass

print("PASS weixin-send")
