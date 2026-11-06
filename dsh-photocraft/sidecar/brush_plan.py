#!/usr/bin/env python3
"""brush_plan.py -- turn a reference image into a paint.stroke plan.

CLI (shared spec, section 5):

    python brush_plan.py --image <path> --out <plan.json>
           [--style impressionist|pointillist|crosshatch|ink|pencil|flat]
           [--brush-size 24] [--density 1.0] [--passes 2] [--jitter 0.35]
           [--seed 7] [--max-strokes 4000]

stdout (one compact JSON line, exit code always 0):
    {"ok":true,"strokes":N,"width":W,"height":H,"plan":"...","style":"...",
     "passes":[...],"coverage":0-1,"seconds":x}

The plan file is plain data: the Node side turns every entry of "strokes" into
one ["paint.stroke", {...}] action.  All randomness comes from numpy
default_rng(seed), so the same image and arguments produce the same plan.

Rendering model: a coarse-to-fine sweep over a cell grid (pass 1 uses a cell as
large as the brush, every later pass halves it).  Each cell contributes the
median colour of its pixels and strokes whose direction comes from the local
structure tensor (Sobel based) plus a seeded jitter.  STYLE_SPECS holds the
per-style dab shape, palette tint and cell filter.
"""

from __future__ import annotations

import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pc_common import (  # noqa: E402
    box_sum,
    clamp,
    clamp_int,
    downsample_rgb,
    emit,
    fail,
    gray_of,
    hex_color,
    load_image,
    log,
    parse_args,
    rgb_array,
    save_json,
    sobel,
)

PLAN_VERSION = 1
COLOR_SIDE = 768
MAX_COLOR_SAMPLES = 64
MAX_SCAN_CELLS = 40000
MAX_CANDIDATES_FACTOR = 3
COVERAGE_SIDE = 384
INK_MAX_LUMA = 172.0
PENCIL_ENERGY_PERCENTILE = 62.0
STYLES = ("impressionist", "pointillist", "crosshatch", "ink", "pencil", "flat")

STYLE_SPECS = {
    "impressionist": {
        "size_mul": 1.30, "hardness": 0.55, "opacity": 0.62, "flow": 0.90,
        "spacing": 0.16, "smoothing": 0.42, "preset": "Hard Round",
        "shape": "dab", "min_points": 2, "max_points": 3, "len_mul": 1.05,
        "tint": 0.0,
    },
    "pointillist": {
        "size_mul": 0.55, "hardness": 0.95, "opacity": 0.85, "flow": 1.0,
        "spacing": 0.50, "smoothing": 0.0, "preset": "Hard Round Fine",
        "shape": "dot", "min_points": 1, "max_points": 1, "len_mul": 0.0,
        "tint": 0.0,
    },
    "crosshatch": {
        "size_mul": 0.22, "hardness": 0.85, "opacity": 0.55, "flow": 0.80,
        "spacing": 0.10, "smoothing": 0.25, "preset": "Calligraphy Flat",
        "shape": "hatch", "min_points": 2, "max_points": 2, "len_mul": 1.70,
        "tint": 0.28,
    },
    "ink": {
        "size_mul": 0.55, "hardness": 0.90, "opacity": 0.85, "flow": 0.75,
        "spacing": 0.12, "smoothing": 0.30, "preset": "Hard Round",
        "shape": "dab", "min_points": 2, "max_points": 3, "len_mul": 1.20,
        "tint": 0.60,
    },
    "pencil": {
        "size_mul": 0.20, "hardness": 1.0, "opacity": 0.50, "flow": 0.60,
        "spacing": 0.08, "smoothing": 0.20, "preset": "Hard Pencil",
        "shape": "edge", "min_points": 3, "max_points": 4, "len_mul": 2.00,
        "tint": 0.85,
    },
    "flat": {
        "size_mul": 1.65, "hardness": 1.0, "opacity": 1.0, "flow": 1.0,
        "spacing": 0.50, "smoothing": 0.0, "preset": "Calligraphy Flat",
        "shape": "block", "min_points": 1, "max_points": 1, "len_mul": 0.0,
        "tint": 0.0,
    },
}


# ---------------------------------------------------------------------------
# colour + geometry helpers
# ---------------------------------------------------------------------------


def _pixel_median(rgb, cx, cy, half):
    """Median RGB of the square of half-width *half* centred on (cx, cy)."""
    height, width = rgb.shape[0], rgb.shape[1]
    x0 = max(0, int(cx) - int(half))
    x1 = min(width, int(cx) + int(half) + 1)
    y0 = max(0, int(cy) - int(half))
    y1 = min(height, int(cy) + int(half) + 1)
    if x1 <= x0:
        x0 = clamp_int(int(cx), 0, width - 1)
        x1 = x0 + 1
    if y1 <= y0:
        y0 = clamp_int(int(cy), 0, height - 1)
        y1 = y0 + 1
    block = rgb[y0:y1, x0:x1].reshape(-1, 3)
    if block.shape[0] > MAX_COLOR_SAMPLES:
        step = int(math.ceil(block.shape[0] / float(MAX_COLOR_SAMPLES)))
        block = block[::step]
    med = np.median(block, axis=0)
    return [float(med[0]), float(med[1]), float(med[2])]


def _style_color(base, style, tint, rng):
    """Sampled colour tinted towards the style anchor (pencil = graphite)."""
    if style == "pencil":
        luma = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]
        value = clamp(0.30 * luma + 26.0, 0.0, 255.0)
        return (int(round(value)), int(round(value)), int(round(value)))
    anchor = (30.0, 26.0, 22.0)
    if style == "ink":
        anchor = (16.0, 18.0, 24.0)
    out = []
    for i in range(3):
        value = base[i] * (1.0 - tint) + anchor[i] * tint
        if style in ("impressionist", "pointillist"):
            value += float(rng.integers(-6, 7))
        out.append(int(round(clamp(value, 0.0, 255.0))))
    return (out[0], out[1], out[2])


def _make_points(shape, cx, cy, theta, length, cell, rng, params):
    """Stroke geometry for one mark (all randomness comes from rng)."""
    if shape in ("dot", "block"):
        return [(cx, cy)]
    count = int(rng.integers(int(params["min_points"]), int(params["max_points"]) + 1))
    count = max(1, count)
    half = length / 2.0
    if shape == "hatch":
        return [
            (cx - math.cos(theta) * half, cy - math.sin(theta) * half),
            (cx + math.cos(theta) * half, cy + math.sin(theta) * half),
        ]
    bow = 0.0
    if shape == "dab":
        bow = (float(rng.random()) - 0.5) * length * 0.5
    points = []
    for i in range(count):
        t = -half + length * (i / float(max(1, count - 1)))
        px = cx + math.cos(theta) * t - math.sin(theta) * bow
        py = cy + math.sin(theta) * t + math.cos(theta) * bow
        if shape == "edge":
            px += float(rng.normal(0.0, cell * 0.10))
            py += float(rng.normal(0.0, cell * 0.10))
        points.append((px, py))
    return points


def _round_points(points, width, height):
    out = []
    for px, py in points:
        x = clamp_int(int(round(px)), 0, width - 1)
        y = clamp_int(int(round(py)), 0, height - 1)
        if out and out[-1][0] == x and out[-1][1] == y:
            continue
        out.append([x, y])
    if not out:
        out = [[0, 0]]
    return out


def _coverage(strokes, width, height):
    """Fraction of the canvas touched by at least one stroke disc."""
    scale = min(1.0, COVERAGE_SIDE / float(max(width, height)))
    mw = max(1, int(round(width * scale)))
    mh = max(1, int(round(height * scale)))
    mask = np.zeros((mh, mw), dtype=bool)
    for stroke in strokes:
        radius = max(1, int(round(stroke["size"] * 0.5 * scale)))
        for point in stroke["points"]:
            px = int(round(point[0] * scale))
            py = int(round(point[1] * scale))
            x0 = max(0, px - radius)
            x1 = min(mw, px + radius + 1)
            y0 = max(0, py - radius)
            y1 = min(mh, py + radius + 1)
            if x1 > x0 and y1 > y0:
                mask[y0:y1, x0:x1] = True
    return float(mask.mean())


# ---------------------------------------------------------------------------
# one pass over the cell grid
# ---------------------------------------------------------------------------


