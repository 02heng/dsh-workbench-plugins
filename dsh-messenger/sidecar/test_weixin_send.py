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
    SendError,
    _as_child,
    assert_sendable,
    file_button_point,
    input_box_point,
    screenshot_button_point,
    is_elevated_sid,
    is_file_dialog,
    is_shot_overlay,
    shot_confirm_from_image,
    is_weixin_name,
    open_ok,
    pack_hdrop,
    pick_main_window,
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
check(assert_sendable(r"D:\a\说明.pdf") == ".pdf", "pdf ok")
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
