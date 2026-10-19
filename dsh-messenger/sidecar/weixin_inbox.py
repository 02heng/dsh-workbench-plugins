import os
import time
from pathlib import Path

from weixin_crypto import decrypt_file, merge_wal_file, open_sqlite, verify_enc_key
from weixin_db import (
    BAD_KEYS,
    CACHE_DIR,
    CONTACT,
    CURSOR_PATH,
    DATA_ROOT,
    DB_FAIL,
    NEED_KEYS,
    find_account_dir,
    load_cursor,
    msg_kind,
    msg_table,
    new_messages,
    resolve_contact,
    rows_after,
    save_cursor,
    snapshot_seq,
    text_content,
)
from weixin_keys import keys_status, load_keys

STAMP = "3"


def cache_stamp(src):
    src = Path(src)
    st = src.stat()
    wal = Path(str(src) + "-wal")
    wal_part = "0"
    if wal.exists():
        wst = wal.stat()
        wal_part = f"{wst.st_mtime_ns}:{wst.st_size}"
    return f"{STAMP}:{st.st_mtime_ns}:{st.st_size}:{wal_part}"


def _rel_key(keys, rel):
    posix = rel.replace("\\", "/")
    if posix in keys:
        return keys[posix]
    name = Path(posix).name
    for key, value in keys.items():
        if Path(str(key)).name == name:
            return value
    return None


class WeixinInbox:
    def __init__(self, contact=None):
        self.contact = contact or CONTACT
        if keys_status() != "ready":
            raise RuntimeError(NEED_KEYS)
        self.keys = load_keys()
        self.storage = find_account_dir(DATA_ROOT)
        self.cache = Path(CACHE_DIR)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.username = None
        self.cursor = None

    def _decrypt(self, rel, force=False):
        src = self.storage / rel
        if not src.exists():
            raise RuntimeError(DB_FAIL)
        key = _rel_key(self.keys, rel)
        if not key:
            raise RuntimeError(BAD_KEYS)
        page1 = src.read_bytes()[:4096]
        if not verify_enc_key(key, page1):
            raise RuntimeError(BAD_KEYS)
        dest = self.cache / rel.replace("\\", "__").replace("/", "__")
        stamp = dest.with_suffix(dest.suffix + ".stamp")
        meta = cache_stamp(src)
        if (
            not force
            and dest.exists()
            and stamp.exists()
            and stamp.read_text(encoding="utf-8") == meta
        ):
            return dest
        decrypt_file(str(src), str(dest), key)
        wal = Path(str(src) + "-wal")
        if wal.exists():
            merge_wal_file(str(dest), str(wal), key)
        stamp.write_text(meta, encoding="utf-8")
        return dest

    def bind(self):
        dest = self._decrypt("contact/contact.db")
        conn = open_sqlite(str(dest))
        try:
            rows = [
                {
                    "username": row["username"],
                    "nick_name": row["nick_name"],
                    "remark": row["remark"],
                }
                for row in conn.execute("SELECT username, nick_name, remark FROM contact")
            ]
        finally:
            conn.close()
        hit = resolve_contact(rows, self.contact)
        self.username = hit["username"]
        existing = load_cursor(CURSOR_PATH, self.contact)
        if existing is None:
            current = snapshot_seq(self._raw_messages(0))
            save_cursor(CURSOR_PATH, self.contact, current)
            self.cursor = current
        else:
            self.cursor = existing
        return self

    def _raw_messages(self, since):
        if not self.username:
            return []
        table = msg_table(self.username)
        rows = []
        for name in ("message/message_0.db", "message/message_1.db"):
            src = self.storage / name
            if not src.exists():
                continue
            try:
                dest = self._decrypt(name)
                conn = open_sqlite(str(dest))
            except Exception:
                continue
            try:
                found = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()
                if not found:
                    continue
                cur = conn.execute(
                    "SELECT local_id, local_type, real_sender_id, message_content, sort_seq "
                    f"FROM {table} WHERE sort_seq > ? ORDER BY sort_seq ASC LIMIT 200",
                    (since,),
                )
                for row in cur:
                    rows.append({
                        "local_id": row["local_id"],
                        "local_type": row["local_type"],
                        "real_sender_id": row["real_sender_id"],
                        "content": text_content(row["message_content"]),
                        "sort_seq": row["sort_seq"],
                    })
            finally:
                conn.close()
        rows.sort(key=lambda row: int(row.get("sort_seq") or 0))
        return rows

    def poll(self):
        raw = self._raw_messages(self.cursor or 0)
        fresh = new_messages(raw, self.cursor or 0)
        out = []
        for row in fresh:
            out.append({
                "content": row.get("content") or "",
                "kind": msg_kind(row.get("local_type")),
                "sort_seq": row.get("sort_seq"),
            })
        return out

    def mark_seen(self, sort_seq):
        seq = int(sort_seq or 0)
        if seq <= int(self.cursor or 0):
            return
        self.cursor = seq
        save_cursor(CURSOR_PATH, self.contact, self.cursor)

    def latest_seq(self):
        if not self.username:
            return 0
        table = msg_table(self.username)
        mx = 0
        for name in ("message/message_0.db", "message/message_1.db"):
            src = self.storage / name
            if not src.exists():
                continue
            try:
                dest = self._decrypt(name, force=True)
                conn = open_sqlite(str(dest))
            except Exception:
                continue
            try:
                found = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()
                if not found:
                    continue
                row = conn.execute(f"SELECT MAX(sort_seq) m FROM {table}").fetchone()
                mx = max(mx, int(row["m"] or 0))
            finally:
                conn.close()
        return mx

    def wait_new(self, before, timeout=10):
        deadline = time.time() + timeout
        before = int(before or 0)
        while time.time() < deadline:
            if self.latest_seq() > before:
                return True
            time.sleep(0.4)
        return False
