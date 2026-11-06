"""pc_common.py -- shared helpers for the dsh-photocraft Python sidecar.

Only Pillow + numpy are used (no extra dependencies).  The scripts in this
directory import it after putting their own folder on sys.path:

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from pc_common import ...

Everything here is deterministic and side-effect free apart from the explicit
emit / save_json helpers.
"""

from __future__ import annotations

import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageFilter

# ---------------------------------------------------------------------------
# logging / json output
# ---------------------------------------------------------------------------

_NAME = "pc-sidecar"
_DEBUG = os.environ.get("PHOTOCRAFT_SIDECAR_DEBUG", "") not in ("", "0", "false", "False")


def log(msg, level="info"):
    """Write a diagnostic line to stderr (stdout stays parseable JSON)."""
    if level == "debug" and not _DEBUG:
        return
    sys.stderr.write("[%s] %s\n" % (_NAME, msg))
    sys.stderr.flush()


def _json_default(obj):
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return str(obj)


def emit(obj):
    """Print one compact JSON object on a single stdout line."""
    sys.stdout.write(
        json.dumps(obj, ensure_ascii=False, default=_json_default, separators=(",", ":")) + "\n"
    )
    sys.stdout.flush()


def fail(message, **extra):
    """Emit the failure envelope.  Exit code stays 0 by contract."""
    body = {"ok": False, "error": str(message)}
    body.update(extra)
    emit(body)
    return 0


def save_json(path, obj):
    ensure_dir(os.path.dirname(os.path.abspath(path)))
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, default=_json_default, indent=2)
        fh.write("\n")
    return os.path.abspath(path)


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def ensure_dir(path):
    if path:
        os.makedirs(path, exist_ok=True)
    return path


def now():
    return time.time()


# ---------------------------------------------------------------------------
# argv helper (no argparse surprises, no shell involved)
# ---------------------------------------------------------------------------


def parse_args(argv, spec, aliases=None):
    """Minimal long-option parser.

    spec maps option name -> (type, default).  type is one of
    str/int/float/bool.  Accepts "--opt value" and "--opt=value"; a bool
    option is True when present unless followed by an explicit false word
    (0/false/no/off).
    """
    aliases = aliases or {}
    values = {}
    for key, (_typ, default) in spec.items():
        values[key] = default
    args = list(argv)
    i = 0
    while i < len(args):
        raw = args[i]
        if not raw.startswith("--"):
            i += 1
            continue
        body = raw[2:]
        if "=" in body:
            name, inline = body.split("=", 1)
        else:
            name, inline = body, None
        key = aliases.get(name, name.replace("-", "_"))
        if key not in spec:
            log("ignoring unknown option --%s" % name, "debug")
            i += 1
            continue
        typ = spec[key][0]
        nxt = inline
        if nxt is None:
            if i + 1 < len(args) and not args[i + 1].startswith("--"):
                nxt = args[i + 1]
                i += 1
            else:
                nxt = None
        if typ is bool:
            if nxt is None:
                values[key] = True
            else:
                values[key] = str(nxt).strip().lower() not in ("0", "false", "no", "off")
        else:
            if nxt is None:
                raise ValueError("option --%s needs a value" % name)
            if typ is int:
                values[key] = int(float(nxt))
            elif typ is float:
                values[key] = float(nxt)
            else:
                values[key] = str(nxt)
        i += 1
    return values


# ---------------------------------------------------------------------------
# image loading / colour helpers
# ---------------------------------------------------------------------------

_MAX_ANALYSIS_SIDE = 1280


def load_image(path):
    if not path:
        raise ValueError("image path is empty")
    p = os.path.abspath(path)
    if not os.path.isfile(p):
        raise FileNotFoundError("image not found: %s" % p)
    im = Image.open(p)
    im.load()
    return im, p


def rgb_array(im):
    """PIL image -> contiguous uint8 RGB ndarray (h, w, 3)."""
    if im.mode != "RGB":
        im = im.convert("RGB")
    return np.asarray(im, dtype=np.uint8)


def gray_of(rgb):
    """Luma 0..255 float32, BT.601 weights (matches PIL convert("L"))."""
    a = np.asarray(rgb, dtype=np.float32)
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def saturation_of(rgb):
    """Per-pixel max-min channel difference (0..255) as float32."""
    a = np.asarray(rgb, dtype=np.int16)
    return (a.max(axis=2) - a.min(axis=2)).astype(np.float32)


def as_gray_image(gray):
    return Image.fromarray(np.clip(gray, 0, 255).astype(np.uint8), "L")


def downsample_rgb(rgb, max_side=_MAX_ANALYSIS_SIDE):
    """Return (array, scale).  scale is new_size/old_size (<= 1)."""
    h, w = rgb.shape[:2]
    longest = max(h, w)
    if longest <= max_side:
        return rgb, 1.0
    scale = float(max_side) / float(longest)
    nh = max(1, int(round(h * scale)))
    nw = max(1, int(round(w * scale)))
    im = Image.fromarray(np.ascontiguousarray(rgb)).resize((nw, nh), Image.LANCZOS)
    return np.asarray(im, dtype=np.uint8), float(nw) / float(w)


def crop_rgb(rgb, box):
    x, y, w, h = [int(v) for v in box]
    return rgb[y:y + h, x:x + w]


def clamp_int(value, lo, hi):
    return int(max(lo, min(hi, int(round(value)))))


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def hex_color(rgb_triple):
    r, g, b = [clamp_int(c, 0, 255) for c in rgb_triple[:3]]
    return "#%02x%02x%02x" % (r, g, b)


# ---------------------------------------------------------------------------
# morphology / statistics
# ---------------------------------------------------------------------------


def box_sum(arr, rx, ry=None):
    """Sum over a (2*ry+1) x (2*rx+1) window, zero padded (integral image)."""
    if ry is None:
        ry = rx
    a = np.asarray(arr, dtype=np.float64)
    rx = int(max(0, rx))
    ry = int(max(0, ry))
    if rx == 0 and ry == 0:
        return a.copy()
    h, w = a.shape
    acc = np.zeros((h + 2 * ry + 1, w + 2 * rx + 1), dtype=np.float64)
    acc[ry + 1:ry + 1 + h, rx + 1:rx + 1 + w] = a
    acc = acc.cumsum(axis=0).cumsum(axis=1)
    y0 = np.arange(h)
    y1 = y0 + 2 * ry + 1
    x0 = np.arange(w)
    x1 = x0 + 2 * rx + 1
    return acc[np.ix_(y1, x1)] - acc[np.ix_(y0, x1)] - acc[np.ix_(y1, x0)] + acc[np.ix_(y0, x0)]


def box_blur(arr, radius):
    a = np.asarray(arr, dtype=np.float64)
    r = int(max(0, radius))
    if r == 0:
        return a.astype(np.float64)
    return box_sum(a, r) / float((2 * r + 1) ** 2)


def dilate(mask, rx, ry=None):
    m = np.asarray(mask, dtype=bool)
    if not m.any():
        return m.copy()
    return box_sum(m.astype(np.float64), rx, ry) > 0


def erode(mask, rx, ry=None):
    m = np.asarray(mask, dtype=bool)
    if not m.any():
        return m.copy()
    if ry is None:
        ry = rx
    ones = np.ones(m.shape, dtype=np.float64)
    return box_sum(m.astype(np.float64), rx, ry) >= box_sum(ones, rx, ry)


def median_background(gray, size=None):
    """Large-kernel median of a luma array -> (background, kernel_size)."""
    h, w = gray.shape
    if size is None:
        size = int(round(min(h, w) * 0.02))
        size = int(clamp(size, 9, 31))
    size = int(size)
    if size % 2 == 0:
        size += 1
    size = int(clamp(size, 3, 41))
    out = as_gray_image(gray).filter(ImageFilter.MedianFilter(size))
    return np.asarray(out, dtype=np.float32), size


def median_mask_denoise(mask, size=3):
    """Median filter on a boolean mask, using PIL."""
    m = np.asarray(mask, dtype=bool)
    if not m.any():
        return m.copy()
    img = Image.fromarray((m * 255).astype(np.uint8), "L")
    out = np.asarray(img.filter(ImageFilter.MedianFilter(size)), dtype=np.uint8)
    return out > 127


def robust_sigma(arr):
    a = np.asarray(arr, dtype=np.float64).ravel()
    a = a[np.isfinite(a)]
    if a.size == 0:
        return 0.0
    med = float(np.median(a))
    mad = float(np.median(np.abs(a - med)))
    return 1.4826 * mad


def sobel(gray):
    """Return (gx, gy) gradient estimates (same shape as input)."""
    g = np.asarray(gray, dtype=np.float32)
    p = np.pad(g, 1, mode="edge")
    gx = (
        (p[:-2, 2:] - p[:-2, :-2])
        + 2.0 * (p[1:-1, 2:] - p[1:-1, :-2])
        + (p[2:, 2:] - p[2:, :-2])
    ) * 0.25
    gy = (
        (p[2:, :-2] - p[:-2, :-2])
        + 2.0 * (p[2:, 1:-1] - p[:-2, 1:-1])
        + (p[2:, 2:] - p[:-2, 2:])
    ) * 0.25
    return gx, gy


# ---------------------------------------------------------------------------
# connected components (run-length + union-find; 8-connected)
# ---------------------------------------------------------------------------


def _row_runs(row):
    if not row.any():
        return [], []
    r = row.astype(np.int8)
    d = np.diff(np.concatenate(([0], r, [0])))
    starts = np.nonzero(d == 1)[0]
    ends = np.nonzero(d == -1)[0]
    return starts, ends


def label_components(mask):
    """Label a boolean mask.

    Returns a list of dicts with area/x/y/w/h sorted by descending area.
    Runs are merged with a 1px tolerance in both axes -> 8-connected.
    """
    m = np.asarray(mask, dtype=bool)
    h, w = m.shape
    ry, rx0, rx1 = [], [], []
    row_ids = []
    for y in range(h):
        st, en = _row_runs(m[y])
        start_id = len(ry)
        for s, e in zip(st, en):
            ry.append(y)
            rx0.append(int(s))
            rx1.append(int(e))
        row_ids.append((start_id, len(ry)))
    n = len(ry)
    if n == 0:
        return []
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for y in range(1, h):
        a0, a1 = row_ids[y - 1]
        b0, b1 = row_ids[y]
        i, j = a0, b0
        while i < a1 and j < b1:
            ax0, ax1 = rx0[i], rx1[i]
            bx0, bx1 = rx0[j], rx1[j]
            if ax1 + 1 <= bx0:
                i += 1
            elif bx1 + 1 <= ax0:
                j += 1
            else:
                union(i, j)
                if ax1 < bx1:
                    i += 1
                else:
                    j += 1

    agg = {}
    for idx in range(n):
        r = find(idx)
        a = agg.get(r)
        if a is None:
            agg[r] = [rx1[idx] - rx0[idx], rx0[idx], rx1[idx] - 1, ry[idx], ry[idx]]
        else:
            a[0] += rx1[idx] - rx0[idx]
            if rx0[idx] < a[1]:
                a[1] = rx0[idx]
            if rx1[idx] - 1 > a[2]:
                a[2] = rx1[idx] - 1
            if ry[idx] < a[3]:
                a[3] = ry[idx]
            if ry[idx] > a[4]:
                a[4] = ry[idx]
    comps = []
    for area, x0, x1, y0, y1 in agg.values():
        comps.append({"area": int(area), "x": int(x0), "y": int(y0), "w": int(x1 - x0 + 1), "h": int(y1 - y0 + 1)})
    comps.sort(key=lambda c: (-c["area"], c["y"], c["x"]))
    return comps


def mask_bbox(mask):
    m = np.asarray(mask, dtype=bool)
    if not m.any():
        return None
    ys, xs = np.nonzero(m)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    return [x0, y0, x1 - x0 + 1, y1 - y0 + 1]


def union_boxes(boxes):
    boxes = [b for b in boxes if b]
    if not boxes:
        return None
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    return [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]


def box_iou(a, b):
    if not a or not b:
        return 0.0
    ax0, ay0, aw, ah = a
    bx0, by0, bw, bh = b
    ax1, ay1 = ax0 + aw, ay0 + ah
    bx1, by1 = bx0 + bw, by0 + bh
    ix = max(0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0, min(ay1, by1) - max(ay0, by0))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return float(inter) / float(union) if union > 0 else 0.0


def pad_box(box, pad, width, height):
    x, y, w, h = [int(v) for v in box]
    x0 = clamp_int(x - pad, 0, max(0, width - 1))
    y0 = clamp_int(y - pad, 0, max(0, height - 1))
    x1 = clamp_int(x + w + pad, 1, width)
    y1 = clamp_int(y + h + pad, 1, height)
    return [x0, y0, max(1, x1 - x0), max(1, y1 - y0)]


def box_inside(box, width, height):
    x, y, w, h = [int(v) for v in box]
    return x >= 0 and y >= 0 and w >= 1 and h >= 1 and x + w <= width and y + h <= height
