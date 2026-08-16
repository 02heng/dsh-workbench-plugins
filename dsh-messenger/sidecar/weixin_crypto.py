import hashlib
import hmac
import os
import sqlite3
import struct
from pathlib import Path

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

PAGE_SZ = 4096
RESERVE_SZ = 80
WAL_HEADER_SZ = 32
WAL_FRAME_SZ = 4120
STAMP_VERSION = 2


def pbkdf2(passwd, salt, iters):
    return hashlib.pbkdf2_hmac("sha512", passwd, salt, iters, dklen=32)


def aes_cbc_decrypt(key, iv, data):
    dec = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    return dec.update(data) + dec.finalize()


def verify_enc_key(enc_key, page1):
    if len(page1) < PAGE_SZ:
        return False
    salt = page1[:16]
    mac_salt = bytes(b ^ 0x3A for b in salt)
    mac_key = pbkdf2(enc_key, mac_salt, 2)
    hmac_data = page1[16: PAGE_SZ - RESERVE_SZ + 16]
    stored = page1[PAGE_SZ - 64: PAGE_SZ]
    hm = hmac.new(mac_key, hmac_data, hashlib.sha512)
    hm.update(struct.pack("<I", 1))
    return hm.digest() == stored


def decrypt_page(enc_key, page, pgno):
    if len(page) < PAGE_SZ:
        page = page + b"\x00" * (PAGE_SZ - len(page))
    iv = page[PAGE_SZ - RESERVE_SZ: PAGE_SZ - RESERVE_SZ + 16]
    if pgno == 1:
        enc = page[16: PAGE_SZ - RESERVE_SZ]
        return b"SQLite format 3\x00" + aes_cbc_decrypt(enc_key, iv, enc) + b"\x00" * RESERVE_SZ
    enc = page[: PAGE_SZ - RESERVE_SZ]
    return aes_cbc_decrypt(enc_key, iv, enc) + b"\x00" * RESERVE_SZ


def decrypt_file(src, dst, key):
    size = os.path.getsize(src)
    pages = size // PAGE_SZ + (1 if size % PAGE_SZ else 0)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    with open(src, "rb") as fin, open(dst, "wb") as fout:
        for pgno in range(1, pages + 1):
            page = fin.read(PAGE_SZ)
            if not page:
                break
            fout.write(decrypt_page(key, page, pgno))


def merge_wal_file(dst, wal_path, key):
    if not os.path.exists(dst) or not os.path.exists(wal_path):
        return 0
    applied = 0
    with open(dst, "r+b") as out, open(wal_path, "rb") as wal:
        header = wal.read(WAL_HEADER_SZ)
        if len(header) < WAL_HEADER_SZ:
            return 0
        salt = header[16:24]
        size = os.path.getsize(wal_path)
        n = (size - WAL_HEADER_SZ) // WAL_FRAME_SZ
        max_pgno = 0
        for i in range(n):
            wal.seek(WAL_HEADER_SZ + i * WAL_FRAME_SZ)
            hdr = wal.read(24)
            page = wal.read(PAGE_SZ)
            if len(page) < PAGE_SZ:
                break
            if hdr[8:16] != salt:
                continue
            pgno = struct.unpack(">I", hdr[:4])[0]
            pt = decrypt_page(key, page, pgno)
            if pgno == 1 and pt[:16] != b"SQLite format 3\x00":
                continue
            out.seek((pgno - 1) * PAGE_SZ)
            out.write(pt)
            max_pgno = max(max_pgno, pgno)
            applied += 1
        if max_pgno:
            out.seek(0)
            page1 = out.read(PAGE_SZ)
            if len(page1) == PAGE_SZ:
                hdr_pages = struct.unpack(">I", page1[28:32])[0]
                new_pages = max(hdr_pages, max_pgno)
                if new_pages != hdr_pages:
                    out.seek(0)
                    out.write(page1[:28] + struct.pack(">I", new_pages) + page1[32:])
    return applied


def open_sqlite(path):
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn
