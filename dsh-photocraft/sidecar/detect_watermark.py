"""detect_watermark.py -- locate the semi-transparent Doubao AI watermark
(white text + logo, bottom corner) in a raster image.

CLI (contract in the shared spec, section 5):

    python detect_watermark.py --image <path>
           [--mode auto|bottom-right|bottom-left|bottom-band] [--json]

Always prints exactly one compact JSON line on stdout and exits 0, even on
failure ({"ok": false, "error": "..."}).

How it works: inside a corner window the image is compared against a large
kernel median (the local "background", computed on a downscaled copy for
speed).  A Doubao watermark is a bright, nearly achromatic overlay, so pixels
that (a) sit clearly above the local median, (b) are bright and (c) are close
to neutral are kept.  The mask is denoised, labelled into 8-connected
components, glyphs are merged into text groups, text-shaped filters reject
texture lines, and a confidence score decides.  Big images are analysed
downscaled and then refined at full resolution inside the detected ROI.
"""

from __future__ import annotations

import os
import sys
import time

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pc_common import (  # noqa: E402
    as_gray_image,
    clamp,
    clamp_int,
    downsample_rgb,
    emit,
    fail,
    gray_of,
    label_components,
    load_image,
    log,
    median_mask_denoise,
    pad_box,
    parse_args,
    robust_sigma,
    rgb_array,
    saturation_of,
)

MAX_ANALYSIS_SIDE = 1280
BACKGROUND_SIDE = 512
DEFAULT_MODE = "auto"
DEFAULT_MIN_CONFIDENCE = 0.45
DEFAULT_PADDING_SCALE = 0.28


# ---------------------------------------------------------------------------
# background estimation (fast, downscaled median)
# ---------------------------------------------------------------------------


def median_background_fast(gray, ref_kernel=None, target_side=BACKGROUND_SIDE):
    """Large-kernel median background; computed on a downscaled copy.

    Returns (background, effective_kernel_in_full_res_pixels).
    """
    h, w = gray.shape
    if ref_kernel is None:
        ref_kernel = int(clamp(round(min(h, w) * 0.02), 9, 31))
    if ref_kernel % 2 == 0:
        ref_kernel += 1
    longest = max(h, w)
    img = as_gray_image(gray)
    if longest <= target_side:
        out = img.filter(ImageFilter.MedianFilter(ref_kernel))
        return np.asarray(out, dtype=np.float32), int(ref_kernel)
    scale = float(target_side) / float(longest)
    sw = max(8, int(round(w * scale)))
    sh = max(8, int(round(h * scale)))
    k = int(round(ref_kernel * scale))
    if k % 2 == 0:
        k += 1
    k = int(clamp(k, 3, 11))
    med = img.resize((sw, sh), Image.BILINEAR).filter(ImageFilter.MedianFilter(k))
    back = med.resize((w, h), Image.BILINEAR)
    return np.asarray(back, dtype=np.float32), int(round(k / scale))


# ---------------------------------------------------------------------------
# geometry
# ---------------------------------------------------------------------------


def region_for(mode, w, h):
    """Search window (x0, y0, x1, y1) for a named mode."""
    if mode == "bottom-left":
        return (0, int(round(h * 0.78)), int(round(w * 0.45)), h)
    if mode == "bottom-band":
        return (0, int(round(h * 0.75)), w, h)
    return (int(round(w * 0.55)), int(round(h * 0.78)), w, h)


def _anchor_for(region, width):
    x0, _y0, x1, _y1 = region
    if x0 == 0 and x1 < width:
        return "left"
    if x0 == 0:
        return "band"
    return "right"


# ---------------------------------------------------------------------------
# text grouping / scoring
# ---------------------------------------------------------------------------


