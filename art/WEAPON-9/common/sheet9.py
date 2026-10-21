"""WEAPON-9: 1 案の 見本シート（sheet.png）・動き（scene.gif）・外から の 決めの 絵を 作る。

案の build.py が P（辞書）を 作って make(P) を よぶ。
カメラ（決定 2026-10-21-niji-shining-camera-damage.md）: 三人称は 12 まで 引いて 外から。中から の 絵は 一人称 だけ。
"""
import math
import os

import numpy as np
from PIL import Image

import kit9
from kit9 import kit

GOLD = (255, 226, 150)
LW, LH = 640 // 3, 400 // 3  # 外（12）は 1/3 の 解像度で 描いて 3 倍（1 点 ≒ 1/8 ブロック）
FW, FH = 640 // 4, 400 // 4  # 一人称は 1/4


def scene(P, step, yaw=0.0, first=False, size=(640, 400), lowres=None, dome=True):
    st = kit9.shining_state(step)
    if first:
        w, h = lowres or (FW, FH)
        cam = kit9.first_cam(yaw, st["feet"], w, h)
    else:
        w, h = lowres or (LW, LH)
        cam = kit9.third_cam(12.0 if step > 0 else 4.0 + 8.0 * 0, yaw, st["feet"], w, h)
    light = P.get("light", 0.3) * st["k"]
    fr = kit9.Frame(cam, light=light, light_tint=P.get("tint", (1.0, 0.97, 0.9)))
    if not first:
        kit9.put_kid(fr, st["feet"])
    fr.mark_base()
    if dome and st["r"] > 0.05:
        P["render"](fr, st, step / 60.0, first)
    return fr, fr.image(size)


def cam_dist(step):
    """§5.6 B: うかぶ 40 で 4 → 12、とどまる 12、おりる 40 で 12 → 4"""
    if step <= 0 or step > 240:
        return 4.0
    if step <= 40:
        return 4 + 8 * kit9.ease(step / 40)
    if step <= 200:
        return 12.0
    return 4 + 8 * kit9.ease((240 - step) / 40)


def scene_t(P, step, size, yaw=0.0):
    """タイムライン用（カメラの 引きも 入れる）"""
    st = kit9.shining_state(step)
    cam = kit9.third_cam(cam_dist(step), yaw, st["feet"], LW, LH)
    fr = kit9.Frame(cam, light=P.get("light", 0.3) * st["k"], light_tint=P.get("tint", (1.0, 0.97, 0.9)))
    kit9.put_kid(fr, st["feet"])
    fr.mark_base()
    if st["r"] > 0.05:
        P["render"](fr, st, step / 60.0, False)
    return fr.image(size)


TIMELINE = [  # (名前, step, そこに いる ステップ数)
    ("ため おわり", 0, 150),
    ("うかぶ F8", 8, 12),
    ("うかぶ F20", 20, 12),
    ("うかぶ F40", 40, 16),
    ("★とどまる", 120, 160),
    ("とどまる F200", 200, 4),
    ("おりる F216", 216, 12),
    ("おりる F232", 232, 8),
    ("もどり", 250, 20),
]


def make(P):
    out = P["out"]
    os.makedirs(out, exist_ok=True)
    key_step = 120
    fr_key, key = scene(P, key_step)
    _, key_fp = scene(P, key_step, first=True)
    key.save(os.path.join(out, "key_outside.png"))
    key_fp.save(os.path.join(out, "key_first.png"))

    W, H = 1800, 2120
    sh = kit.Sheet(W, H)
    sh.text((24, 14), P["title"], 32, GOLD)
    y = 58
    for line in P["concept"]:
        sh.text((24, y), line, 17)
        y += 25

    # 段 1: 外（12）・一人称・色
    y1 = 150
    sh.label_img((24, y1), key, "三人称・外から（カメラ 12。とどまる F120。1 点 ≒ 1/8 ブロック）", 15)
    sh.label_img((684, y1), key_fp, "一人称・中から（まく と 光の 玉は 出さない）", 15)
    py = sh.palette((1344, y1 + 4), P["palette"], sw=22)
    sh.text((1344, py + 2), P.get("pal_note", "足し算: 暗い 色 = すける。半透明の 点 なし"), 12, kit.SUB)

    # 段 2: よこから 見た 動き（タイムライン。カメラの 引きこみ）
    y2 = 600
    sh.text((24, y2), "動き（区間 と ステップ。1 ステップ = 1/60 秒。カメラは うかぶ 40 で 4 → 12、おりる 40 で 12 → 4。★ = 決め）", 16, GOLD)
    gif = []
    x = 24
    for name, stp, dur in TIMELINE:
        im = scene_t(P, stp, (184, 115))
        sh.label_img((x, y2 + 26), im, f"{name}（{dur}）", 12, kit.INK)
        gif.append((scene_t(P, stp, (640, 400)), dur))
        x += 194

    # 段 3: 8 方向（外から 12）
    y3 = 770
    sh.text((24, y3), "8 方向ならべ（外から 12。カメラの 向き 0°〜315°。板は どれも カメラに 正面 → 線に ならない・二重に ならない）", 16, GOLD)
    x = 24
    for i in range(8):
        _, im = scene(P, key_step, yaw=i * 45, size=(212, 132))
        sh.label_img((x, y3 + 26), im, f"{i * 45}°", 12)
        x += 220

    # 段 4: 部品・斬撃・アイコン
    y4 = 960
    sh.text((24, y4), "部品（ゲームに 入れる 1x の 絵を 拡大）", 16, GOLD)
    x = 24
    for label, img, k in P["parts"]:
        bg = Image.new("RGBA", img.size, (*kit.BG, 255))
        bg.alpha_composite(img)
        big = bg.resize((img.width * k, img.height * k), Image.NEAREST)
        sh.label_img((x, y4 + 26), big, label, 12)
        x += big.width + 16
    # 斬撃
    y4b = 1250
    sh.text((24, y4b), "にじの 斬撃（今の 刃の 軌跡〈4 段の 帯〉の 色と 形。1 点 = 1/16 ブロック。4 倍）", 16, GOLD)
    x = 24
    for i, (lab, im) in enumerate(P["slash"]):
        bg = Image.new("RGBA", im.size, (*kit.BG, 255))
        bg.alpha_composite(im)
        sh.label_img((x, y4b + 26), bg.resize((im.width * 3, im.height * 3), Image.NEAREST), lab, 12)
        x += im.width * 3 + 10
    sk = P["slash"][P.get("slash_key", 1)][1]
    sky = slash_on_sky(sk)
    sh.label_img((x + 6, y4b + 26), sky, "昼の 空の 前", 12)
    # アイコン
    xi = 1180
    sh.text((xi, y4), "虹の アイコン（16×16）と 手に 持つ 絵", 16, GOLD)
    ic = P["icon"]
    cur = kit9.current_icons()
    sh.label_img((xi, y4 + 26), kit9.slot(ic, scale=4), "虹（この 案）", 12)
    sh.label_img((xi + 96, y4 + 26), kit9.slot(cur[0], scale=4), "今の 雷神剣", 12)
    sh.label_img((xi + 192, y4 + 26), kit9.slot(cur[1], scale=4), "今の 風神剣", 12)
    one = Image.new("RGB", (40, 40), (154, 46, 74))
    one.paste(ic, (12, 12), ic)
    sh.label_img((xi + 288, y4 + 26), one, "1 倍", 12)
    sil = kit.silhouette(ic).resize((64, 64), Image.NEAREST)
    sh.label_img((xi + 340, y4 + 26), sil, "かげ", 12)
    iso = kit9.iso_extrude(ic, cell=7, depth=2)
    bgi = Image.new("RGBA", iso.size, (*kit.BG, 255))
    bgi.alpha_composite(iso)
    sh.label_img((xi + 420, y4 + 26), bgi, "手に 持つ（押し出し）", 12)
    yy = y4 + 26 + 20 + 120
    for ln in P["icon_note"]:
        sh.text((xi, yy), ln, 13)
        yy += 19

    # 段 5: 確かめの 絵（CRITERIA）
    y5 = 1430
    sh.text((24, y5), "確かめの 絵: ① まっ黒の シルエット ② 白黒 ③ ぼかし ④ 今の 物（雷 B）と ならべる", 16, GOLD)
    cs = (320, 200)
    sh.label_img((24, y5 + 26), kit9.silhouette_from(fr_key, cs), "① シルエット（エフェクトだけ）", 12)
    sh.label_img((354, y5 + 26), kit9.gray(key).resize(cs, Image.NEAREST), "② 白黒", 12)
    sh.label_img((684, y5 + 26), kit9.blur(key.resize(cs, Image.NEAREST), 3), "③ ぼかし", 12)
    tb = kit9.thunder_b_key()
    tb = tb.resize((int(200 * tb.width / tb.height), 200), Image.NEAREST)
    sh.label_img((1014, y5 + 26), tb, "④ 雷 B（今）", 12)
    sh.label_img((1014 + tb.width + 10, y5 + 26), key.resize(cs, Image.NEAREST), "④ この 案（同じ 高さ）", 12)

    # 段 6: 表
    y6 = 1700
    yy = sh.table((24, y6), [["かず", "見こみ"]] + P["data"], [150, 360], 12, 18)
    yy = sh.text((24, yy + 8), "ペラペラに しない 6 つ（PIPELINE 3 章）", 13, GOLD)
    yy = y6 + 18 * (len(P["data"]) + 1) + 30
    for i, ln in enumerate(P["six"]):
        sh.text((24, yy), f"{i + 1}. {ln}", 12)
        yy += 18
    sh.table((560, y6), kit.criteria_rows(P["criteria"], kit.CRITERIA_NAMES), [24, 120, 36, 420], 12, 18)
    sh.table((1170, y6), kit.criteria_rows(P["motion"], kit.MOTION_NAMES), [24, 110, 36, 460], 12, 18)
    sh.save(os.path.join(out, "sheet.png"))

    imgs, durs = [], []
    for im, d in gif:
        imgs.append(im)
        durs.append(max(40, round(min(d, 90) * 1000 / 60)))
    imgs[0].save(os.path.join(out, "scene.gif"), save_all=True, append_images=imgs[1:], duration=durs, loop=0)
    return key, key_fp