def _pass_candidates(gray, color_rgb, cscale, width, height, cell, params, style,
                     pass_index, passes, density, jitter, rng, max_candidates):
    size = max(1.0, cell * float(params["size_mul"]))
    if passes > 1:
        opacity = clamp(
            float(params["opacity"]) * (0.72 + 0.40 * (pass_index / float(passes - 1))),
            0.05, 1.0,
        )
    else:
        opacity = float(params["opacity"])
    hardness = float(params["hardness"])
    flow = float(params["flow"])
    spacing = float(params["spacing"])
    smoothing = float(params["smoothing"])
    preset = str(params["preset"])

    radius = max(1, int(cell / 2.0))
    nx = max(1, int(math.ceil(width / cell)))
    ny = max(1, int(math.ceil(height / cell)))
    xs = (np.arange(nx) + 0.5) * cell
    ys = (np.arange(ny) + 0.5) * cell
    ix = np.clip(xs.astype(np.int32), 0, width - 1)
    iy = np.clip(ys.astype(np.int32), 0, height - 1)

    gx, gy = sobel(gray)
    win = float((2 * radius + 1) ** 2)
    jxx = box_sum(gx * gx, radius)[np.ix_(iy, ix)] / win
    jyy = box_sum(gy * gy, radius)[np.ix_(iy, ix)] / win
    jxy = box_sum(gx * gy, radius)[np.ix_(iy, ix)] / win
    luma = box_sum(gray, radius)[np.ix_(iy, ix)] / win
    energy = np.sqrt(np.maximum(0.0, jxx + jyy))
    theta_g = 0.5 * np.arctan2(2.0 * jxy, jxx - jyy) + (math.pi / 2.0)

    keep = np.ones((ny, nx), dtype=bool)
    if style == "pencil":
        threshold = float(np.percentile(energy, PENCIL_ENERGY_PERCENTILE))
        keep &= energy >= max(threshold, 1e-6)
    if style == "ink":
        keep &= luma <= INK_MAX_LUMA

    energy_l = energy.ravel().tolist()
    theta_l = theta_g.ravel().tolist()
    keep_l = keep.ravel().tolist()
    xs_l = xs.tolist()
    ys_l = ys.tolist()

    order = np.arange(nx * ny)
    rng.shuffle(order)
    if order.size > MAX_SCAN_CELLS:
        order = order[:MAX_SCAN_CELLS]

    base_count = int(math.floor(density))
    fraction = density - base_count
    strokes = []
    color_cache = {}
    for raw_index in order.tolist():
        if len(strokes) >= max_candidates:
            break
        if not keep_l[raw_index]:
            continue
        emit_count = base_count
        if fraction > 0.0 and float(rng.random()) < fraction:
            emit_count += 1
        if emit_count <= 0:
            continue
        row = raw_index // nx
        col = raw_index % nx
        centre_x = xs_l[col]
        centre_y = ys_l[row]
        energy_here = energy_l[raw_index]
        if energy_here < 1e-3:
            theta = float(rng.uniform(0.0, math.pi))
        else:
            theta = theta_l[raw_index]
        if style == "crosshatch":
            family = math.pi / 4.0 if (pass_index % 2 == 0) else -math.pi / 4.0
            theta = family + float(rng.normal(0.0, jitter * 0.35))
        else:
            theta += float(rng.normal(0.0, jitter * 0.55))
        length = cell * float(params["len_mul"]) * (0.75 + 0.5 * float(rng.random()))
        if raw_index not in color_cache:
            bx = int(round(centre_x * cscale))
            by = int(round(centre_y * cscale))
            half = max(0, int(round(cell * cscale * 0.5)))
            color_cache[raw_index] = _pixel_median(color_rgb, bx, by, half)
        base = color_cache[raw_index]
        for _ in range(emit_count):
            if len(strokes) >= max_candidates:
                break
            cx = centre_x + float(rng.normal(0.0, jitter * cell * 0.30))
            cy = centre_y + float(rng.normal(0.0, jitter * cell * 0.30))
            points = _make_points(params["shape"], cx, cy, theta, length, cell, rng, params)
            colour = _style_color(base, style, float(params["tint"]), rng)
            jittered = clamp(size * (0.92 + 0.16 * float(rng.random())), 0.5, 5000.0)
            strokes.append({
                "points": _round_points(points, width, height),
                "size": round(jittered, 3),
                "hardness": round(hardness, 3),
                "opacity": round(opacity, 3),
                "flow": round(flow, 3),
                "color": hex_color(colour),
                "spacing": round(spacing, 3),
                "smoothing": round(smoothing, 3),
                "mode": "normal",
                "preset": preset,
            })
    info = {
        "pass": pass_index + 1,
        "cell": round(cell, 3),
        "size": round(size, 3),
        "opacity": round(opacity, 3),
        "candidates": len(strokes),
    }
    return strokes, info


# ---------------------------------------------------------------------------
# plan construction
# ---------------------------------------------------------------------------


