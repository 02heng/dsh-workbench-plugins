import json
import os
import sys
import tempfile
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from weixin_keys import (
    ALLOWED_ROOT,
    UAC_FAIL,
    WX_NEED,
    KeysPathError,
    atomic_write_keys,
    clear_keys,
    keys_status,
    redact,
)


def check(cond, msg):
    if not cond:
        raise SystemExit(f"FAIL {msg}")


root = Path(ALLOWED_ROOT)
check(str(root).replace("\\", "/").lower().startswith("d:/dsh-workbench/messenger"), "allowed root")

outside = Path(tempfile.gettempdir()) / "wx-keys.json"
try:
    atomic_write_keys(outside, {"contact/contact.db": "00" * 32})
    raise SystemExit("FAIL must refuse keys outside workbench")
except KeysPathError:
    pass

work = root / "_test-wx-keys"
work.mkdir(parents=True, exist_ok=True)
keys_path = work / "wx-keys.json"
cache = work / "wx-cache"
inbox = work / "inbox.jsonl"
try:
    if keys_path.exists():
        keys_path.unlink()
    check(keys_status(keys_path) == "missing", "missing")

    fake = {"contact/contact.db": "ab" * 32}
    atomic_write_keys(keys_path, fake)
    check(keys_status(keys_path) == "ready", "ready")
    saved = json.loads(keys_path.read_text(encoding="utf-8"))
    check(saved == fake, "roundtrip")

    keys_path.write_text("not-json", encoding="utf-8")
    check(keys_status(keys_path) == "invalid", "invalid json")

    atomic_write_keys(keys_path, fake)
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "page.bin").write_bytes(b"x")
    inbox.write_text("{}\n", encoding="utf-8")
    clear_keys(keys_path, cache)
    check(not keys_path.exists(), "cleared keys")
    check(not cache.exists(), "cleared cache")
    check(inbox.exists(), "inbox stays")

    leaked = redact("key=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789")
    check("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789" not in leaked, "redact hex")
    check(WX_NEED == "先打开并登录 PC 微信", "wx need")
    check(UAC_FAIL == "管理员权限未拿到，密钥没收下", "uac")
finally:
    if keys_path.exists():
        keys_path.unlink()
    if cache.exists():
        for child in cache.rglob("*"):
            if child.is_file():
                child.unlink()
        cache.rmdir()
    if inbox.exists():
        inbox.unlink()
    try:
        work.rmdir()
    except OSError:
        pass

print("PASS weixin-keys")