def slash_on_sky(sp, k=3):
    w, h = sp.size
    bg = np.zeros((h, w, 3))
    bg[:] = (160, 210, 246)
    bg[int(h * 0.75):] = (96, 156, 70)
    a = np.asarray(sp, float)
    m = a[..., 3] > 0
    bg[m] = a[..., :3][m]  # 斬撃は ふつうの 重ね（昼の 空でも 色が 出る）
    im = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB")
    return im.resize((w * k, h * k), Image.NEAREST)


def sphere_pts(C, R, lat, lon):
    lat, lon = np.asarray(lat), np.asarray(lon)
    return np.stack([C[0] + R * np.cos(lat) * np.cos(lon), C[1] + R * np.sin(lat), C[2] + R * np.cos(lat) * np.sin(lon)], -1)


def rise_frags(seed, n, C, R, t, rise_speed=0.35):
    """ドームの 中を ゆっくり 舞い上がる かけら（多くて 24）"""
    import random
    r = random.Random(seed)
    pts, life = [], []
    for i in range(n):
        a = r.random() * 2 * math.pi
        rr = math.sqrt(r.random()) * R * 0.85
        y0 = r.random()
        y = ((y0 + t * rise_speed / max(R, 1)) % 1.0)
        yy = C[1] - R * 0.3 + y * R * 1.1
        pts.append((rr * math.cos(a + t * 0.2), max(0.2, yy), rr * math.sin(a + t * 0.2)))
        life.append(y)
    return np.array(pts), np.array(life)