def build_plan(path, style="impressionist", brush_size=24.0, density=1.0, passes=2,
               jitter=0.35, seed=7, max_strokes=4000, background=True, max_side=COLOR_SIDE):
    started = time.time()
    image, real_path = load_image(path)
    rgb = rgb_array(image)
    height, width = int(rgb.shape[0]), int(rgb.shape[1])
    gray = gray_of(rgb)

    if style not in STYLE_SPECS:
        raise ValueError("unknown style %s" % style)
    params = STYLE_SPECS[style]
    brush_size = clamp(float(brush_size), 0.5, 5000.0)
    density = clamp(float(density), 0.0, 4.0)
    passes = int(clamp_int(int(passes), 1, 6))
    jitter = clamp(float(jitter), 0.0, 2.0)
    budget = int(max(1, int(max_strokes)))
    rng = np.random.default_rng(int(seed) & 0xFFFFFFFFFFFFFFFF)

    if max(width, height) > int(max_side):
        color_rgb, cscale = downsample_rgb(rgb, int(max_side))
    else:
        color_rgb = rgb
        cscale = 1.0

    max_candidates = int(max(256, min(60000, budget * MAX_CANDIDATES_FACTOR)))
    per_pass = []
    reports = []
    for index in range(passes):
        cell = max(1.5, brush_size * (0.5 ** index))
        strokes, info = _pass_candidates(
            gray, color_rgb, cscale, width, height, cell, params, style,
            index, passes, density, jitter, rng, max_candidates,
        )
        per_pass.append(strokes)
        reports.append(info)

    total = sum(len(item) for item in per_pass)
    if total > budget:
        quotas = []
        remaining = budget
        count = len(per_pass)
        for i, item in enumerate(per_pass):
            if i == count - 1:
                quota = min(len(item), remaining)
            else:
                share = int(round(budget * len(item) / float(total)))
                quota = min(len(item), share, remaining)
            quota = max(0, quota)
            quotas.append(quota)
            remaining -= quota
        for i in range(count):
            if remaining <= 0:
                break
            room = len(per_pass[i]) - quotas[i]
            add = min(room, remaining)
            quotas[i] += add
            remaining -= add
    else:
        quotas = [len(item) for item in per_pass]

    strokes = []
    for item, quota in zip(per_pass, quotas):
        strokes.extend(item[:quota])
    for info, quota in zip(reports, quotas):
        info["strokes"] = quota
        del info["candidates"]

    coverage = _coverage(strokes, width, height)
    plan = {
        "version": PLAN_VERSION,
        "image": {"path": real_path, "width": width, "height": height},
        "backgroundLayer": ({"place": real_path} if background else None),
        "strokes": strokes,
    }
    return {
        "plan": plan,
        "strokes": len(strokes),
        "width": width,
        "height": height,
        "style": style,
        "passes": reports,
        "coverage": round(coverage, 4),
        "seconds": round(time.time() - started, 3),
    }


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        args = parse_args(argv, {
            "image": (str, None),
            "out": (str, None),
            "style": (str, "impressionist"),
            "brush_size": (float, 24.0),
            "density": (float, 1.0),
            "passes": (int, 2),
            "jitter": (float, 0.35),
            "seed": (int, 7),
            "max_strokes": (int, 4000),
            "background": (bool, True),
            "debug": (bool, False),
        })
        if args["image"] is None:
            positional = [a for a in argv if not a.startswith("--")]
            if positional:
                args["image"] = positional[-1]
        if not args["image"]:
            return fail("missing --image <path>")
        out = args["out"]
        if not out:
            out = os.path.splitext(os.path.abspath(args["image"]))[0] + ".plan.json"
        if args["style"] not in STYLES:
            return fail("unknown --style %s (expected one of %s)" % (args["style"], ", ".join(STYLES)))
        if args["debug"]:
            log("brush_plan %s style=%s" % (args["image"], args["style"]))
        result = build_plan(
            args["image"],
            style=args["style"],
            brush_size=float(args["brush_size"]),
            density=float(args["density"]),
            passes=int(args["passes"]),
            jitter=float(args["jitter"]),
            seed=int(args["seed"]),
            max_strokes=int(args["max_strokes"]),
            background=bool(args["background"]),
        )
        save_json(out, result["plan"])
        emit({
            "ok": True,
            "strokes": result["strokes"],
            "width": result["width"],
            "height": result["height"],
            "plan": out,
            "style": result["style"],
            "passes": result["passes"],
            "coverage": result["coverage"],
            "seconds": result["seconds"],
        })
        return 0
    except Exception as exc:  # noqa: BLE001 - contract: report, never crash
        return fail("%s: %s" % (type(exc).__name__, exc))


if __name__ == "__main__":
    sys.exit(main())