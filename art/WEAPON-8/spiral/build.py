"""WEAPON-8: 風神剣の ためわざ「らせんの かぜ」 方向 3 案の 見本シート。

python3 art/WEAPON-8/spiral/build.py → docs/art/WEAPON-8/spiral-{a,b,c}.png・spiral-3.png
同じ 3D の 形を、よこ・うしろ（ゲームの スクショに 重ねる）・8 方向から 描く。
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))

from PIL import Image, ImageDraw  # noqa: E402

import w8kit as K  # noqa: E402
from models import MODELS, TIMELINE, state  # noqa: E402
from w8kit import C, Cam, Sheet, add, orbit_cam, render, up  # noqa: E402

SHOT = os.path.join(K.ROOT, "ui-gate-report", "hud-1280x800.png")
KEY_I = 2
KEY_STEP = 7

PLANS = {
    "A": {
        "slug": "spiral-a",
        "title": "A つむじ玉（ビルボードの 重ね ＋ らせんの 点の 尾）",
        "one": "カメラに 向く 渦の 玉（3 まい 重ね）が 先頭。うしろに 2 本の らせんの つぶが 本当の 3D の 位置で ならぶ。形の 言葉 = まる。細かさは 玉に 集める",
        "how": [
            "あたま: 渦の 玉の 絵を カメラへ 向く 板 3 まい（奥 = こい ふち・中 = うで 2 本・手前 = 芯）。-0.3 / 0 / +0.3 ずらす（雷 B と 同じ）",
            "回る: 渦の 絵を 4 コマ（22.5° ずつ）。玉は どこから 見ても 同じ いちばん 決まる 絵",
            "尾: 2 本の らせんの 上に 小さな つぶ 14 こ × 2。位置は 3D なので よこ = らせん、うしろ = 輪に 見える",
            "1 点 = 1/16 ブロック（タイルと 同じ。今の 真空波と 近い こまかさ）",
        ],
        "budget": [("描画回数", "2（玉 1・尾の つぶ 1）"), ("三角形", "6 ＋ 56 = 62"), ("絵", "玉 27×27 × 3 まい × 4 コマ × 3 大きさ → 128×128 ほど"), ("毎ステップ", "尾 28 この 位置を 計算（軽い）"), ("同時", "1 つ（ため が いる）")],
        "criteria": {
            1: ("○", "玉 ＋ 点の 尾。どの 向きでも 丸い 頭が 見える"), 2: ("○", "白い 芯と こい 青の ふち。昼の 空でも 分かれる"),
            3: ("○", "玉の 白い 芯に 目が 行く"), 4: ("○", "細かさは 玉。尾は 点だけ"), 5: ("―", ""),
            6: ("○", "白〜水色が 7 割・こい 青 2 割・芯 1 割"), 7: ("○", "W1→B3 で 少し つめたく 暗く"), 8: ("△", "雷（黄）とは ちがうが、青い 玉 ＋ つぶ は「水の 玉・あわ」にも 見える"),
            9: ("○", "まる（玉）＋ 尾の 点"), 10: ("○", "今の 真空波と 同じ 色の なかま"), 11: ("―", ""),
            12: ("△", "よこからは「玉が とぶ」に 見えやすく らせんは 尾だけ"), 13: ("○", "形で 分かる"),
            14: ("―", ""), 15: ("―", ""), 16: ("○", "音は sound の 判断"), 17: ("○", "かわいすぎない（芯が するどい）"),
        },
        "motion": {
            1: ("○", "出る→のびる→決め→とぶ→ほどける"), 2: ("○", "「ぎゅっと 丸めた 風を 打ちだす」・決めの 止め絵あり"),
            3: ("○", "F1 で 剣先に 小さな 玉"), 4: ("―", "ためは 雷神剣と 同じ（体の 動き）"), 5: ("―", "体は 雷神剣と 同じ"),
            6: ("―", ""), 7: ("○", "体の 前の まん中から まっすぐ"), 8: ("○", "のびるは 2 ステップで 一気に"),
            9: ("○", "ほどけて 尾が ひろがって 消える"), 10: ("―", ""), 11: ("○", "玉は 直径 1.6 ブロック"),
            12: ("○", "出る 小 → 決め 大（のび）"), 13: ("○", "玉の 回り ＋ 尾の らせん（2 つの 回り）"), 14: ("―", ""),
            15: ("―", ""), 16: ("△", "当たりは 玉の 大きさ（尾は 当たらない）を 仕様で"), 17: ("―", ""), 18: ("○", "8 方向 どれも 玉が 正面"),
        },
    },
    "B": {
        "slug": "spiral-b",
        "title": "B らせんの おび（2 本の リボン。ドリルの 先）",
        "one": "ねじれた 2 本の リボンが ドリルの ように とがって 回る。本物の 3D の 形なので どこから 見ても 厚みが ある。形の 言葉 = さんかく（すばやい・つらぬく）",
        "how": [
            "2 本の リボン（はば 0.42・半径 0.72・1.5 ブロックで 1 回り）を 1 つの 形に。先は とがる（ドリル）",
            "回る: 形は かえず、軸の まわりに 回すだけ（1 秒 5 回り）",
            "表 = 白〜水色、裏 = 水色〜こい 青（表と 裏で 色を かえて 立体に 見せる。シェーダーの gl_FrontFacing）",
            "しっぽ 3 割は 網で 4 段 ぬく。絵は 4×16 の 小さな 帯（Nearest）",
        ],
        "budget": [("描画回数", "1〜2（リボン 1・先の 光 1）"), ("三角形", "2 本 × 24 区切り × 2 = 96 ＋ 2 = 98"), ("絵", "帯 16×16 ほど"), ("毎ステップ", "回す だけ（形は 作りなおさない）"), ("同時", "1 つ")],
        "criteria": {
            1: ("○", "とがった ねじり棒。よこから いちばん「らせん」"), 2: ("○", "表 白・裏 青で しま"),
            3: ("○", "先の 白い 光"), 4: ("△", "しまが 全体に あって 休む 所が 少ない"), 5: ("―", ""),
            6: ("○", "白 5 割・水色 3.5 割・こい 青 1.5 割"), 7: ("○", ""), 8: ("○", ""),
            9: ("○", "さんかく（ドリル）"), 10: ("△", "本物の 3D の 面なので、ドットの 大きさが 見る 向きで かわる（ほかの ドット絵と 少し ちがう）"),
            11: ("―", ""), 12: ("○", "よこ・ななめ は すぐ「らせん」"), 13: ("○", ""), 14: ("―", ""), 15: ("―", ""),
            16: ("○", ""), 17: ("○", "いちばん かっこいい 寄り"),
        },
        "motion": {
            1: ("○", ""), 2: ("○", "「ドリルで つらぬく」"), 3: ("○", ""), 4: ("―", ""), 5: ("―", ""), 6: ("―", ""),
            7: ("○", ""), 8: ("○", ""), 9: ("○", "おびが ゆるんで ほどける"), 10: ("―", ""), 11: ("○", ""),
            12: ("○", "先から のびる"), 13: ("△", "1 つの 軸で 回るだけ（ドリル）。見た目の 性格には 合う"), 14: ("―", ""), 15: ("―", ""),
            16: ("○", "当たりは 円柱（半径 0.7・長さ 2.8）で 絵と そろう"), 17: ("―", ""),
            18: ("○", "うしろからは「@」の うず、よこからは ねじり棒。どの 向きも 厚みが ある"),
        },
    },
    "C": {
        "slug": "spiral-c",
        "title": "C かぜの わ の れつ（かたむいた 輪 4 つが ずれて 回る）",
        "one": "かたむいた 風の 輪 4 つが ならび、かたむきが 1 つずつ ずれて 回る（ばねの ような らせん）。前ほど 大きい。形の 言葉 = まる の くり返し（リズム）。細かさは いちばん 少ない",
        "how": [
            "輪 4 つ（半径 0.78→0.39）。輪の かたむき 28°。かたむきの 向きを 60° ずつ ずらし、まとめて 回す",
            "輪は 太さ 一定の 線（カメラへ 向く 帯。1 輪 12 区切り）。前 半分 = 白・うしろ 半分 = 青",
            "輪に 切れ目 1 つ → 回る 向きが 見える。かたむきが ちがうので、どれか 1 つが 横向きでも ほかは 開いて 見える",
            "1 点 = 1/16 ブロック。輪の 太さ 2〜3 点",
        ],
        "budget": [("描画回数", "1（輪 4 つ まとめて）"), ("三角形", "4 × 12 × 2 = 96（ふち 付きなら 128）"), ("絵", "帯 16×4"), ("毎ステップ", "輪の 点 52 この 位置（軽い）"), ("同時", "1 つ")],
        "criteria": {
            1: ("△", "輪の 列は「風の 輪」には 見えるが「らせん」は 動きで 分かる"), 2: ("○", "白と こい 青"),
            3: ("△", "主役の 場所が 4 つに 分かれる"), 4: ("○", "いちばん すっきり"), 5: ("―", ""),
            6: ("○", "空が 多く 見える（休む 所）"), 7: ("○", ""), 8: ("○", ""), 9: ("○", "まるの くり返し"),
            10: ("△", "線の 輪は ほかの ドット絵より 細く 見える"), 11: ("―", ""),
            12: ("△", "止め絵では 分かりにくい（動くと 分かる）"), 13: ("○", ""), 14: ("―", ""), 15: ("―", ""),
            16: ("○", ""), 17: ("△", "少し 地味"),
        },
        "motion": {
            1: ("○", ""), 2: ("○", "「風の 輪が ころがって いく」"), 3: ("○", ""), 4: ("―", ""), 5: ("―", ""), 6: ("―", ""),
            7: ("○", ""), 8: ("○", ""), 9: ("○", "輪が 広がって うすれる"), 10: ("―", ""), 11: ("△", "輪が 細い"),
            12: ("○", ""), 13: ("○", "かたむき ＋ 回り（2 つの 軸）"), 14: ("―", ""), 15: ("―", ""),
            16: ("○", "当たりは いちばん 前の 輪"), 17: ("―", ""), 18: ("○", "どの 向きでも 開いた 輪が 2 つ 以上"),
        },
    },
}

# ---------------------------------------------------------------- 場面

SIDE_W, SIDE_H = 176, 72  # 低い 解像度（1 点 = 1/16 ブロック）
GROUND = 58
KID_X = 2.0  # 子の 位置（ブロック）
SIDE_PPB = 16


def side_cam(center_x=5.5):
    # まよこ（+z から）。中心は 地面から 1.1 ブロック
    return orbit_cam((center_x, 1.1, 0.0), 90, 0, 12, SIDE_W, SIDE_H, ppb=SIDE_PPB)


def side_background(cam):
    # 1 ブロック = 16 点。地面の 高さを カメラで 合わせる
    gy = int(round(cam.proj((cam.pos[0], 0.0, 0.0))[1]))
    bg8 = K.side_bg(SIDE_W // 2 + 1, SIDE_H // 2 + 1, gy // 2)
    kx = int(round(cam.proj((KID_X, 0, 0))[0])) // 2 - 4
    K.draw_kid_side(bg8, kx, gy // 2)
    return up(bg8, 2).crop((0, 0, SIDE_W, SIDE_H))


def side_scene(model, e, step, x=None, outline=True):
    cam = side_cam()
    H = (KID_X + 0.6 + (e["d"] if x is None else x), 1.1, 0.0)
    items = model(H, state(e, step), cam)
    return render(items, cam, bg=side_background(cam), outline=C["B3"] if outline else None)


def side_layer(model, e, step):
    cam = side_cam()
    H = (KID_X + 0.6 + e["d"], 1.1, 0.0)
    return render(model(H, state(e, step), cam), cam, outline=C["B3"])


def behind_cam():
    # 低い 解像度 = 画面の 1/3（1/16 ブロックの 点が 12 ブロック 先で 約 1 点）
    f = (BH / 2) / math.tan(math.radians(35))
    return Cam((-5.4, 2.4, 0.75), (6, 0.3, 0.75), BW, BH, f)


BK = 3
BW, BH = 1280 // BK + 1, 800 // BK + 1


def kid_mask():
    m = Image.new("L", (1280, 800), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([505, 352, 605, 440], fill=255)
    d.rectangle([522, 400, 600, 550], fill=255)
    return m


def behind_scene(model, e, step, x=7.0, outline=True, items=None):
    shot = Image.open(SHOT).convert("RGBA")
    cam = behind_cam()
    H = (x, 1.1, 0.75)  # 剣を もつ 右手の 前から まっすぐ（カメラの 前の 向き）
    its = items if items is not None else model(H, state(e, step), cam)
    lay = render(its, cam, outline=C["B3"] if outline else None)
    big = up(lay, BK).crop((0, 0, 1280, 800))
    out = shot.copy()
    out.alpha_composite(big)
    out.paste(shot, (0, 0), kid_mask())  # 子の 方が 手前（波は 子の むこう）
    return out


def view8(model, e, step):
    cells = []
    for i in range(8):
        yaw = i * 45
        H = (0.0, 0.0, 0.0)
        cam = orbit_cam((-1.2, 0, 0), yaw, 20, 10, 64, 48, ppb=16)
        bg = Image.new("RGBA", (64, 48), (150, 205, 245, 255))
        lay = render(model(H, state(e, step), cam) if model else K.current_wave_items(H), cam, bg=bg,
                     outline=C["B3"] if model else None)
        cells.append(up(lay, 2))
    W = 8 * (cells[0].width + 4)
    out = Image.new("RGB", (W, cells[0].height), (60, 60, 70))
    for i, c in enumerate(cells):
        out.paste(c.convert("RGB"), (i * (c.width + 4), 0))
    return out


def current_side():
    cam = side_cam()
    H = (KID_X + 0.6 + 3.0, 1.1, 0.0)
    return render(K.current_wave_items(H), cam, bg=side_background(cam))


def current_behind():
    return behind_scene(None, None, 0, items=K.current_wave_items((7.0, 1.1, 0.75)), outline=False)


# ---------------------------------------------------------------- シート

def make_sheet(key, P, cur_side, cur_back):
    model = MODELS[key]
    e = TIMELINE[KEY_I]
    sh = Sheet(1800, 1760)
    sh.text((24, 14), "風神剣の ためわざ「らせんの かぜ」 " + P["title"], 30, K.HEAD)
    sh.text((24, 56), P["one"], 16)
    # 段 1: よこ・うしろ
    side = side_scene(model, e, KEY_STEP)
    y = 92
    sh.img((24, y), up(side, 4), "よこから（決めの コマ。昼の 空 = 白い 風が いちばん 見にくい 場面。4 倍）")
    back = behind_scene(model, e, KEY_STEP)
    crop = back.crop((300, 160, 980, 620))
    sh.img((24 + SIDE_W * 4 + 24, y), crop, "うしろ（プレイヤー目線。ゲームの スクショに 重ねた 見本・原寸）")
    # 段 2: 動き（よこ）
    y2 = 92 + 20 + SIDE_H * 4 + 24
    y2 = max(y2, 92 + 20 + 460 + 20)
    sh.text((24, y2), "よこから 見た 動き（1 ステップ = 1/60 秒。★ = 決め: いちばん 大きく 明るい 絵で 6 ステップ）", 18, K.HEAD)
    x = 24
    step = 0
    for i, ev in enumerate(TIMELINE):
        sc = side_scene(model, ev, step + 1)
        cx = int(round(side_cam().proj((KID_X + 0.6 + ev["d"], 1.1, 0))[0]))
        x0 = min(max(0, cx - 34), SIDE_W - 60)
        c = sc.crop((x0, 6, x0 + 60, 66))
        sh.img((x, y2 + 28), up(c, 3), f"{ev['name']} {ev['F']} ×{ev['steps']}", 13, K.INK)
        x += 60 * 3 + 12
        step += ev["steps"]
    # 段 3: 8 方向
    y3 = y2 + 28 + 20 + 180 + 22
    sh.text((24, y3), "8 方向（決めの コマ。0° = うしろ・90° = よこ・180° = 正面。上 = 今の 真空波の 十字 / 下 = この 案）", 18, K.HEAD)
    v0 = view8(None, e, KEY_STEP)
    v1 = view8(model, e, KEY_STEP)
    sh.img((24, y3 + 28), v0)
    sh.img((24, y3 + 28 + v0.height + 6), v1)
    for i in range(8):
        sh.text((24 + i * 132 + 4, y3 + 28 + 2 * v0.height + 10), f"{i * 45}°", 12, K.SUB)
    # 段 3 右: 色・数
    rx = 24 + v0.width + 30
    sh.text((rx, y3), "色（5 色）", 16, K.HEAD)
    py = sh.palette((rx, y3 + 28))
    sh.text((rx + 250, y3), "数の 見積もり（上限 4 回・150）", 16, K.HEAD)
    sh.table((rx + 250, y3 + 28), [["", ""]] + [[a, b] for a, b in P["budget"]], [90, 360], 12, 34)
    # 段 4: 確かめの 絵
    y4 = y3 + 28 + 2 * v0.height + 40
    sh.text((24, y4), "確かめの 絵: ① まっ黒の シルエット ② 白黒 ③ ぼかし ④ 今の 真空波と ならべる", 18, K.HEAD)
    lay = side_layer(model, e, KEY_STEP)
    bb = lay.getbbox()
    sil = K.silhouette(lay.crop((bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4)))
    yy = y4 + 28
    sh.img((24, yy), up(sil, 3), "① よこ", 13)
    gb = K.gray(back.crop((440, 250, 760, 470)))
    sh.img((24 + sil.width * 3 + 16, yy), gb, "② 白黒（うしろ）", 13)
    bl = K.blur(back.crop((440, 250, 760, 470)), 4)
    sh.img((24 + sil.width * 3 + 16 + 336, yy), bl, "③ ぼかし（うしろ）", 13)
    cx0 = 24 + sil.width * 3 + 16 + 336 * 2
    sh.img((cx0, yy), cur_back.crop((440, 250, 760, 470)), "④ 今の 真空波（うしろ）: 十字が 線 2 本に", 13)
    sh.img((cx0 + 336, yy), up(cur_side.crop((40, 6, 136, 66)), 2), "④ 今の 真空波（よこ）", 13)
    # 段 5: 表
    y5 = yy + 20 + 240
    sh.table((24, y5), K.criteria_rows(P["criteria"], K.CRITERIA_NAMES), [24, 120, 40, 470], 12, 18)
    sh.table((700, y5), K.criteria_rows(P["motion"], K.MOTION_NAMES), [24, 112, 40, 480], 12, 18)
    sh.text((1380, y5), "区間と ステップ（3 案 共通）", 16, K.HEAD)
    rows = [["区間", "F", "ステップ", "大きさ"]] + [[ev["name"], ev["F"], str(ev["steps"]), f"{ev['s']:.2f}"] for ev in TIMELINE]
    yy = sh.table((1380, y5 + 26), rows, [110, 70, 70, 60], 12, 18)
    sh.text((1380, yy + 8), "とぶ は 4 コマ × 3 ステップの くり返し", 12, K.SUB)
    sh.text((1380, yy + 26), "回り: 12 ステップで 1 回り", 12, K.SUB)
    sh.text((1380, yy + 44), "下絵: PixelLab vfx lite 1 回（時間の わりふり）", 12, K.SUB)
    sh.save(os.path.join(K.DOCS, P["slug"] + ".png"))
    return side, back


def main():
    cur_side, cur_back = current_side(), current_behind()
    keys = {}
    for k, P in PLANS.items():
        keys[k] = make_sheet(k, P, cur_side, cur_back)
    # ならべ 1 まい（オーナーが さいしょに 見る）
    sh = Sheet(1800, 820)
    sh.text((24, 14), "風神剣の ためわざ「らせんの かぜ」: 方向の 3 案（決めの コマ・同じ 場面）", 30, K.HEAD)
    sh.text((24, 56), "上 = よこから（3 倍）/ 下 = うしろ（プレイヤー目線。ゲームの スクショに 重ねた 見本）。どの 案も 色は 風神剣の 白〜水色 ＋ 空と 分ける こい 青。描画 4 回・三角形 150 の 中", 15, K.SUB)
    cols = [("今 真空波（十字の 板 2 まい）", cur_side, cur_back)] + [(PLANS[k]["title"].split("（")[0] + ("（おすすめ）" if k == "B" else ""), keys[k][0], keys[k][1]) for k in "ABC"]
    for i, (name, sd, bk) in enumerate(cols):
        x = 24 + i * 442
        sh.text((x, 92), name, 18)
        c = sd.crop((16, 0, 156, 72))
        sh.im.paste(up(c, 3).convert("RGB"), (x, 122))
        b = bk.crop((430, 180, 850, 600))
        sh.im.paste(b.convert("RGB"), (x, 122 + 216 + 16))
    notes = [
        "今: うしろから 見ると 十字の 板が 線 2 本（＋）に なる",
        "A: 渦の 玉が いつも 正面。尾は つぶの らせん。描画 2・62",
        "B: ねじれた リボンの ドリル。よこも うしろも らせん。描画 1〜2・98",
        "C: かたむいた 輪 4 つ。いちばん すっきり。描画 1・96〜128",
    ]
    for i, n in enumerate(notes):
        sh.text((24 + i * 442, 122 + 216 + 16 + 420 + 10), n, 13, K.SUB)
    sh.save(os.path.join(K.DOCS, "spiral-3.png"))


if __name__ == "__main__":
    main()