def _group_components(comps, gap_factor=0.75):
    """Merge glyph components that share a baseline into text groups."""
    n = len(comps)
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

    for i in range(n):
        for j in range(i + 1, n):
            a, b = comps[i], comps[j]
            hi, hj = a["h"], b["h"]
            if max(hi, hj) > 2.5 * min(hi, hj):
                continue
            top = max(a["y"], b["y"])
            bottom = min(a["y"] + a["h"], b["y"] + b["h"])
            overlap = bottom - top
            cai = a["y"] + a["h"] / 2.0
            caj = b["y"] + b["h"] / 2.0
            if overlap < 0.30 * min(hi, hj) and abs(cai - caj) > 0.45 * max(hi, hj):
                continue
            gap = max(a["x"] - (b["x"] + b["w"]), b["x"] - (a["x"] + a["w"]))
            if gap > max(3, gap_factor * min(hi, hj)):
                continue
            union(i, j)
    groups = {}
    for i, c in enumerate(comps):
        r = find(i)
        g = groups.setdefault(r, {"ncomp": 0, "x0": 10 ** 9, "y0": 10 ** 9, "x1": 0, "y1": 0, "area": 0})
        g["ncomp"] += 1
        g["area"] += c["area"]
        g["x0"] = min(g["x0"], c["x"])
        g["y0"] = min(g["y0"], c["y"])
        g["x1"] = max(g["x1"], c["x"] + c["w"])
        g["y1"] = max(g["y1"], c["y"] + c["h"])
    out = []
    for g in groups.values():
        g["w"] = g["x1"] - g["x0"]
        g["h"] = g["y1"] - g["y0"]
        out.append(g)
    out.sort(key=lambda g: (-g["ncomp"], -g["area"]))
    return out


def _text_shaped(comp, width, height):
    if comp["area"] < 12:
        return False
    if comp["h"] < 3 or comp["h"] > 0.12 * height:
        return False
    if comp["w"] > 0.55 * width:
        return False
    fill = float(comp["area"]) / float(max(1, comp["w"] * comp["h"]))
    return fill >= 0.06


def _score_group(g, mean_gray, width, height, anchor):
    """Score a text group 0..1, or None when it is not watermark-shaped."""
    ncomp = g["ncomp"]
    h = max(1, g["h"])
    glyph_h = h / float(max(1, ncomp))
    text_like = ncomp >= 2 and g["w"] >= 1.5 * glyph_h
    single_ok = (
        ncomp == 1
        and g["area"] >= 60
        and h >= 8
        and g["w"] >= 8
        and mean_gray >= 170
        and (g["w"] >= 1.5 * h or h >= 0.02 * height)
    )
    if not (text_like or single_ok):
        return None
    comp_score = clamp((ncomp - 1) / 4.0, 0.0, 1.0)
    bright = clamp((mean_gray - 150.0) / 80.0, 0.0, 1.0)
    if anchor == "left":
        dx = g["x0"] / float(width)
    elif anchor == "band":
        dx = min(g["x0"], width - (g["x0"] + g["w"])) / float(width)
    else:
        dx = (width - (g["x0"] + g["w"])) / float(width)
    dy = (height - (g["y0"] + g["h"])) / float(height)
    pos = clamp(1.0 - float(np.sqrt(dx * dx + dy * dy)) / 0.6, 0.0, 1.0)
    size = clamp(h / (0.05 * height), 0.0, 1.0)
    score = 0.35 * comp_score + 0.25 * bright + 0.20 * pos + 0.20 * size
    return float(clamp(score, 0.0, 1.0))


def _near(a, b):
    """True when two text groups plausibly belong to one watermark."""
    ha, hb = a["h"], b["h"]
    if max(ha, hb) > 2.5 * min(ha, hb):
        return False
    overlap = min(a["y0"] + ha, b["y0"] + hb) - max(a["y0"], b["y0"])
    cy_a = a["y0"] + ha / 2.0
    cy_b = b["y0"] + hb / 2.0
    if overlap < 0.25 * min(ha, hb) and abs(cy_a - cy_b) > 0.6 * max(ha, hb):
        return False
    gap = max(a["x0"] - (b["x0"] + b["w"]), b["x0"] - (a["x0"] + a["w"]))
    return gap <= max(6, 1.2 * max(ha, hb))


# ---------------------------------------------------------------------------
# analysis
# ---------------------------------------------------------------------------


class Frame(object):
    """Precomputed luma / saturation / background residual for one image."""

    def __init__(self, rgb, target_side=BACKGROUND_SIDE):
        self.rgb = rgb
        self.gray = gray_of(rgb)
        self.sat = saturation_of(rgb)
        self.height, self.width = self.gray.shape
        self.background, self.kernel = median_background_fast(self.gray, target_side=target_side)
        self.res = self.gray - self.background


