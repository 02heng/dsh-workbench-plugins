#!/usr/bin/env python3
"""PhotoCraft sidecar self-test.

One command, no extra dependencies: checks watermark detection against the
real acceptance assets, then checks every brush style plan for contract
validity, determinism and the hard stroke cap.

    python selftest.py [--assets DIR] [--plan-image NAME] [--styles a,b,c]
                       [--seed 7] [--passes 2] [--brush-size 24]
                       [--max-strokes 1500] [--budget 2.0] [--json] [--debug]

Contract: never crashes.  The last line is always a single-line JSON object
with "ok" (true only when every graded check passed); the human table above
it lists each check.  The exit code stays 0 by design - read "ok".
"""

import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import numpy as np
from PIL import Image, ImageDraw

import brush_plan
import detect_watermark
from pc_common import box_iou, clamp, load_image, parse_args, rgb_array

DEFAULT_ASSETS = os.environ.get("PHOTOCRAFT_TEST_ASSETS") or r"D:/dsh-workbench/tmp/psv"
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
STROKE_KEYS = ("points", "size", "hardness", "opacity", "flow", "color",
                "spacing", "smoothing", "mode", "preset")

# graded detection rows: file -> (truth bbox or None, min IoU or None)
# None truth + found false means the image must be reported as clean.
DETECT_CASES = (
    ("bake-wm.png", (880, 698, 232, 54), 0.85),
    ("bake-clean.png", None, None),
    ("photo-watermark.png", (668, 514, 192, 53), 0.45),
    ("photo-clean.png", None, None),
    ("cutout-subject.png", None, None),
)


class Report(object):
    def __init__(self):
        self.rows = []
        self.graded_fail = 0
        self.graded = 0

    def add(self, group, name, ok, detail, graded=True):
        if graded:
            self.graded += 1
            if not ok:
                self.graded_fail += 1
        self.rows.append((group, name, bool(ok), detail, bool(graded)))

    def dump(self):
        group = None
        for g, name, ok, detail, graded in self.rows:
            if g != group:
                group = g
                print("")
                print("-- %s --" % g)
            tag = "PASS" if ok else ("FAIL" if graded else "INFO")
            print("%-22s %-4s %s" % (name, tag, detail))


def plan_errors(plan, width, height):
    errs = []
    if plan.get("version") != 1:
        errs.append("version!=1")
    img = plan.get("image") or {}
    if int(img.get("width", 0)) != width or int(img.get("height", 0)) != height:
        errs.append("image size mismatch")
    if "backgroundLayer" not in plan:
        errs.append("backgroundLayer missing")
    strokes = plan.get("strokes") or []
    if not strokes:
        errs.append("no strokes")
    for i, s in enumerate(strokes):
        for k in STROKE_KEYS:
            if k not in s:
                errs.append("stroke %d missing %s" % (i, k))
                break
        pts = s.get("points") or []
        if not pts:
            errs.append("stroke %d has no points" % i)
            continue
        for p in pts:
            x, y = p[0], p[1]
            if int(x) != x or int(y) != y:
                errs.append("stroke %d non-integer coords" % i)
                break
            if not (0 <= x < width and 0 <= y < height):
                errs.append("stroke %d outside canvas" % i)
                break
        if not HEX.match(str(s.get("color", ""))):
            errs.append("stroke %d bad color" % i)
        if s.get("mode") != "normal":
            errs.append("stroke %d mode!=normal" % i)
        size = float(s.get("size", 0))
        if not (0.5 <= size <= 5000.0):
            errs.append("stroke %d size %s" % (i, size))
        if len(errs) > 4:
            break
    return errs


def plan_signature(plan):
    return json.dumps(plan, sort_keys=True, separators=(",", ":"))


