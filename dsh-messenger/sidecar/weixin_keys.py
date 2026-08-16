import json
import os
import re
from pathlib import Path

ALLOWED_ROOT = os.environ.get("DSH_WX_KEYS_ROOT", r"D:\dsh-workbench\messenger")
KEYS_PATH = os.environ.get("DSH_WX_KEYS", r"D:\dsh-workbench\messenger\wx-keys.json")
CACHE_DIR = os.environ.get("DSH_WX_CACHE", r"D:\dsh-workbench\messenger\wx-cache")
WX_NEED = "先打开并登录 PC 微信"
UAC_FAIL = "管理员权限未拿到，密钥没收下"
NEED_KEYS = "需要管理员采集密钥"
HEX64 = re.compile(r"[0-9a-fA-F]{64}")


class KeysPathError(RuntimeError):
    pass


def _allowed(path):
    root = Path(ALLOWED_ROOT).resolve()
    dest = Path(path).resolve()
    try:
        dest.relative_to(root)
    except ValueError as exc:
        raise KeysPathError("密钥只能写在工作台目录") from exc
    return dest


def keys_status(path=None):
    dest = Path(path or KEYS_PATH)
    if not dest.exists():
        return "missing"
    try:
        data = json.loads(dest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "invalid"
    if not isinstance(data, dict) or not data:
        return "invalid"
    for value in data.values():
        if not isinstance(value, str) or len(value) != 64:
            return "invalid"
        try:
            bytes.fromhex(value)
        except ValueError:
            return "invalid"
    return "ready"


def atomic_write_keys(path, data):
    dest = _allowed(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(dest)


def clear_keys(path=None, cache_dir=None):
    dest = _allowed(path or KEYS_PATH)
    if dest.exists():
        dest.unlink()
    cache = Path(cache_dir or CACHE_DIR)
    if cache.exists():
        _allowed(cache)
        for child in sorted(cache.rglob("*"), reverse=True):
            if child.is_file():
                child.unlink()
            elif child.is_dir():
                child.rmdir()
        if cache.exists():
            cache.rmdir()


def redact(text):
    return HEX64.sub("[redacted]", str(text or ""))


def load_keys(path=None):
    dest = Path(path or KEYS_PATH)
    if keys_status(dest) != "ready":
        return {}
    raw = json.loads(dest.read_text(encoding="utf-8"))
    return {key: bytes.fromhex(value) for key, value in raw.items()}


CONFIG_CIPHER_NAME = b"com.Tencent.WCDB.Config.Cipher"
CONFIG_XOR_MASK = bytes.fromhex(
    "d2c7442458020000004889442450488b"
    "450048844c2448488944254048584c24"
)
HEX_LITERAL_RE = re.compile(rb"[xX]'([0-9a-fA-F]{64,192})'")


def _weixin_pids():
    import psutil
    pids = []
    for proc in psutil.process_iter(["name"]):
        name = (proc.info.get("name") or "").lower()
        if name in ("weixin.exe", "wechat.exe"):
            pids.append(proc.pid)
    return pids


def _probable_key(blob):
    return len(blob) == 32 and len(set(blob)) >= 15 and blob not in {b"\x00" * 32, b"\xff" * 32}


def collect_keys(storage=None, keys_path=None):
    from weixin_crypto import PAGE_SZ, verify_enc_key
    from weixin_db import DATA_ROOT, find_account_dir

    pids = _weixin_pids()
    if not pids:
        raise RuntimeError(WX_NEED)
    storage = Path(storage or find_account_dir(DATA_ROOT))
    db_files = []
    for path in storage.rglob("*.db"):
        if path.name.endswith("-wal") or path.name.endswith("-shm"):
            continue
        db_files.append((str(path.relative_to(storage)).replace("\\", "/"), path))
    found = {}
    tested = set()
    for pid in pids:
        found.update(_extract_pid(pid, db_files, tested))
        if len(found) >= len(db_files):
            break
    if not found:
        raise RuntimeError(UAC_FAIL)
    payload = {rel: key.hex() for rel, key in found.items()}
    atomic_write_keys(keys_path or KEYS_PATH, payload)
    return {rel: True for rel in payload}


def _extract_pid(pid, db_files, tested):
    import ctypes
    from ctypes import wintypes

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    handle = k32.OpenProcess(0x0010 | 0x0400, False, pid)
    if not handle:
        return {}

    class MBI(ctypes.Structure):
        _fields_ = [
            ("BaseAddress", ctypes.c_void_p),
            ("AllocationBase", ctypes.c_void_p),
            ("AllocationProtect", wintypes.DWORD),
            ("__alignment1", wintypes.DWORD),
            ("RegionSize", ctypes.c_size_t),
            ("State", wintypes.DWORD),
            ("Protect", wintypes.DWORD),
            ("Type", wintypes.DWORD),
            ("__alignment2", wintypes.DWORD),
        ]

    def read(addr, n):
        buf = ctypes.create_string_buffer(n)
        got = ctypes.c_size_t(0)
        if k32.ReadProcessMemory(handle, ctypes.c_void_p(addr), buf, n, ctypes.byref(got)) and got.value:
            return buf.raw[: got.value]
        return None

    def find_bytes(needle):
        hits = []
        addr = 0
        mbi = MBI()
        while True:
            if k32.VirtualQueryEx(handle, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi)) == 0:
                break
            if (
                mbi.State == 0x1000
                and (mbi.Protect & 0xFF) & 0xE6
                and not (mbi.Protect & 0x100)
                and 0 < mbi.RegionSize < 0x10000000
            ):
                buf = read(mbi.BaseAddress or 0, mbi.RegionSize)
                if buf:
                    pos = 0
                    base = mbi.BaseAddress or 0
                    while True:
                        pos = buf.find(needle, pos)
                        if pos < 0:
                            break
                        hits.append(base + pos)
                        pos += 1
            addr = (mbi.BaseAddress or 0) + mbi.RegionSize
        return hits

    import struct
    from weixin_crypto import PAGE_SZ, verify_enc_key

    keys = {}
    try:
        needles = find_bytes(CONFIG_CIPHER_NAME)
        pairs = [struct.pack("<Q", addr) + struct.pack("<Q", len(CONFIG_CIPHER_NAME)) for addr in needles]
        for pair in pairs:
            for qaddr in find_bytes(pair):
                node = read(qaddr - 0x10, 0x50)
                if not node or len(node) < 0x40:
                    continue
                if struct.unpack_from("<Q", node, 0x10)[0] not in needles:
                    continue
                if struct.unpack_from("<Q", node, 0x18)[0] != len(CONFIG_CIPHER_NAME):
                    continue
                config_ptr = struct.unpack_from("<Q", node, 0x28)[0]
                if not (0x10000 <= config_ptr < 0x800000000000):
                    continue
                obj = read(config_ptr + 0x88, 0x28)
                if not obj or len(obj) < 0x18:
                    continue
                data_ptr = struct.unpack_from("<Q", obj, 0x8)[0]
                data_len = struct.unpack_from("<Q", obj, 0x10)[0]
                if not (0 < data_len <= 1024 and 0x10000 <= data_ptr < 0x800000000000):
                    continue
                blob = read(data_ptr, int(data_len))
                if not blob or len(blob) != data_len:
                    continue
                decoded = bytes(v ^ CONFIG_XOR_MASK[i % len(CONFIG_XOR_MASK)] for i, v in enumerate(blob))
                for match in HEX_LITERAL_RE.finditer(decoded):
                    run = match.group(1).decode().lower()
                    starts = [0]
                    if len(run) > 96:
                        starts += list(range(0, len(run) - 63, 32))
                        starts.append(len(run) - 64)
                    for start in dict.fromkeys(starts):
                        if start + 64 > len(run):
                            continue
                        cand = bytes.fromhex(run[start:start + 64])
                        if cand in tested or not _probable_key(cand):
                            continue
                        tested.add(cand)
                        for rel, path in db_files:
                            if rel in keys:
                                continue
                            page1 = path.read_bytes()[:PAGE_SZ]
                            if verify_enc_key(cand, page1):
                                keys[rel] = cand
                                break
    finally:
        k32.CloseHandle(handle)
    return keys


if __name__ == "__main__":
    import sys
    if "--collect" in sys.argv:
        try:
            collect_keys()
            print("ok", flush=True)
        except Exception as exc:
            print(redact(exc), file=sys.stderr, flush=True)
            sys.exit(1)

