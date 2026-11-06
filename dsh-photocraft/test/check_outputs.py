#!/usr/bin/env python
"""pc-verify: dsh-photocraft 输出的像素级断言。

stdout 始终是一行 JSON：{"ok":bool,"checks":[{name,ok,detail}],"error"?}
exit 0 = 全部通过；exit 1 = 有断言失败；exit 2 = 参数/IO 错误。
只依赖 Pillow + numpy（本机 bundled python 自带）。
"""
import argparse
import json
import sys

import numpy as np
from PIL import Image

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def load(path, mode="RGB"):
    return Image.open(path).convert(mode)


def report(checks, error=None):
    ok = error is None and all(bool(c.get("ok")) for c in checks)
    body = {"ok": ok, "checks": checks}
    if error:
        body["error"] = error
    print(json.dumps(body, ensure_ascii=False))
    sys.exit(0 if ok else (2 if error else 1))


def mae(a, b):
    return float(np.mean(np.abs(a.astype(np.float64) - b.astype(np.float64))))


def parse_bbox(text):
    parts = [int(round(float(v))) for v in str(text).replace(" ", "").split(",")]
    if len(parts) != 4:
        raise ValueError("bbox 需要 x,y,w,h，收到: " + str(text))
    return parts


def cmd_watermark(args):
    out_img = Image.open(args.output)
    ref_img = Image.open(args.reference)
    out_rgb = np.asarray(out_img.convert("RGB"))
    ref_rgb = np.asarray(ref_img.convert("RGB"))
    checks = []
    if out_rgb.shape != ref_rgb.shape:
        report([], "尺寸不一致: output " + str(out_rgb.shape) + " vs reference " + str(ref_rgb.shape))
    x, y, w, h = parse_bbox(args.bbox)
    x0, y0 = max(0, x), max(0, y)
    x1 = min(ref_rgb.shape[1], x + w)
    y1 = min(ref_rgb.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        report([], "bbox 裁切为空: " + args.bbox)
    region_mae = mae(out_rgb[y0:y1, x0:x1], ref_rgb[y0:y1, x0:x1])
    full_mae = mae(out_rgb, ref_rgb)
    checks.append({
        "name": "region-mae",
        "ok": region_mae < args.max_mae,
        "detail": "region-mae=%.4f (< %s) bbox=%d,%d,%d,%d" % (region_mae, args.max_mae, x0, y0, x1 - x0, y1 - y0),
    })
    checks.append({
        "name": "full-mae",
        "ok": full_mae < args.max_full_mae,
        "detail": "full-mae=%.4f (< %s)" % (full_mae, args.max_full_mae),
    })
    # 水印区必须真的被改过：输出与输入（若有）在该区应不同，避免"输出==输入"假通过
    if args.unfixed:
        src = np.asarray(Image.open(args.unfixed).convert("RGB"))
        if src.shape == out_rgb.shape:
            delta = mae(src[y0:y1, x0:x1], out_rgb[y0:y1, x0:x1])
            checks.append({
                "name": "region-changed",
                "ok": delta >= args.min_delta,
                "detail": "unfixed->output delta=%.4f (>= %s)" % (delta, args.min_delta),
            })
    report(checks)


def cmd_detect(args):
    try:
        with open(args.json, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except Exception as exc:
        report([], "无法读取检测 JSON: " + str(exc))
    checks = []
    found = payload.get("found")
    if args.expect == "found":
        checks.append({"name": "found", "ok": found is True, "detail": "found=" + repr(found)})
        bbox = payload.get("bbox")
        ok_bbox = isinstance(bbox, list) and len(bbox) == 4 and all(isinstance(v, (int, float)) for v in bbox)
        checks.append({"name": "bbox-shape", "ok": ok_bbox, "detail": "bbox=" + repr(bbox)})
        if args.iou:
            want = parse_bbox(args.iou)
            if ok_bbox:
                got = [float(v) for v in bbox]
                ix0, iy0 = max(got[0], want[0]), max(got[1], want[1])
                ix1 = min(got[0] + got[2], want[0] + want[2])
                iy1 = min(got[1] + got[3], want[1] + want[3])
                inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
                union = got[2] * got[3] + want[2] * want[3] - inter
                iou = inter / union if union > 0 else 0.0
                checks.append({"name": "bbox-iou", "ok": iou >= args.min_iou, "detail": "IoU=%.4f (>= %s)" % (iou, args.min_iou)})
            else:
                checks.append({"name": "bbox-iou", "ok": False, "detail": "bbox 非法，无法算 IoU"})
    else:
        checks.append({"name": "not-found", "ok": found is False, "detail": "found=" + repr(found)})
    if args.image_size:
        try:
            w_img, h_img = [int(v) for v in args.image_size.split(",")]
            checks.append({"name": "width", "ok": payload.get("width") == w_img, "detail": "width=" + repr(payload.get("width"))})
            checks.append({"name": "height", "ok": payload.get("height") == h_img, "detail": "height=" + repr(payload.get("height"))})
        except Exception:
            pass
    report(checks)


def cmd_cutout(args):
    img = Image.open(args.output)
    checks = []
    checks.append({"name": "mode-rgba", "ok": img.mode in ("RGBA", "LA", "PA"), "detail": "mode=" + str(img.mode)})
    rgba = img.convert("RGBA")
    arr = np.asarray(rgba)
    alpha = arr[:, :, 3]
    ratio = float(np.mean(alpha == 0))
    checks.append({
        "name": "transparent-ratio",
        "ok": ratio > args.min_transparent,
        "detail": "alpha==0 ratio=%.4f (> %s)" % (ratio, args.min_transparent),
    })
    h, w = alpha.shape
    if args.center:
        cx, cy = [int(v) for v in args.center.split(",")]
    else:
        cx, cy = w // 2, h // 2
    opaque = float(np.mean(alpha > 0))
    checks.append({
        "name": "center-opaque",
        "ok": int(alpha[cy, cx]) > 0,
        "detail": "center(%d,%d) alpha=%d" % (cx, cy, int(alpha[cy, cx])),
    })
    checks.append({"name": "foreground-exists", "ok": opaque > 0.001, "detail": "opaque ratio=%.4f" % opaque})
    report(checks)


def cmd_paint(args):
    out = Image.open(args.output)
    ref = Image.open(args.reference)
    checks = []
    size_out = out.size
    size_ref = ref.size
    g_out = np.asarray(out.convert("L").resize(size_ref), dtype=np.float64)
    g_ref = np.asarray(ref.convert("L").resize(size_ref), dtype=np.float64)
    std_out = float(np.std(g_out))
    checks.append({"name": "non-blank", "ok": std_out > args.min_std, "detail": "grayscale std=%.4f (> %s)" % (std_out, args.min_std)})
    flat_out = g_out.ravel()
    flat_ref = g_ref.ravel()
    if float(np.std(flat_out)) == 0.0 or float(np.std(flat_ref)) == 0.0:
        checks.append({"name": "correlation", "ok": False, "detail": "灰度方差为 0，无法算相关系数"})
    else:
        corr = float(np.corrcoef(flat_out, flat_ref)[0, 1])
        checks.append({
            "name": "correlation",
            "ok": corr > args.min_corr,
            "detail": "grayscale corr=%.4f (> %s); output=%s reference=%s" % (corr, args.min_corr, size_out, size_ref),
        })
    report(checks)


def cmd_plan(args):
    with open(args.json, "r", encoding="utf-8") as fh:
        plan = json.load(fh)
    strokes = plan.get("strokes", [])
    image = plan.get("image", {})
    width = image.get("width")
    height = image.get("height")
    checks = []
    checks.append({"name": "stroke-count", "ok": 0 < len(strokes) <= args.max_strokes, "detail": "strokes=%d (<= %s)" % (len(strokes), args.max_strokes)})
    in_bounds = True
    bad = None
    for stroke in strokes:
        for point in stroke.get("points", []):
            x, y = point[0], point[1]
            if width is not None and not (0 <= float(x) <= width - 1):
                in_bounds = False
                bad = "x=%s width=%s" % (x, width)
                break
            if height is not None and not (0 <= float(y) <= height - 1):
                in_bounds = False
                bad = "y=%s height=%s" % (y, height)
                break
        if not in_bounds:
            break
    checks.append({"name": "in-bounds", "ok": in_bounds, "detail": bad or "all points inside canvas"})
    report(checks)


def cmd_protect(args):
    """内容保护：只允许 bbox 内变化；bbox 外必须与原图一致（逐像素）。"""
    out_rgb = np.asarray(Image.open(args.output).convert("RGB"))
    ref_rgb = np.asarray(Image.open(args.reference).convert("RGB"))
    checks = []
    if out_rgb.shape != ref_rgb.shape:
        report([], "尺寸不一致: output " + str(out_rgb.shape) + " vs reference " + str(ref_rgb.shape))
    x, y, w, h = parse_bbox(args.bbox)
    x0, y0 = max(0, x), max(0, y)
    x1 = min(ref_rgb.shape[1], x + w)
    y1 = min(ref_rgb.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        report([], "bbox 裁切为空: " + args.bbox)
    mask = np.ones(ref_rgb.shape[:2], dtype=bool)
    mask[y0:y1, x0:x1] = False
    diff = np.abs(out_rgb.astype(np.int16) - ref_rgb.astype(np.int16))
    outside = diff[mask]
    outside_mae = float(outside.mean()) if outside.size else 0.0
    outside_max = int(outside.max()) if outside.size else 0
    checks.append({
        "name": "outside-identical",
        "ok": outside_mae <= args.max_outside_mae,
        "detail": "outside-mae=%.6f (<= %s) outside-maxdiff=%d outside-pixels=%d bbox=%d,%d,%d,%d"
                  % (outside_mae, args.max_outside_mae, outside_max, int(mask.sum()), x0, y0, x1 - x0, y1 - y0),
    })
    if args.unfixed:
        src = np.asarray(Image.open(args.unfixed).convert("RGB"))
        if src.shape == out_rgb.shape:
            inside_delta = mae(src[y0:y1, x0:x1], out_rgb[y0:y1, x0:x1])
            checks.append({
                "name": "inside-changed",
                "ok": inside_delta >= args.min_delta,
                "detail": "unfixed->output inside delta=%.4f (>= %s)" % (inside_delta, args.min_delta),
            })
        else:
            checks.append({"name": "inside-changed", "ok": False, "detail": "unfixed 与输出尺寸不一致"})
    report(checks)


def main():
    parser = argparse.ArgumentParser(description="dsh-photocraft pixel assertions")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("watermark")
    p.add_argument("--output", required=True)
    p.add_argument("--reference", required=True)
    p.add_argument("--bbox", required=True)
    p.add_argument("--max-mae", type=float, default=4.0)
    p.add_argument("--max-full-mae", type=float, default=4.0)
    p.add_argument("--unfixed")
    p.add_argument("--min-delta", type=float, default=1.0)
    p.set_defaults(fn=cmd_watermark)

    p = sub.add_parser("detect")
    p.add_argument("--json", required=True)
    p.add_argument("--expect", choices=["found", "not-found"], default="found")
    p.add_argument("--iou", default=None)
    p.add_argument("--min-iou", type=float, default=0.85)
    p.add_argument("--image-size", default=None)
    p.set_defaults(fn=cmd_detect)

    p = sub.add_parser("cutout")
    p.add_argument("--output", required=True)
    p.add_argument("--min-transparent", type=float, default=0.5)
    p.add_argument("--center", default=None)
    p.set_defaults(fn=cmd_cutout)

    p = sub.add_parser("paint")
    p.add_argument("--output", required=True)
    p.add_argument("--reference", required=True)
    p.add_argument("--min-corr", type=float, default=0.5)
    p.add_argument("--min-std", type=float, default=3.0)
    p.set_defaults(fn=cmd_paint)

    p = sub.add_parser("plan")
    p.add_argument("--json", required=True)
    p.add_argument("--max-strokes", type=int, default=4000)
    p.set_defaults(fn=cmd_plan)

    p = sub.add_parser("protect")
    p.add_argument("--output", required=True)
    p.add_argument("--reference", required=True)
    p.add_argument("--bbox", required=True)
    p.add_argument("--max-outside-mae", type=float, default=0.0)
    p.add_argument("--unfixed")
    p.add_argument("--min-delta", type=float, default=1.0)
    p.set_defaults(fn=cmd_protect)

    args = parser.parse_args()
    try:
        args.fn(args)
    except FileNotFoundError as exc:
        report([], "文件不存在: " + str(exc))
    except Exception as exc:
        report([], type(exc).__name__ + ": " + str(exc))


if __name__ == "__main__":
    main()