def _candidate(frame, region, method, min_conf, padding_scale):
    x0, y0, x1, y1 = region
    height, width = frame.height, frame.width
    anchor = _anchor_for(region, width)
    sub = frame.res[y0:y1, x0:x1]
    sigma = robust_sigma(sub)
    thr = float(clamp(max(6.0, 3.0 * sigma), 6.0, 18.0))
    if method == "corner-median-diff":
        mask = (frame.gray > 150) & (frame.sat < 30.0) & (frame.res > max(3.0, thr * 0.42))
    else:
        mask = (frame.res > thr) & (frame.gray > 140) & (frame.sat < 60.0)
    win = np.zeros(frame.gray.shape, dtype=bool)
    win[y0:y1, x0:x1] = True
    m = median_mask_denoise(mask & win, 3)
    if not m.any():
        return None
    comps = [c for c in label_components(m) if _text_shaped(c, width, height)]
    if not comps:
        return None
    groups = _group_components(comps)
    scored = []
    for g in groups:
        sel = m[g["y0"]:g["y1"], g["x0"]:g["x1"]]
        if not sel.any():
            continue
        sub_gray = frame.gray[g["y0"]:g["y1"], g["x0"]:g["x1"]]
        mean_gray = float(sub_gray[sel].mean())
        score = _score_group(g, mean_gray, width, height, anchor)
        if score is None:
            continue
        scored.append({"group": g, "score": score, "mean_gray": mean_gray})
    if not scored:
        return None
    scored.sort(key=lambda s: -s["score"])
    best = scored[0]
    # a watermark is text + logo: union nearby satellite groups (e.g. the logo
    # to the left of the wordmark) so the bbox covers the whole mark.
    cutoff = max(min_conf * 0.7, best["score"] * 0.45)
    picked = [best]
    for cand in scored[1:]:
        if cand["score"] < cutoff:
            continue
        if any(_near(cand["group"], p["group"]) for p in picked):
            picked.append(cand)
    gx0 = min(p["group"]["x0"] for p in picked)
    gy0 = min(p["group"]["y0"] for p in picked)
    gx1 = max(p["group"]["x1"] for p in picked)
    gy1 = max(p["group"]["y1"] for p in picked)
    return {
        "raw_bbox": [int(gx0), int(gy0), int(gx1 - gx0), int(gy1 - gy0)],
        "confidence": round(float(best["score"]), 3),
        "method": method,
        "groups": len(picked),
        "threshold": thr,
        "sigma": sigma,
    }


def _analyze_frame(frame, mode, min_conf, padding_scale):
    region = region_for(mode, frame.width, frame.height)
    best = None
    for method in ("corner-median-diff", "bright-text"):
        cand = _candidate(frame, region, method, min_conf, padding_scale)
        if cand and (best is None or cand["confidence"] > best["confidence"]):
            best = cand
    if best is not None:
        best["mode"] = mode
        best["region"] = list(region)
    return best


def _refine_fullres(full_rgb, coarse_box, min_conf, padding_scale):
    h, w = full_rgb.shape[:2]
    pad = int(max(8, round(0.25 * max(coarse_box[2], coarse_box[3]))))
    roi = pad_box(coarse_box, pad, w, h)
    crop = full_rgb[roi[1]:roi[1] + roi[3], roi[0]:roi[0] + roi[2]]
    if crop.size == 0:
        return None
    frame = Frame(crop)
    res = _analyze_frame(frame, "bottom-band", min_conf, padding_scale)
    if res is None or res["confidence"] < 0.30:
        return None
    bx = res["raw_bbox"]
    out = dict(res)
    out["raw_bbox"] = [int(bx[0] + roi[0]), int(bx[1] + roi[1]), int(bx[2]), int(bx[3])]
    out["method"] = res["method"] + "+fullres"
    return out


