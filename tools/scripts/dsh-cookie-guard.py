#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
dsh-cookie-guard — 清理 DSH Desktop 每次启动累积的 dsh-auth-* Cookie。

背景（源码取证）：
  DSH 的桌面端每次启动会向 Electron 的 Cookie 库写一枚鉴权 Cookie，
  名字是 `dsh-auth-<base64url(sha256(authority))>`，authority 对 HTTP 而言是
  `host`（含端口），即 `127.0.0.1:<本次随机端口>`；Max-Age 默认 30 天。
  端口每次启动都变 → Cookie 名每次都不一样 → 老 Cookie 不会被覆盖，
  只会一直堆在这个 jar 里，请求 127.0.0.1 时全部塞进 Cookie 头，
  超过 Node 服务端 16KB 头部上限后握手失败，前端只看到
  "Web authentication failed"。

用法：
  python dsh-cookie-guard.py status   # 只看：Cookie 总数 / dsh-auth-* 条数 / 估算头部字节
  python dsh-cookie-guard.py fix      # 备份 + 删除所有 dsh-auth-* 行 + VACUUM
  python dsh-cookie-guard.py auto     # 等 DSH 完全退出后自动 fix（可常驻后台）
选项：
  --db <path>     指定 Cookies 路径（默认取 %APPDATA%\@deepseek-ai\dsh-desktop\Network\Cookies）
  --keep N        保留最近 N 条（默认 0 = 全删，下次启动自动重建）
  --quiet         少打印
