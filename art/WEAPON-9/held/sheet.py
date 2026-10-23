"""WEAPON-9 PR-1: ゲーム内 撮影（e2e-perf/weapon9-pr1.shots.ts の 出力）から 並べ画像と GIF を 作る。
使い方: python3 art/WEAPON-9/held/sheet.py <撮影の フォルダ> <出力フォルダ> [niji の 前の 版の フォルダ]
  held-sheet.png（比べ用: 各 武器 2 段 = main の 今 / 新しい）・held-<武器>.gif・charge-<武器>.gif"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

SRC, DST = sys.argv[1], sys.argv[2]
NIJI_MAIN = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(DST, exist_ok=True)
CW, CH = 400, 360


def center(dir_, n=1):
    im = np.array(Image.open(f"{dir_}/{n:04d}.png").convert("RGB")).astype(int)
    m = (im[..., 0] > 200) & (im[..., 1] < 60) & (im[..., 2] > 90) & (im[..., 2] < 170)
    ys, xs = np.nonzero(m)
    return int(xs.mean()), int(ys.mean())


def crop(dir_, n, c):
    im = Image.open(f"{dir_}/{n:04d}.png").convert("RGB")
    x0, y0 = max(0, c[0] - 170), max(0, c[1] - 200)
    return im.crop((x0, y0, x0 + CW, y0 + CH))


def pick(meta):
    out = [("stand", 1)]
    for tech in ("thrust", "kiriage", "kesa"):
        fr = [m for m in meta[1:] if m.get("tech") == tech]
        su = [m for m in fr if m["phase"] == "startup"]
        ac = [m for m in fr if m["phase"] == "active"]
        re = [m for m in fr if m["phase"] == "recovery"]
        if su:
            out.append((f"{tech} wind", su[len(su) * 2 // 3]["n"]))
        if ac:
            out.append((f"{tech} hit", ac[len(ac) // 2]["n"]))
        if re:
            out.append((f"{tech} end", re[len(re) // 4]["n"]))
    return out


def charge_pose(cdir):
    meta = json.load(open(f"{cdir}/meta.json"))
    for i, m in enumerate(meta):
        if m.get("hand", 0) and m["hand"] >= 1:
            return i + 2 + 1  # 光りはじめの すこし あと（ファイルは 0 番が 開始前）
    return 2


def seq(w, which):
    if which == "main" and w == "niji":
        return NIJI_MAIN
    return f"{SRC}/{w}-{'old' if which == 'main' else 'new'}-attack"


def ffgif(dirpat, out, fps=50):
    vf = "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none"
    subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", dirpat, "-vf", vf, "-loop", "0", out])


rows = []
for w in ("raijin", "fujin", "niji"):
    for which in ("main", "new"):
        d = seq(w, which)
        if not d or not os.path.isdir(d):
            continue
        meta = json.load(open(f"{d}/meta.json"))
        c = center(d)
        cells = pick(meta)
        cdir = f"{SRC}/{w}-{'old' if which == 'main' else 'new'}-charge"
        if which == "main" and w == "niji":
            cdir = f"{os.path.dirname(NIJI_MAIN)}/niji-new-charge"
        frames = [("stand", crop(d, 1, c))]
        if os.path.isdir(cdir) and os.path.exists(f"{cdir}/meta.json"):
            frames.append(("charge ready", crop(cdir, charge_pose(cdir), c)))
        frames += [(lab, crop(d, n, c)) for lab, n in cells[1:]]
        rows.append((f"{w} {'MAIN (now)' if which == 'main' else 'NEW'}", frames))
        if which == "new":
            # 3 段攻撃の GIF（切りぬき）
            tmp = f"{DST}/.tmp-{w}"
            os.makedirs(tmp, exist_ok=True)
            for i in range(1, len(meta) + 1):
                crop(d, i, c).save(f"{tmp}/{i:04d}.png")
            ffgif(f"{tmp}/%04d.png", f"{DST}/held-{w}.gif")
            # ため → いっぱい → はなす の GIF
            cm = json.load(open(f"{cdir}/meta.json"))
            tmp2 = f"{DST}/.tmpc-{w}"
            os.makedirs(tmp2, exist_ok=True)
            for i in range(1, len(cm) + 2):
                crop(cdir, i, c).save(f"{tmp2}/{i:04d}.png")
            ffgif(f"{tmp2}/%04d.png", f"{DST}/charge-{w}.gif")

ncol = max(len(f) for _, f in rows)
sheet = Image.new("RGB", (ncol * CW, len(rows) * (CH + 24)), (30, 30, 36))
dr = ImageDraw.Draw(sheet)
for r, (label, frames) in enumerate(rows):
    y = r * (CH + 24)
    dr.text((6, y + 4), label, fill=(255, 255, 255))
    for i, (lab, im) in enumerate(frames):
        sheet.paste(im, (i * CW, y + 24))
        dr.text((i * CW + 6, y + 24 + 4), lab, fill=(20, 20, 20))
sheet.save(f"{DST}/held-sheet.png")
print("rows", len(rows), "cols", ncol)
