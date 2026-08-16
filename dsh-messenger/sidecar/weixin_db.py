import hashlib
import json
import os
from pathlib import Path

NEED_KEYS = "需要管理员采集密钥"
NO_ACCOUNT = "找不到 E:\\weixin 下的账号目录"
BAD_KEYS = "密钥对不上本机库"
NO_CONTACT = "联系人里没有黄山"
MANY_CONTACT = "联系人里有多个黄山"
DB_FAIL = "本机库读失败"
CONTACT = os.environ.get("DSH_WX_CONTACT", "黄山")
PASSWORD_PREFIXES = ("任务:", "任务：")
DATA_ROOT = os.environ.get("DSH_WX_DATA_ROOT", r"E:\weixin")
CURSOR_PATH = os.environ.get("DSH_WX_CURSOR", r"D:\dsh-workbench\messenger\wx-cursor.json")
CACHE_DIR = os.environ.get("DSH_WX_CACHE", r"D:\dsh-workbench\messenger\wx-cache")
LOGIN_DIR = os.path.expandvars(r"%APPDATA%\Tencent\xwechat\login")


class ContactError(RuntimeError):
    pass


def resolve_contact(rows, name=None):
    name = name or CONTACT
    remark_hits = [row for row in rows if str(row.get("remark") or "") == name]
    if len(remark_hits) == 1:
        return remark_hits[0]
    if len(remark_hits) > 1:
        raise ContactError(MANY_CONTACT)
    nick_hits = [row for row in rows if str(row.get("nick_name") or "") == name]
    if len(nick_hits) == 1:
        return nick_hits[0]
    if len(nick_hits) > 1:
        raise ContactError(MANY_CONTACT)
    raise ContactError(NO_CONTACT)


def has_password(content):
    text = text_content(content).strip()
    return any(text.startswith(prefix) for prefix in PASSWORD_PREFIXES)


def new_messages(rows, cursor=0):
    cursor = int(cursor or 0)
    out = []
    for row in rows:
        if int(row.get("sort_seq") or 0) <= cursor:
            continue
        if int(row.get("real_sender_id") or 0) == 2:
            if int(row.get("local_type") or 0) != 1:
                continue
            if not has_password(row.get("content")):
                continue
        out.append(row)
    out.sort(key=lambda row: int(row.get("sort_seq") or 0))
    return out


def rows_after(rows, cursor=0):
    cursor = int(cursor or 0)
    return [row for row in rows if int(row.get("sort_seq") or 0) > cursor]


def snapshot_seq(rows):
    if not rows:
        return 0
    return max(int(row.get("sort_seq") or 0) for row in rows)


def load_cursor(path, contact):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    value = data.get(contact)
    if value is None:
        return None
    return int(value)


def save_cursor(path, contact, seq):
    dest = Path(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = {}
    try:
        data = json.loads(dest.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            data = {}
    except (OSError, json.JSONDecodeError):
        data = {}
    data[contact] = int(seq)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(dest)


def merge_wal_frames(header_salt, frames):
    return [frame for frame in frames if frame.get("salt") == header_salt]


def msg_table(username):
    return "Msg_" + hashlib.md5(username.encode("utf-8")).hexdigest()


def msg_kind(local_type):
    code = int(local_type or 0)
    if code == 1:
        return "text"
    if code == 3:
        return "image"
    if code in (34, 49):
        return "file"
    return "other"


def text_content(raw):
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    if isinstance(raw, memoryview):
        raw = raw.tobytes()
    if isinstance(raw, bytearray):
        raw = bytes(raw)
    if isinstance(raw, bytes):
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return ""
    return str(raw)


def find_account_dir(data_root=None, login_dir=None):
    data_root = Path(data_root or DATA_ROOT)
    files = data_root / "xwechat_files"
    login_dir = Path(login_dir or LOGIN_DIR)
    wxids = []
    if login_dir.is_dir():
        wxids = [p.name for p in login_dir.iterdir() if p.is_dir() and p.name.startswith("wxid_")]
    if len(wxids) == 1:
        matches = sorted(files.glob(f"{wxids[0]}_*")) if files.is_dir() else []
        for match in matches:
            storage = match / "db_storage"
            if storage.is_dir():
                return storage
    if files.is_dir():
        found = [p / "db_storage" for p in files.glob("wxid_*") if (p / "db_storage").is_dir()]
        if len(found) == 1:
            return found[0]
    raise RuntimeError(NO_ACCOUNT)
