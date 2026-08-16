import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from weixin_db import (
    BAD_KEYS,
    DB_FAIL,
    MANY_CONTACT,
    NEED_KEYS,
    NO_ACCOUNT,
    NO_CONTACT,
    ContactError,
    load_cursor,
    merge_wal_frames,
    msg_kind,
    new_messages,
    resolve_contact,
    rows_after,
    save_cursor,
    snapshot_seq,
    text_content,
)


def check(cond, msg):
    if not cond:
        raise SystemExit(f"FAIL {msg}")


rows = [
    {"username": "wxid_a", "remark": "", "nick_name": "路人"},
    {"username": "wxid_h", "remark": "黄山", "nick_name": "别名"},
]
hit = resolve_contact(rows, "黄山")
check(hit["username"] == "wxid_h", f"remark first {hit}")

nick_only = [
    {"username": "wxid_h", "remark": "", "nick_name": "黄山"},
]
check(resolve_contact(nick_only, "黄山")["username"] == "wxid_h", "nickname fallback")

try:
    resolve_contact([{"username": "x", "remark": "", "nick_name": "路人"}], "黄山")
    raise SystemExit("FAIL missing should raise")
except ContactError as exc:
    check(str(exc) == NO_CONTACT, f"missing text {exc}")

try:
    resolve_contact(
        [
            {"username": "a", "remark": "黄山", "nick_name": ""},
            {"username": "b", "remark": "黄山", "nick_name": ""},
        ],
        "黄山",
    )
    raise SystemExit("FAIL many remarks should raise")
except ContactError as exc:
    check(str(exc) == MANY_CONTACT, f"many text {exc}")
try:
    resolve_contact(
        [
            {"username": "a", "remark": "", "nick_name": "黄山"},
            {"username": "b", "remark": "", "nick_name": "黄山"},
        ],
        "黄山",
    )
    raise SystemExit("FAIL many nicknames should raise")
except ContactError as exc:
    check(str(exc) == MANY_CONTACT, f"many nick text {exc}")

remark_beats_nick = [
    {"username": "wxid_r", "remark": "黄山", "nick_name": "其他"},
    {"username": "wxid_n", "remark": "", "nick_name": "黄山"},
]
check(resolve_contact(remark_beats_nick, "黄山")["username"] == "wxid_r", "remark wins")

msgs = [
    {"sort_seq": 10, "real_sender_id": 2, "content": "自己", "local_type": 1},
    {"sort_seq": 11, "real_sender_id": 9, "content": "你好", "local_type": 1},
    {"sort_seq": 12, "real_sender_id": 9, "content": "图", "local_type": 3},
    {"sort_seq": 13, "real_sender_id": 2, "content": "任务制作—调研", "local_type": 1},
    {"sort_seq": 14, "real_sender_id": 2, "content": "任务: 本机绿气泡", "local_type": 1},
    {"sort_seq": 15, "real_sender_id": 2, "content": "任务：全角冒号", "local_type": 1},
    {"sort_seq": 16, "real_sender_id": 2, "content": "任务: 回图", "local_type": 3},
]
fresh = new_messages(msgs, cursor=10)
check(len(fresh) == 4, f"cursor filter {fresh}")
check(fresh[0]["content"] == "你好", "order")
check(fresh[1]["content"] == "图", "keep other image")
check(fresh[2]["content"] == "任务: 本机绿气泡", "keep self ascii password")
check(fresh[3]["content"] == "任务：全角冒号", "keep self fullwidth password")
check(all(row["content"] != "自己" for row in fresh), "drop self idle")
check(all(row["content"] != "任务制作—调研" for row in fresh), "drop self without colon")
check(all(not (int(row.get("real_sender_id") or 0) == 2 and int(row.get("local_type") or 0) == 3) for row in fresh), "drop self image")

check(len(rows_after(msgs, 15)) == 1, "rows after includes self image")
check(snapshot_seq(msgs) == 16, "snapshot max")
check(snapshot_seq([]) == 0, "empty snapshot")

with tempfile.TemporaryDirectory() as tmp:
    path = os.path.join(tmp, "wx-cursor.json")
    check(load_cursor(path, "黄山") is None, "no cursor file")
    save_cursor(path, "黄山", 12)
    check(load_cursor(path, "黄山") == 12, "roundtrip")
    save_cursor(path, "别人", 3)
    check(load_cursor(path, "黄山") == 12, "other contact isolated")

# WAL: only frames whose salt matches header salt
header_salt = b"ABCD"
good = {"salt": b"ABCD", "pgno": 1, "page": b"new"}
stale = {"salt": b"OLD!", "pgno": 1, "page": b"old"}
merged = merge_wal_frames(header_salt, [stale, good])
check(merged == [good], f"wal salt {merged}")

check(NEED_KEYS == "需要管理员采集密钥", "need keys")
check(NO_ACCOUNT == "找不到 E:\\weixin 下的账号目录", "no account")
check(BAD_KEYS == "密钥对不上本机库", "bad keys")
check(DB_FAIL == "本机库读失败", "db fail")
check(msg_kind(1) == "text", "text kind")
check(msg_kind(3) == "image", "image kind")
check(msg_kind(34) == "file", "voice as file-ish")
check(msg_kind(49) == "file", "card file")
check(msg_kind(999) == "other", "other kind")
check(text_content("你好") == "你好", "plain text")
check(text_content(b"hello") == "hello", "bytes utf8")

print("PASS weixin-db")