def detect(path, mode=DEFAULT_MODE, min_conf=DEFAULT_MIN_CONFIDENCE,
           padding_scale=DEFAULT_PADDING_SCALE, fallback_corner=False,
           max_side=MAX_ANALYSIS_SIDE):
    started = time.time()
    im, abs_path = load_image(path)
    width, height = int(im.size[0]), int(im.size[1])
    full = rgb_array(im)
    notes = []
    if max(width, height) > max_side:
        small, scale = downsample_rgb(full, max_side)
        notes.append("downsampled for analysis: %dx%d -> %dx%d" % (width, height, small.shape[1], small.shape[0]))
    else:
        small, scale = full, 1.0

    frame = Frame(small)
    modes = [mode] if mode != "auto" else ["bottom-right", "bottom-left", "bottom-band"]
    best, best_mode = None, None
    for m in modes:
        cand = _analyze_frame(frame, m, min_conf, padding_scale)
        if cand is None:
            continue
        if best is None or cand["confidence"] > best["confidence"]:
            best, best_mode = cand, m
    if best is None:
        return _not_found(abs_path, width, height, notes, started, fallback_corner)

    raw = best["raw_bbox"]
    if scale < 1.0:
        raw = [
            clamp_int(raw[0] / scale, 0, max(0, width - 1)),
            clamp_int(raw[1] / scale, 0, max(0, height - 1)),
            max(1, int(round(raw[2] / scale))),
            max(1, int(round(raw[3] / scale))),
        ]
        raw[2] = max(1, min(raw[2], width - raw[0]))
        raw[3] = max(1, min(raw[3], height - raw[1]))
        refined = _refine_fullres(full, raw, min_conf, padding_scale)
        if refined:
            raw = refined["raw_bbox"]
            best["confidence"] = refined["confidence"]
            best["method"] = refined["method"]
            notes.append("refined at full resolution")

    if best["confidence"] < min_conf:
        return _not_found(abs_path, width, height, notes, started, fallback_corner)

    pad = int(max(3, round(raw[3] * padding_scale)))
    bbox = pad_box(raw, pad, width, height)
    notes.append("search mode: %s" % best_mode)
    notes.append("pad %dpx (%.2f x glyph height)" % (pad, padding_scale))
    notes.append("threshold %.1f, effective median kernel %dpx, noise sigma %.2f"
                 % (best["threshold"], frame.kernel, best["sigma"]))
    if best.get("groups", 1) > 1:
        notes.append("merged %d text groups (wordmark + logo)" % best["groups"])
    return {
        "ok": True,
        "image": abs_path,
        "width": width,
        "height": height,
        "found": True,
        "bbox": bbox,
        "raw_bbox": [int(v) for v in raw],
        "confidence": float(best["confidence"]),
        "method": best["method"],
        "notes": notes,
        "region": list(region_for(best_mode, width, height)),
        "seconds": round(time.time() - started, 3),
    }


def _not_found(abs_path, width, height, notes, started, fallback_corner):
    box = None
    method = "none"
    if fallback_corner:
        bw = int(round(width * 0.30))
        bh = int(round(height * 0.08))
        box = [max(0, width - bw - int(round(width * 0.03))),
               max(0, height - bh - int(round(height * 0.05))), bw, bh]
        method = "fallback-corner"
        notes = list(notes) + ["nothing watermark-like found; returned a conservative corner box for onMiss=corner"]
    else:
        notes = list(notes) + ["no watermark-like pixels found"]
    return {
        "ok": True,
        "image": abs_path,
        "width": width,
        "height": height,
        "found": False,
        "bbox": box,
        "raw_bbox": None,
        "confidence": 0.0,
        "method": method,
        "notes": notes,
        "seconds": round(time.time() - started, 3),
    }


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        args = parse_args(argv, {
            "image": (str, None),
            "mode": (str, DEFAULT_MODE),
            "json": (bool, False),
            "min_confidence": (float, DEFAULT_MIN_CONFIDENCE),
            "padding_scale": (float, DEFAULT_PADDING_SCALE),
            "max_side": (int, MAX_ANALYSIS_SIDE),
            "fallback_corner": (bool, False),
            "debug": (bool, False),
        })
        if args["image"] is None:
            positional = [a for a in argv if not a.startswith("--")]
            if positional:
                args["image"] = positional[-1]
        if not args["image"]:
            return fail("missing --image <path>")
        if args["mode"] not in ("auto", "bottom-right", "bottom-left", "bottom-band"):
            return fail("unknown --mode %s" % args["mode"])
        if args["debug"]:
            log("detect %s mode=%s" % (args["image"], args["mode"]))
        emit(detect(
            args["image"],
            mode=args["mode"],
            min_conf=float(args["min_confidence"]),
            padding_scale=float(args["padding_scale"]),
            fallback_corner=bool(args["fallback_corner"]),
            max_side=int(args["max_side"]),
        ))
        return 0
    except Exception as exc:  # noqa: BLE001 - contract: report, never crash
        return fail("%s: %s" % (type(exc).__name__, exc))


if __name__ == "__main__":
    sys.exit(main())
