"""WEAPON-9 案 B「にじの おび」: カメラに 正面の にじの 帯 4 本が 主役。まくは 細い ふちだけ（カメラに 正面の 円の 板）。
実行: python3 art/WEAPON-9/dome-b/build.py
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import numpy as np  # noqa: E402
import kit9  # noqa: E402
import parts9  # noqa: E402
import sheet9  # noqa: E402
from kit9 import Sprite, rgb  # noqa: E402

PAL = {
    "W": "#FFFAF0", "P1": "#E6E0FF", "P2": "#A9A4E8", "P3": "#5E5AA0",
    "G": "#5FD98E", "B": "#4FA3F0", "M": "#D16BE6", "g": "#3C9A68", "b": "#3570B0", "m": "#9446A8",
}
C = {k: rgb(v) for k, v in PAL.items()}
B = kit9.BAYER
HUE = [C["G"], C["B"], C["M"]]
HUE_D = [C["g"], C["b"], C["m"]]


def make_rim():
    """まくの ふち（カメラに 正面の 円。半径 7 = 56 点）。中は ほとんど すける"""
    n = 116
    s = Sprite(n, n)
    c = n / 2
    kit9.ring_band(s, c, c, 55.0, 56.5, PAL["P1"])
    kit9.ring_band(s, c, c, 56.5, 57.5, PAL["W"])
    for y in range(n):
        for x in range(n):
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if 50 <= d < 55 and B[y % 4][x % 4] < (d - 50) / 10:
                s.px(x, y, PAL["P3"])
    return s


def make_orb():
    s = Sprite(24, 24)
    c = 11.5
    kit9.ring_band(s, c, c, 7.5, 9.0, PAL["P1"], dither_out=2.5)
    kit9.ring_band(s, c, c, 8.0, 8.6, PAL["W"])
    for y in range(24):
        for x in range(24):
            d = math.hypot(x + 0.5 - 12, y + 0.5 - 12)
            if d < 7.5 and B[y % 4][x % 4] < 0.25:
                s.px(x, y, PAL["P2"])
    return s


def make_ring():
    n = 112
    s = Sprite(n, n)
    kit9.ring_band(s, 56, 56, 52.0, 53.2, PAL["G"])
    kit9.ring_band(s, 56, 56, 50.4, 51.6, PAL["W"])
    kit9.ring_band(s, 56, 56, 48.6, 49.8, PAL["B"])
    kit9.ring_band(s, 56, 56, 46.6, 47.8, PAL["M"])
    kit9.ring_band(s, 56, 56, 45.0, 46.6, PAL["P3"], dither_out=1.5)
    return s


def make_band_strip():
    """帯の 絵（ゲームでは 帯の 区切りに はる。よこ = 帯の 長さ 64・たて = はば 8）"""
    s = Sprite(64, 8)
    for x in range(64):
        h = ["G", "B", "M"][(x * 3) // 64]
        w = max(1, round(4 * min(1.0, (x + 1) / 40) ** 0.7))
        for y in range(4 - w, 4 + w):
            if x < 16 and B[y % 4][x % 4] > x / 16:
                continue
            core = abs(y + 0.5 - 4) < 1.2 and x > 6
            s.px(x, y, PAL["W"] if core else PAL[h])
    return s


RIM, ORB, RING, STRIP = make_rim(), make_orb(), make_ring(), make_band_strip()
RIM_I, ORB_I, RING_I = RIM.composite(1), ORB.composite(1), RING.composite(1)
NB, NS = 4, 64


def not_first(first):
    return not first


def render(fr, st, t, first):
    r, feet, k = st["r"], st["feet"], st["k"]
    Cc = np.array((0.0, feet + kit9.BODY_C, 0.0))
    q = round(k * 4) / 4
    if not first:
        D = np.linalg.norm(fr.cam.pos - Cc)
        if D > r + 0.3:
            sz = 2 * r * D / math.sqrt(D * D - r * r)
            fr.sprite(RIM_I, Cc, sz, sz, additive="over", z_bias=0.0)
    rr = kit9.ground_ring_radius(r, feet)
    if rr > 0.2:
        fr.decal(RING_I, 7.0 * rr / 6.4, k=q, over_colors=[tuple(C[c]) for c in ("G", "W", "B", "M")])
    if not first:
        o = 3.0 * min(1, r / 2)
        fr.sprite(ORB_I, Cc, o, o, additive=True, z_bias=-0.3)
    # にじの 帯 4 本（うず。5 秒で 1 まわり）
    pts, wid, hid = [], [], []
    for j in range(NB):
        phi = j * math.pi / 2 + t * 2 * math.pi / 5.0
        s = np.linspace(0, 1, NS * 3)
        lon = phi + s * 1.35 * math.pi
        lat = -0.32 + s * 1.30
        P = sheet9.sphere_pts(Cc, r * 1.01, lat, lon)
        span = min(1.0, r / kit9.R_DOME)
        w = 0.62 * span * np.clip(s, 0.02, 1) ** 0.6 * np.where(s > 0.93, np.clip(1 - (s - 0.93) * 9, 0.3, 1), 1)
        hue = (np.floor(s * 3 + t * 0.6 + j) % 3).astype(int)
        for i in range(len(s)):
            if s[i] < 0.2 and kit9.BAYER[i % 4][j % 4] > s[i] * 5:
                continue  # しっぽは 網で ほどける
            pts.append(P[i]); wid.append(w[i]); hid.append(hue[i])
            pts.append(P[i]); wid.append(w[i] * 0.3); hid.append(-1)
    pts, wid, hid = np.array(pts), np.array(wid), np.array(hid)
    _, _, z = fr.cam.project(pts)
    _, _, zc = fr.cam.project([Cc])
    back = (z > zc[0]) & not_first(first)
    front_c = np.array(HUE + [C["W"]])[hid]
    back_c = np.array(HUE_D + [C["P1"]])[hid]
    col = np.where(back[:, None], back_c, front_c)
    order = np.argsort(-(z - np.where(hid < 0, 0.6, 0.0)), kind='stable')  # 奥 → 手前。しんは 自分の 帯の 上  # 奥 → 手前。同じ 深さなら しん を あと
    fr.ribbon(pts[order], wid[order], col[order], over=True)
    fp, life = sheet9.rise_frags(21, 24, Cc, r, t)
    cols = np.array([C["W"] if i % 2 == 0 else HUE[i % 3] for i in range(len(fp))])
    cols = np.where((life > 0.8)[:, None], C["P2"], cols)
    fr.dots(fp, cols, size_b=0.25, over=True)


P = dict(
    out=HERE,
    title="案 B「にじの おび」— カメラに 正面の にじの 帯 4 本が 主役（うず ＋ さきの とがり）",
    concept=[
        "決定の「うずを まく にじの 帯」を いちばん 大きく: 緑・青・赤むらさきの 帯 4 本が 地面から 頭の 上へ うずを まいて 回る（5 秒で 1 まわり）。帯の しんは 白。",
        "まくは 細い ふち だけ（カメラに 正面の 円の 板 → どこから 見ても まるい りんかく）。地面に にじの 3 本 輪。光の 玉は 小さめ。奥の 帯は 1 段 暗い 色 → 前後が 分かる。",
        "形の 言葉: うず（曲線）＋ さんかく（帯の 先が とがる・しっぽは 網で ほどける）。色の 割合: 空と 地面 7・にじ 2.5・白 0.5。細かさ: 帯に 集める。",
    ],
    palette=[(k, PAL[k], u) for k, u in [
        ("W", "帯の しん・ふちの 外・玉"), ("P1", "ふち・玉"), ("P2", "玉の 網・きえる かけら"), ("P3", "ふちの 内の 網"),
        ("G", "にじ 緑"), ("B", "にじ 青"), ("M", "にじ 赤むらさき"), ("g", "奥の 緑"), ("b", "奥の 青"), ("m", "奥の 赤むらさき")]],
    pal_note="10 色（虹は 色の 数の 例外）。帯は ふつうの 重ね・玉は 足し算",
    render=render,
    light=0.25, tint=(0.95, 0.93, 1.0),
    parts=[("ふち（正面の 円）116×116（2 倍）", RIM_I, 2), ("光の 玉 24×24（6 倍）", ORB_I, 6), ("地面の 輪 112×112（2 倍）", RING_I, 2), ("帯 64×8（4 倍）", STRIP.composite(1), 4)],
    icon_note=[
        "B: 柄 → 切っ先へ 緑 → 青 → 赤むらさき。刃の まん中に 白い しん 1 列。",
        "切っ先に 白い 光 1 点。ふち 1 点 #241A44。12 色。",
        "手に 持つ: 押し出し。白い しん と にじを 光る 材質に（帯と 同じ 色の 流れ）",
    ],
    data=[
        ["描画回数", "4（ふち＋玉 1・帯 1・輪 1・かけら〈点〉1）"],
        ["三角形", "102（ふち 2・玉 2・帯 4 本×12 区切り 96・輪 2・点 0）"],
        ["絵の 大きさ", "1 まいの アトラス 256×128（ふち・玉・帯）＋ 輪 112×112"],
        ["色の 数", "10（白・うす紫 4 ＋ にじ 3 ＋ 奥の にじ 3）"],
        ["一人称", "ふち と 玉 を 出さない（帯・輪・かけら）"],
        ["斬撃", "今の 軌跡と 同じ（色の 流れ だけ）→ ふえ 0"],
    ],
    six=[
        "決めの 絵: とどまる 160 は 明るさ 一定、帯が 回る だけ",
        "ささる 所: 帯の しっぽ（地面がわ）は 網で ほどけて 消える ＋ 3 本 輪",
        "重ね: 奥の 帯（暗い 色）→ 子 → 玉 → 手前の 帯（明るい）",
        "地面の 輪: 上から 見た 絵。外の 緑 = 半径 6.4 = 当たり",
        "まわりを 明るく: +25%・うす紫・3 段・うかぶ で 1 回だけ",
        "ドット: 帯は 1/8 ブロックの 升目に そろえて なぞる",
    ],
    criteria={1: ("○", "まるい ふち ＋ うずの 帯"), 2: ("○", "帯は ふつうの 重ね → 昼でも 色と 明るさが 出る"),
              3: ("○", "帯の 頭と 玉"), 4: ("○", "細かさは 帯だけ・中は 休む 所"), 5: ("○", "輪 と ふちで 大きさ が 分かる"),
              6: ("○", "にじ 2.5 割"), 7: ("○", "奥の にじは 暗く つめたく"), 8: ("○", "雷 B（白〜黄）・風神剣と ちがう"),
              9: ("○", "うず ＋ とがった 先"), 10: ("△", "まくの ふちが 細いので 雷 B より 軽く 見える"), 12: ("○", "字 なしで 光の かこい"),
              13: ("○", "白黒でも 帯の しんが 出る"), 16: ("○", "音と いっしょ"), 17: ("○", "見本の 光わざ らしい")},
    motion={1: ("○", "うかぶ 40・とどまる 160・おりる 40・もどり 20"), 2: ("○", "ふわーっと もちあげ ぴたっと 止まる"),
            3: ("○", "F8 で 玉"), 4: ("○", "ため 150 の 光（共通）"), 5: ("―", "当たりは ドーム"),
            8: ("○", "40 で 一気に 広がる"), 9: ("○", "おりる で 帯が 下へ しぼむ"), 11: ("○", "帯は 太く 半径 7 いっぱい"),
            12: ("○", "帯の 先が のびて しっぽが ほどける"), 13: ("○", "回りながら 上がる（2 じく）"), 16: ("○", "ふち = 当たりの 球"),
            18: ("○", "どの 向きでも 帯の はば が のこる")},
)

slash_pal = {k: PAL[k] for k in ("W", "G", "B", "M")}
P["slash"] = parts9.slash_set("B", slash_pal, HERE)
ic = parts9.icon("B", {"L": "#F4FFF8", "W": "#FFFFF0", "G": "#5FD98E", "B": "#4FA3F0", "M": "#D16BE6", "g2": "#2F8F62", "b2": "#2F66B8", "m2": "#8E3FA8"})
ic.save_png(os.path.join(HERE, "niji_icon_16.png"))
ic.preview(os.path.join(HERE, "icon_preview.png"), scale=12)
P["icon"] = ic.composite(1)
for nm, sp in (("rim", RIM), ("orb", ORB), ("ring", RING), ("band", STRIP)):
    sp.save_png(os.path.join(HERE, f"{nm}_1x.png"))
sheet9.make(P)