def check_watermark(rep, assets, budget, debug):
    for name, truth, min_iou in DETECT_CASES:
        path = os.path.join(assets, name)
        if not os.path.isfile(path):
            rep.add("watermark detection", name, False, "missing asset", graded=True)
            continue
        try:
            res = detect_watermark.detect(path)
        except Exception as exc:  # noqa: BLE001
            rep.add("watermark detection", name, False, "%s: %s" % (type(exc).__name__, exc))
            continue
        secs = float(res.get("seconds", 0.0))
        if truth is None:
            ok = res.get("found") is False
            detail = "found=%s conf=%.2f %.3fs" % (res.get("found"), float(res.get("confidence", 0.0)), secs)
            rep.add("watermark detection", name, ok, detail)
        else:
            iou = box_iou(res.get("bbox"), truth) if res.get("bbox") else 0.0
            ok = bool(res.get("found")) and iou >= min_iou
            detail = "found=%s IoU=%.4f (>=%.2f) conf=%.2f %.3fs" % (
                res.get("found"), iou, min_iou, float(res.get("confidence", 0.0)), secs)
            rep.add("watermark detection", name, ok, detail)
            if abs(res.get("width", 0) - 1200) == 0 and abs(res.get("height", 0) - 800) == 0:
                rep.add("watermark detection", name + " <%.1fs" % budget, secs < budget, "%.3fs" % secs)


def check_styles(rep, image, styles, args):
    try:
        im, _ = load_image(image)
        width, height = int(im.size[0]), int(im.size[1])
    except Exception as exc:  # noqa: BLE001
        rep.add("brush plans", os.path.basename(image), False, "%s: %s" % (type(exc).__name__, exc))
        return
    for style in styles:
        started = time.time()
        try:
            first = brush_plan.build_plan(image, style=style, brush_size=args["brush_size"],
                                        density=args["density"], passes=args["passes"],
                                        jitter=args["jitter"], seed=args["seed"],
                                        max_strokes=args["max_strokes"])
            second = brush_plan.build_plan(image, style=style, brush_size=args["brush_size"],
                                         density=args["density"], passes=args["passes"],
                                         jitter=args["jitter"], seed=args["seed"],
                                         max_strokes=args["max_strokes"])
            other = brush_plan.build_plan(image, style=style, brush_size=args["brush_size"],
                                        density=args["density"], passes=args["passes"],
                                        jitter=args["jitter"], seed=args["seed"] + 1,
                                        max_strokes=args["max_strokes"])
        except Exception as exc:  # noqa: BLE001
            rep.add("brush plans", style, False, "%s: %s" % (type(exc).__name__, exc))
            continue
        secs = round(time.time() - started, 3)
        errs = plan_errors(first["plan"], width, height)
        rep.add("brush plans", style + " valid", not errs,
                "strokes=%d coverage=%.4f" % (first["strokes"], float(first["coverage"]))
                if not errs else "; ".join(errs[:3]))
        same = plan_signature(first["plan"]) == plan_signature(second["plan"])
        differs = plan_signature(first["plan"]) != plan_signature(other["plan"])
        rep.add("brush plans", style + " seed", same and differs,
                "seed%d deterministic=%s seed%d differs=%s" % (args["seed"], same, args["seed"] + 1, differs))
        rep.add("brush plans", style + " max-strokes", first["strokes"] <= args["max_strokes"],
                "%d <= %d" % (first["strokes"], args["max_strokes"]))
        rep.add("brush plans", style + " coverage", float(first["coverage"]) > 0.05,
                "coverage=%.4f %ss" % (float(first["coverage"]), secs))