"""

import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

DEFAULT_DB = os.path.join(
    os.environ.get("APPDATA", ""), "@deepseek-ai", "dsh-desktop", "Network", "Cookies"
)
PREFIX = "dsh-auth-"
DSH_EXE = "DeepSeek Harness.exe"
_here = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(_here, "dsh-cookie-guard.log")
VERIFY = os.path.join(_here, "dsh-cookie-guard.verify.jsonl")
LOCK = os.path.join(_here, "dsh-cookie-guard.lock")
# 关键：pythonw 下 spawn tasklist 若不加这个标志，每轮都会闪一下黑框
NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def record(obj):
    """写一条结构化验证记录，供事后核对「清理前到底堆了多少」。"""
    import json
    obj = dict(obj)
    obj["at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    try:
        with open(VERIFY, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _proc_list():
    """用 ctypes 直接枚举进程，不 spawn 任何子进程（spawn tasklist 会闪黑框）。"""
    try:
        import ctypes
        from ctypes import wintypes as wt
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        cap = 4096
        arr = (wt.DWORD * cap)()
        needed = wt.DWORD()
        if not psapi.EnumProcesses(ctypes.byref(arr), ctypes.sizeof(arr), ctypes.byref(needed)):
            return None
        n = needed.value // ctypes.sizeof(wt.DWORD)
        out = []
        for i in range(n):
            pid = arr[i]
            if not pid:
                continue
            h = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
            if not h:
                continue
            try:
                buf = ctypes.create_unicode_buffer(32768)
                size = wt.DWORD(len(buf))
                if k32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                    out.append((int(pid), buf.value.rsplit("\\", 1)[-1]))
            finally:
                k32.CloseHandle(h)
        return out
    except Exception:
        return None


def _tasklist_names():
    """ctypes 不可用时的兜底（带 NO_WINDOW，不闪窗）。"""
    try:
        out = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=25,
            encoding="mbcs", errors="replace", creationflags=NO_WINDOW,
        ).stdout or ""
    except Exception:
        return []
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith('"'):
            continue
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) >= 2 and parts[1].isdigit():
            rows.append((int(parts[1]), parts[0]))
    return rows


def _procs():
    rows = _proc_list()
    if rows is None:
        rows = _tasklist_names()
    return rows


def alive(pid):
    names = _procs()
    return any(p == pid for p, _n in names)


def take_lock():
    """同一时刻只允许一个守护进程；返回 False 表示已有实例。"""
    try:
        if os.path.exists(LOCK):
            with open(LOCK, encoding="utf-8") as f:
                old = (f.read() or "").strip()
            if old.isdigit() and alive(int(old)):
                return False
    except OSError:
        pass
    try:
        with open(LOCK, "w", encoding="utf-8") as f:
            f.write(str(os.getpid()))
    except OSError:
        pass
    return True


def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    try:
        if sys.stdout is not None:      # pythonw 下 stdout 为 None，不能用 print
            print(line, flush=True)
    except Exception:
        pass
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def dsh_running():
    """返回正在运行的 DSH 进程 pid 列表（只看 exe 名，避免误伤）。"""
    return [p for p, name in _procs() if name.lower() == DSH_EXE.lower()]


def connect_ro(db):
    """只读打开。DSH 运行时 Chromium 独占该文件，会抛错——这是预期行为。"""
    return sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=3)


def cookie_stats(conn):
    total = conn.execute("select count(*) from cookies").fetchone()[0]
    rows = conn.execute(
        "select host_key, name, length(name)+length(value)+length(encrypted_value)"
        " from cookies where name like ?", (PREFIX + "%",)
    ).fetchall()
    header_est = sum(2 + r[2] for r in rows)  # "; " 分隔 + "name=value"
    return total, rows, header_est


def exp_to_local(exp):
    """Chromium 的 expires_utc 是 1601-01-01 起的微秒数。"""
    try:
        dt = datetime(1601, 1, 1, tzinfo=timezone.utc) + timedelta(microseconds=int(exp))
        return dt.astimezone().strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(exp)


def do_status(db, quiet=False):
    if not os.path.exists(db):
        log(f"没找到 Cookies：{db}")
        return 2
    try:
        conn = connect_ro(db)
    except sqlite3.Error as e:
        pids = dsh_running()
        log(f"读不了 Cookies（{e}）。DSH 正在运行（pid={pids}）时 Chromium 独占该文件——"
            f"先完全退出 DSH 再看。")
        return 3
    try:
        total, rows, header_est = cookie_stats(conn)
        newest = conn.execute(
            "select name, expires_utc from cookies where name like ? order by expires_utc desc limit 3",
            (PREFIX + "%",)
        ).fetchall()
    finally:
        conn.close()
    log(f"库：{db}（{os.path.getsize(db)} 字节）")
    log(f"Cookie 总数：{total}；{PREFIX}* 条数：{len(rows)}；"
        f"这些 Cookie 拼成的请求头约 {header_est} 字节")
    record({
        "source": "status", "db": db, "dbBytes": os.path.getsize(db),
        "total": total, "dshAuth": len(rows), "headerBytes": header_est,
    })
    if header_est >= 12288:
        log("⚠ 接近/超过 16KB 头部上限，下次启动基本会报 Web authentication failed。跑 fix。")
    elif len(rows) >= 30:
        log("⚠ 已经开始堆积，建议清理。")
    else:
        log("目前还安全。")
    if not quiet:
        hosts = {}
        for h, _n, _s in rows:
            hosts[h] = hosts.get(h, 0) + 1
        for h, c in sorted(hosts.items(), key=lambda kv: -kv[1]):
            log(f"  {h}: {c} 条")
        for name, exp in newest:
            log(f"  最新一条：{name[:24]}… 到期 {exp_to_local(exp)}")
    return 0


def do_fix(db, keep=0, source="fix"):
    if not os.path.exists(db):
        log(f"没找到 Cookies：{db}")
        return 2
    pids = dsh_running()
    is_live = os.path.normcase(os.path.abspath(db)) == os.path.normcase(os.path.abspath(DEFAULT_DB))
    if pids and is_live:
        log(f"DSH 还在运行（pid={pids}），这个库正被 Chromium 独占锁着。请先完全退出 DSH。")
        return 3
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = f"{db}.bak-{stamp}"
    try:
        shutil.copy2(db, backup)
    except OSError as e:
        log(f"备份失败：{e}")
        return 4
    log(f"已备份 → {backup}")
    before_bytes = os.path.getsize(db)
    rec = {"source": source, "db": db, "dbBytesBefore": before_bytes,
           "backup": os.path.basename(backup), "keep": keep}
    try:
        conn = sqlite3.connect(db, timeout=10)
        try:
            total, rows, header_est = cookie_stats(conn)
            log(f"清理前：Cookie 总数 {total}，{PREFIX}* {len(rows)} 条，请求头约 {header_est} 字节")
            rec.update(totalBefore=total, dshAuthBefore=len(rows), headerBytesBefore=header_est)
            if keep > 0 and len(rows) > keep:
                del_rows = conn.execute(
                    "select rowid from cookies where name like ? order by expires_utc desc limit -1 offset ?",
                    (PREFIX + "%", keep)
                ).fetchall()
                conn.executemany("delete from cookies where rowid=?", del_rows)
                removed = len(del_rows)
            else:
                removed = conn.execute(
                    "delete from cookies where name like ?", (PREFIX + "%",)
                ).rowcount
            conn.commit()
            conn.execute("vacuum")
            total2, rows2, header2 = cookie_stats(conn)
            log(f"删除 {removed} 条；清理后：总数 {total2}，{PREFIX}* {len(rows2)} 条，"
                f"请求头约 {header2} 字节")
            rec.update(removed=removed, totalAfter=total2, dshAuthAfter=len(rows2),
                       headerBytesAfter=header2, dbBytesAfter=os.path.getsize(db))
        finally:
            conn.close()
    except sqlite3.Error as e:
        log(f"清理失败：{e}（备份在 {backup}）")
        rec["error"] = str(e)
        record(rec)
        return 5
    record(rec)
    log("完成。下次启动 DSH 会重新下发一枚新的鉴权 Cookie，登录态不受影响。")
    return 0


def do_auto(db, keep=0, interval=10):
    if not take_lock():
        log("已有一个守护进程在跑，本次退出。")
        return 0
    log(f"auto 模式（pid={os.getpid()}）：等 DSH 退出后自动清理；之后每次退出都会再清一次。")
    was_running = bool(dsh_running())
    if was_running:
        log("DSH 正在运行，等它退出……")
    else:
        # 开机自启时 DSH 往往还没起来，这时先把历史遗留清掉（保留 2 条以防万一）
        log("启动时 DSH 未运行，先做一次开机清理。")
        do_fix(db, 2, source="auto-start")
    while True:
        running = bool(dsh_running())
        if was_running and not running:
            log("检测到 DSH 已退出，开始清理。")
            time.sleep(3)
            do_fix(db, keep, source="auto")
        was_running = running
        time.sleep(interval)


def do_waitfix(db, keep=0, interval=5, max_hours=6):
    """前台等待 DSH 退出，退出后立刻清理一次，然后结束（给双击用）。"""
    log(f"waitfix 模式（pid={os.getpid()}）：先查看当前情况，然后等你关掉 DSH 自动清理。")
    do_status(db)
    deadline = time.time() + max_hours * 3600
    if not dsh_running():
        log("DSH 当前未运行，直接清理。")
        return do_fix(db, keep, source="waitfix")
    log("DSH 正在运行。请完全退出 DSH（含右下角托盘图标），我会自己接着干；"
        f"最多等 {max_hours} 小时。这个窗口可以最小化，但不要关。")
    while time.time() < deadline:
        if not dsh_running():
            log("检测到 DSH 已退出，3 秒后开始清理……")
            time.sleep(3)
            return do_fix(db, keep, source="waitfix")
        time.sleep(interval)
    log(f"等了 {max_hours} 小时 DSH 仍在运行，放弃本次清理。")
    return 3


def do_menu(db, keep=0):
    """双击 cmd 时的交互菜单（中文提示由 Python 输出，避免 cmd 编码问题）。"""
    while True:
        print()
        print("=" * 60)
        print(" DSH 登录失败（Cookie 累积）处理工具")
        print("=" * 60)
        print(" 1. 查看现状（有多少条 dsh-auth Cookie、离崩还有多远）")
        print(" 2. 现在就清理（需要 DSH 已完全退出）")
        print(" 3. 等我关 DSH 后自动清理（先选这个，再去关 DSH）")
        print(" 0. 退出")
        print()
        try:
            choice = input("请输入序号后回车 [1/2/3/0]（直接回车=1）: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if choice in ("", "1"):
            do_status(db)
        elif choice == "2":
            print()
            print("提示：DSH 若还开着（含右下角托盘图标），Cookie 库被占用，清理会失败。")
            print("      没关干净的话，选 3 更省事。")
            print()
            do_fix(db, keep, source="fix")
        elif choice == "3":
            return do_waitfix(db, keep)
        elif choice == "0":
            return 0
        else:
            print("没看懂，请输入 1 / 2 / 3 / 0。")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("mode", nargs="?", default="menu",
                    choices=["menu", "status", "fix", "auto", "waitfix"])
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--keep", type=int, default=0)
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    if a.mode == "status":
        return do_status(a.db, a.quiet)
    if a.mode == "fix":
        return do_fix(a.db, a.keep)
    if a.mode == "waitfix":
        return do_waitfix(a.db, a.keep)
    if a.mode == "menu":
        return do_menu(a.db, a.keep)
    return do_auto(a.db, a.keep)


if __name__ == "__main__":
    sys.exit(main())