def make_synthetic(dirpath):
    """Fallback smoke assets when the real acceptance images are absent."""
    rng = np.random.default_rng(11)
    h, w = 800, 1200
    yy = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    base = np.zeros((h, w, 3), dtype=np.float32)
    base[..., 0] = 70 + 60 * yy
    base[..., 1] = 96 + 40 * yy
    base[..., 2] = 140 - 30 * yy
    for _ in range(40):
        x0 = int(rng.integers(0, w - 120)); y0 = int(rng.integers(0, h - 120))
        bw = int(rng.integers(40, 220)); bh = int(rng.integers(30, 160))
        col = rng.integers(40, 220, size=3)
        base[y0:y0 + bh, x0:x0 + bw] = col.astype(np.float32) * 0.7 + base[y0:y0 + bh, x0:x0 + bw] * 0.3
    xx = np.arange(w, dtype=np.float32)[None, :]
    base += (14.0 * np.sin(xx / 23.0))[..., None]
    clean_im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    clean_path = os.path.join(dirpath, "synthetic-clean.png")
    clean_im.save(clean_path)
    font = None
    try:
        from PIL import ImageFont
        font = ImageFont.load_default(size=34)
    except Exception:  # noqa: BLE001
        font = None
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    text = "Doubao AI"
    if font is not None:
        tb = draw.textbbox((0, 0), text, font=font)
    else:
        tb = (0, 0, len(text) * 6, 11)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    tx, ty = w - tw - 64, h - th - 48
    draw.rounded_rectangle((tx - 46, ty - 4, tx - 12, ty + 32), radius=8, fill=(255, 255, 255, 200))
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 190))
    wm_im = Image.alpha_composite(clean_im.convert("RGBA"), layer).convert("RGB")
    wm_path = os.path.join(dirpath, "synthetic-wm.png")
    wm_im.save(wm_path)
    truth = (max(0, tx - 50), max(0, ty - 8), tw + 58, th + 44)
    return clean_path, wm_path, truth


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        args = parse_args(argv, {
            "assets": (str, DEFAULT_ASSETS),
            "plan_image": (str, None),
            "styles": (str, "impressionist,pointillist,crosshatch,ink,pencil,flat"),
            "seed": (int, 7),
            "passes": (int, 2),
            "brush_size": (float, 24.0),
            "density": (float, 1.0),
            "jitter": (float, 0.35),
            "max_strokes": (int, 1500),
            "budget": (float, 2.0),
            "json": (bool, False),
            "debug": (bool, False),
        })
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}))
        return 0

    assets = os.path.abspath(str(args["assets"]))
    styles = [s.strip() for s in str(args["styles"]).split(",") if s.strip()]
    rep = Report()
    print("== PhotoCraft sidecar selftest ==")
    print("assets: %s" % assets)
    print("python: %s  Pillow %s  numpy %s" % (sys.version.split()[0], Image.__version__, np.__version__))

    if not os.path.isdir(assets):
        os.makedirs(assets, exist_ok=True)
    missing = [c[0] for c in DETECT_CASES if not os.path.isfile(os.path.join(assets, c[0]))]
    if missing:
        print("missing assets: %s" % ", ".join(missing))
        rep.add("watermark detection", "assets", False, "missing: " + ", ".join(missing))
        try:
            clean_path, wm_path, truth = make_synthetic(assets)
            res = detect_watermark.detect(wm_path)
            iou = box_iou(res.get("bbox"), truth) if res.get("bbox") else 0.0
            rep.add("synthetic smoke", "wm detected", bool(res.get("found")),
                    "found=%s IoU=%.3f (informational)" % (res.get("found"), iou), graded=False)
            res2 = detect_watermark.detect(clean_path)
            rep.add("synthetic smoke", "clean rejected", res2.get("found") is False,
                    "found=%s (informational)" % res2.get("found"), graded=False)
        except Exception as exc:  # noqa: BLE001
            rep.add("synthetic smoke", "generator", False, "%s: %s" % (type(exc).__name__, exc), graded=False)
    else:
        check_watermark(rep, assets, float(args["budget"]), bool(args["debug"]))

    plan_image = args["plan_image"] or os.path.join(assets, "photo-clean.png")
    if not os.path.isfile(plan_image):
        plan_image = os.path.join(assets, "bake-clean.png")
    if not os.path.isfile(plan_image):
        try:
            plan_image = make_synthetic(assets)[0]
        except Exception:  # noqa: BLE001
            plan_image = None
    if plan_image and os.path.isfile(plan_image):
        print("plan image: %s" % plan_image)
        check_styles(rep, plan_image, styles, args)
    else:
        rep.add("brush plans", "image", False, "no test image available")

    rep.dump()
    ok = rep.graded_fail == 0 and rep.graded > 0
    print("RESULT: %s  (%d/%d graded checks passed)" % ("PASS" if ok else "FAIL",
                                                         rep.graded - rep.graded_fail, rep.graded))
    out = {
        "ok": bool(ok),
        "graded": int(rep.graded),
        "passed": int(rep.graded - rep.graded_fail),
        "failed": int(rep.graded_fail),
        "assets": assets,
        "plan_image": plan_image,
        "styles": styles,
        "checks": [{"group": g, "name": n, "ok": o, "detail": d, "graded": gr}
                   for (g, n, o, d, gr) in rep.rows],
    }
    print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
