"""WEAPON-8 v2（#239）: 試作スクショへの オーナーの 指摘を 受けた 方向の 見本。

python3 art/WEAPON-8/v2/build.py
  → docs/art/WEAPON-8/v2/spiral-v2.png       らせんの かぜ の 直し（S1 網 / S2 アルファ・回りの すじ・土と 草）
  → docs/art/WEAPON-8/v2/spiral-v2-side.gif  横から 見た 動き（S2）
  → docs/art/WEAPON-8/v2/blade-3.png         ふつうの 攻撃の 風の 刃 3 案（K1・K2・K3）の ならべ
  → docs/art/WEAPON-8/v2/blade-k1.png・blade-k2.png・blade-k3.png  案ごとの 確かめの 絵・ものさし表
  → docs/art/WEAPON-8/v2/charge-v2.png       ため中の 光を 手もとへ（H1）
背景は ゲームの スクショ（`bg/`）。エフェクトは 3D で 置いて 同じ カメラで 描いて 重ねた。乱数は seed つき。
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "common"))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

import w8kit as K  # noqa: E402
from w8kit import Sheet, criteria_rows, CRITERIA_NAMES, MOTION_NAMES  # noqa: E402
import scene as SC  # noqa: E402
import spiral as SP  # noqa: E402
import blade as BL  # noqa: E402
import charge as CH  # noqa: E402

OUT = os.path.join(K.ROOT, "docs", "art", "WEAPON-8", "v2")
PROTO = os.path.join(K.ROOT, "docs", "art", "WEAPON-8", "proto")
os.makedirs(OUT, exist_ok=True)
HEAD = (255, 220, 140)


def crop(im, box, w=None):
    c = im.crop(box)
    if w:
        c = c.resize((w, int(c.height * w / c.width)), Image.LANCZOS if w < c.width else Image.NEAREST)
    return c


def eff_silhouette(lay, box, w):
    a = (lay.a > 0.05)
    im = Image.new("RGB", (lay.a.shape[1], lay.a.shape[0]), (232, 228, 218))
    blk = Image.new("RGB", im.size, (20, 22, 30))
    im.paste(blk, (0, 0), Image.fromarray((a * 255).astype(np.uint8)))
    return crop(im, box, w)


def checks(sh, x, y, img, lay, box, w, now_img, now_label, extra=None):
    """確かめの 絵 4 まい（シルエット・白黒・ぼかし・今と ならべ）"""
    sh.text((x, y), "確かめの 絵（CRITERIA 4 まい）", 15, HEAD)
    y += 22
    tiles = [
        ("① まっ黒の シルエット（エフェクト だけ）", eff_silhouette(lay, box, w)),
        ("② 白黒", K.gray(crop(img, box, w))),
        ("③ ぼかし（目を 細めて）", crop(img, box, w).filter(ImageFilter.GaussianBlur(4))),
        (now_label, crop(now_img, box if extra is None else extra, w)),
    ]
    xx = x
    for lab, t in tiles:
        sh.img((xx, y), t, lab, 12)
        xx += w + 12
    return y + 18 + tiles[0][1].height + 8


# ====================================================================== 1. らせん
def build_spiral():
    W = 1660
    sh = Sheet(W, 2330)
    sh.text((20, 14), "WEAPON-8 v2 ① らせんの かぜ の 直し（ゲームの スクショに 重ねた 見本・まだ 決まりでは ない）", 22, HEAD)
    sh.text((20, 46), "オーナー:「半透明に できる？」「回転しながら 飛んでいって ほしい」「地面にも 風で 土を 吹き飛ばしながら 進んでいる ような 演出」", 14)
    sh.text((20, 66), "形は 今の B「らせんの おび」の まま。変えるのは ① 帯の 色の 置き方（半透明） ② 回りの すじ 4 本（回って 見える） ③ 地面の 土・草の つぶ と 土けむり（通った あと）。", 14, K.SUB)
    shots = [("bg_back", 4, (230, 150, 870, 630), "うしろ a=4（出た すぐ あと）"), ("bg_back", 14, (230, 150, 870, 630), "うしろ a=14（とんでいる）"),
             ("bg_side", 18, (380, 200, 1180, 700), "ななめ横 a=18")]
    y = 96
    keep = {}
    for mode, title in (("S2", "S2 アルファ 半透明（おすすめ）: 帯の からだ 0.5・裏 0.3。ふち・白い しま・回りの すじの 頭は 不透明"),
                        ("S1", "S1 網（テクセルの 市松）: からだ 半分・裏 4 分の 1 を ぬく。半透明の 点は 作らない（今の きまり どおり）")):
        sh.text((20, y), title, 16, HEAD if mode == "S2" else K.INK)
        y += 24
        x = 20
        for shot, a, box, lab in shots:
            img, n = SP.render(shot, a, mode)
            keep[(mode, shot, a)] = (img, SP.LAST)
            yy = sh.img((x, y), crop(img, box, 520), f"{lab}  つぶ {n} こ", 12)
            x += 540
        y = yy + 14
    # 今（試作）
    sh.text((20, y), "今（試作の スクショ）: 白と 水色の 帯が 不透明で 体を かくす・止め絵だと 回って いるか 分からない・地面は 何も 起きない", 16)
    y += 24
    x = 20
    for f, box in (("1a_spiral_just_back.png", (230, 150, 870, 630)), ("1b_spiral_flying_back.png", (230, 150, 870, 630)), ("1c_spiral_flying_side.png", (380, 200, 1180, 700))):
        yy = sh.img((x, y), crop(Image.open(os.path.join(PROTO, f)).convert("RGB"), box, 520), f, 12)
        x += 540
    y = yy + 16
    # 横から 見た 動き（S2）
    sh.text((20, y), "横から 見た 動き（S2。a = らせんの 年。出る 0-1 → のびる 2-3 → 決め 4-9 → とぶ。土と 草は 通った あとに のこって 落ちる）", 16, HEAD)
    y += 24
    x = 20
    frames = []
    for a in (1, 3, 6, 10, 14, 18, 22):
        img, n = SP.render("bg_side", a, "S2")
        frames.append(img)
        cam = SC.Cam("bg_side")
        c = cam.proj(cam.player + np.array([0, 1.4, 0]) + np.array([0, 0, -(1 + 0.2 * a)]))[0]
        cx, cy = int(c[0]), int(c[1])
        yy = sh.img((x, y), crop(img, (cx - 260, cy - 200, cx + 200, cy + 200), 222), f"a={a}  つぶ {n}", 12)
        x += 232
    y = yy + 16
    # 部品の 拡大
    sh.text((20, y), "部品", 16, HEAD)
    y += 24
    img, _ = keep[("S2", "bg_side", 18)]
    yy = sh.img((20, y), crop(img, (700, 290, 1000, 520), 450), "S2 拡大: 白い しま（不透明）と すけた からだ・弧の すじ（頭 白 → しっぽ うすく）", 12)
    img1, _ = keep[("S1", "bg_side", 18)]
    sh.img((490, y), crop(img1, (700, 290, 1000, 520), 450), "S1 拡大: 網は 近いと 市松が 大きく 見える（ざわざわ）", 12)
    # 地面の 色
    gx = 960
    sh.text((gx, y), "地面の つぶの 色（下の ブロックで えらぶ。5 色。ほる ときの かけらと 同じ 考え）", 13)
    gy = y + 22
    for kind, cols in SP.GROUND_PAL.items():
        sh.text((gx, gy + 4), {"grass": "くさ", "dirt": "つち", "stone": "いし", "sand": "すな"}[kind], 13)
        for i, h in enumerate(cols):
            sh.d.rectangle([gx + 50 + i * 34, gy, gx + 80 + i * 34, gy + 22], fill=K.rgb(h), outline=(80, 80, 90))
        gy += 30
    sh.text((gx, gy + 4), "1〜2 = 草の 切れはし（2 点）・3〜4 = 土の かたまり（3 点。きえる ころ こい 色＋網）・5 = 土けむり（3→6 点・網）", 11, K.SUB)
    sh.text((gx, gy + 22), "くさ・つち は タイルの 色（DESIGN 4.3）。空中で 消える（地面に のこさない・ブロックは こわさない）", 11, K.SUB)
    y = yy + 14
    # 確かめ
    img, lay = keep[("S2", "bg_side", 18)]
    y = checks(sh, 20, y, img, lay, (380, 200, 1180, 700), 390, Image.open(os.path.join(PROTO, "1c_spiral_flying_side.png")).convert("RGB"), "④ 今の 試作と ならべる（同じ 向き）")
    # 数
    sh.text((20, y), "数の 見積もり（上限 描画 4・三角形 150。DESIGN 18.5）", 16, HEAD)
    y += 24
    rows = [["", "描画回数", "三角形", "つぶ（点）", "メモ"],
            ["今（試作）", "1〜2", "98", "0", "帯 96・先の 光 2"],
            ["S2 アルファ", "4", "130", "48 まで", "裏の 面 1 回 → 表の 面＋弧 1 回（順に 描くと 重なりが きれい）・先の 光 1・つぶ 1（THREE.Points）"],
            ["S1 網", "3", "130", "48 まで", "帯＋弧 1 回（discard・深さ 書く・並べかえ なし）・先の 光 1・つぶ 1"],
            ["つぶを 板で", "+0", "+96", "―", "Points が だめな ときは 板 48 まい = 96 三角形 → 226 で こえる。そのときは つぶ 10 こ（+20）に へらす"]]
    y = sh.table((20, y), rows, [150, 90, 80, 100, 1200], 13, 19) + 6
    sh.text((20, y), "弧（回りの すじ）= 2 本の 帯 × 2 か所 × 4 区切り × 2 = 32 三角形。点の 数は ゲームで renderer.info.render.points を 見る（perf で 確かめる）。", 12, K.SUB)
    y += 26
    marks2 = {1: ("○", "ねじれた 帯 ＋ 回りの 弧で 影でも「回る ドリル」"), 2: ("○", "白い しま・こい ふち B3 で 草・空と 分かれる"),
              3: ("○", "白い しまが 先に 目に 入る。すけた 体は 背景を 休ませる"), 4: ("△", "しま・弧・つぶで 細かい 所が 多め（つぶは 地面の 近く だけ）"),
              6: ("○", "白〜水色 7 割・こい 青 少し・土と 草は 小さな 面積"), 7: ("○", "W1→B3 の 5 段。影は 青へ"),
              8: ("○", "水色の 風と 土・草の 色が 重ならない"), 9: ("○", "さんかく（ドリル）＋ まるい 弧"),
              10: ("△", "アルファの 半透明は PIPELINE 3.6「網で」と ちがう（オーナー確認）"), 12: ("○", "字なしで「風の ドリルが 土を ふきとばす」"),
              13: ("○", "形（らせん）と 明るさで 分かる"), 16: ("○", "spiralWind の 音と 同じ ステップ。くり返す ためわざ なので 紙ふぶき なし"),
              17: ("○", "土けむり＋ドリルで かっこいい・こわくない")}
    marks1 = dict(marks2)
    marks1.update({3: ("△", "市松が 近いと 大きく 見えて ざわざわ"), 4: ("×", "市松で 帯 全体が 細かく なる"), 10: ("○", "網は 今の きまり どおり")})
    sh.text((20, y), "ものさし表 S2（おすすめ）", 15, HEAD)
    sh.text((840, y), "ものさし表 S1（ちがう 所 だけ ○△× が 変わる）", 15, HEAD)
    y += 22
    sh.table((20, y), criteria_rows(marks2, CRITERIA_NAMES), [26, 130, 40, 600], 12, 17)
    sh.table((840, y), criteria_rows(marks1, CRITERIA_NAMES), [26, 130, 40, 600], 12, 17)
    sh.save(os.path.join(OUT, "spiral-v2.png"))
    # GIF（横から a 0〜30）
    gif = []
    for a in range(0, 31, 2):
        img, _ = SP.render("bg_side", a, "S2")
        gif.append(crop(img, (380, 200, 1180, 700), 640).convert("P", palette=Image.ADAPTIVE, colors=128))
    gif[0].save(os.path.join(OUT, "spiral-v2-side.gif"), save_all=True, append_images=gif[1:], duration=67, loop=0)
    print("-> spiral-v2-side.gif")


# ====================================================================== 2. 風の 刃
BLADE_INFO = {
    "K1": ("K1 みかづきの 刃", "小さな 三日月 1 まい（0.75 ブロック）＋ うしろに すじ 2 本。いちばん「刀の 風」。形 = さんかく＋まる・白 7 割"),
    "K2": ("K2 さざなみ 3 まい", "うすい 弧 3 本が 重なって とぶ「)))」。いちばん「風」っぽく 軽い。形 = まるの くり返し・線で 細かい"),
    "K3": ("K3 つむじ 手裏剣", "3 まい羽の 小さな うずが 回りながら とぶ。いちばん 動きが ある。形 = さんかく（羽）・回る"),
}
BLADE_SHOTS = [("ww_back_b", 1.5, "うしろ 1.5 マス"), ("ww_back_b", 3.5, "うしろ 3.5 マス"), ("ww_side", 1.2, "ななめ横 1.2 マス"), ("ww_side", 2.8, "ななめ横 2.8 マス")]


def blade_crop(img, s, w=300):
    x, y = int(s[0]), int(s[1])
    return crop(img, (x - 180, y - 130, x + 180, y + 130), w)


def sprite_row(sh, x, y, kind, k=5):
    for th in (0, 45, 90):
        for f in range(BL.FRAMES[kind]):
            im = BL.KINDS[kind](math.radians(th), f)
            big = im.resize((im.width * k, im.height * k), Image.NEAREST)
            bg = Image.new("RGB", big.size, (60, 64, 80))
            bg.paste(big, (0, 0), big)
            sh.img((x, y), bg, f"{th}° コマ{f + 1}", 11)
            x += big.width + 8
    return x


def build_blades():
    sh = Sheet(1660, 1530)
    sh.text((20, 14), "WEAPON-8 v2 ② ふつうの 攻撃の 真空波を「小さな 風の 刃」に（3 案。オーナーが 選ぶ）", 22, HEAD)
    sh.text((20, 46), "オーナー:「通常攻撃の 衝撃波は どうなりますか？ もっと 小さな 風の 刃が 飛んでいく イメージです」。3 案とも カメラに 正面の 板 1 まい・1 点 = 1/16 ブロック・らせんと 同じ 5 色。", 14)
    sh.text((20, 66), "絵の 向き: うしろから（はなれて いく）は アーチ（上向き）、横は 進む 向き。8 向きに まるめて、向きごとに 点で 描いた 絵（0・45・90° を 描き 反転）を えらぶ。見た目だけ 剣の 側へ 0.4 ずらす（頭で かくれない・当たり 0.5 の 中）。", 13, K.SUB)
    y = 96
    # 今
    sh.text((20, y), "今: 白い 三日月（十字の 板 2 まい・1.3 ブロック）。うしろから だと 線に なる", 15)
    now = Image.open(os.path.join(PROTO, "4_now_windwave.png")).convert("RGB")
    sh.img((20, y + 22), crop(now, (330, 250, 730, 530), 300), "今 うしろ（F16）", 12)
    sp_img, _ = SP.render("bg_side", 14, "S2")
    sh.img((340, y + 22), crop(sp_img, (380, 200, 1180, 700), 300), "らせんの かぜ（S2・ためわざ）: 大きい・青い 帯・回る", 12)
    y += 22 + 18 + 190
    for kind in ("K1", "K2", "K3"):
        name, desc = BLADE_INFO[kind]
        sh.text((20, y), f"{name}: {desc}", 16, HEAD)
        y += 24
        x = 20
        for shot, t, lab in BLADE_SHOTS:
            img, s, th = BL.render(shot, kind, t)
            sh.img((x, y), blade_crop(img, s), f"{lab}（絵の 向き {th:.0f}°）", 12)
            x += 312
        sprite_row(sh, x, y, kind, 3)
        y += 18 + 216 + 20
    sh.text((20, y), "3 案とも: 出る 2 ステップ（0.6 倍）→ とぶ（コマは 3 ステップごと）→ さいご 4 ステップ 網で うすく。とぶ 長さ・速さ・当たりは 今の まま（5 マス・15 マス/秒・半径 0.5）。", 13, K.SUB)
    sh.text((20, y + 20), "数: 8 つ 同時でも 1 回の 描画（インスタンス）・三角形 16。今は 十字 2 まい × 8 = 16 メッシュ（描画 最大 16 回・32 三角形）なので 軽く なる。絵 = K1 132×22・K2 144×24・K3 240×20（1 まいに ならべる）。", 13, K.SUB)
    sh.save(os.path.join(OUT, "blade-3.png"))

    marks = {
        "K1": {1: ("○", "三日月は 影でも「刃」"), 2: ("○", "白い からだ ＋ こい ふち B3"), 3: ("○", "小さいが 白が 先に 目に 入る"), 4: ("○", "細かいのは ふちと すじ 2 本だけ"),
               6: ("○", "白 7 割・水色 2 割・こい 青 1 割"), 7: ("○", "5 段"), 8: ("○", "らせん（大きい 青い 帯・回る）と 大きさ・形で 分かれる"), 9: ("○", "さんかく（とがった 両はし）＋まる"),
               10: ("○", "今の 三日月と 同じ なかま・点の 大きさ 1/16"), 12: ("○", "字なしで「刀から 風の 刃」"), 13: ("○", "形で 分かる"), 16: ("○", "控えめ（くり返す わざ）"), 17: ("○", "すっきり かっこいい")},
        "K2": {1: ("△", "うしろから（アーチ）だと Wi-Fi の しるしに 見える"), 2: ("○", "前の 弧だけ 白＋ふち"), 3: ("△", "線が 細く 前の 弧 以外は 目に 入りにくい"), 4: ("△", "線 3 本で 小さい わりに 細かい"),
               6: ("○", "水色 多め・白 少し"), 7: ("○", "前 → うしろへ うすく"), 8: ("○", "らせんと 形が ちがう"), 9: ("○", "まるの くり返し（やさしい）"),
               10: ("○", "同じ 色・点"), 12: ("△", "「音の 波」とも 読める"), 13: ("○", "形で 分かる"), 16: ("○", "いちばん 静か"), 17: ("△", "やさしく 弱そうに 見える")},
        "K3": {1: ("○", "3 まい羽の うず は 影でも はっきり"), 2: ("○", "白い 芯 ＋ こい ふち"), 3: ("○", "目立つ（いちばん 強い）"), 4: ("△", "羽 3 まい＋すじで 小さい わりに 細かい"),
               6: ("○", "白 6 割・水色 3 割"), 7: ("○", "5 段"), 8: ("△", "回る ので らせん（回る）と「回る」が 重なる（大きさ・形では 分かれる）"), 9: ("○", "さんかく（羽）"),
               10: ("○", "同じ 色・点"), 12: ("○", "字なしで「手裏剣の 風」"), 13: ("○", "形で 分かる"), 16: ("△", "回りが ふつうの わざには 少し にぎやか"), 17: ("○", "かっこいい")},
    }
    mmarks = {
        "K1": {1: ("○", "出る 2 → とぶ 14 → きえる 4（20 ステップ）"), 2: ("○", "「ひゅっと 小さな 刃が とぶ」＋ 止め絵"), 3: ("○", "わざの 当たりの ステップに 出る（今と 同じ）"),
               8: ("○", "出るは 2 ステップで いっきに"), 11: ("○", "小さいが ふちで 見える"), 13: ("―", "回らない"), 16: ("○", "見た目 0.4 ずらしは 当たり 0.5 の 中"), 18: ("○", "8 向きの 絵（反転は 左右 対称 なので 問題なし）")},
        "K2": {1: ("○", "同じ"), 2: ("○", "「さざなみが とぶ」"), 3: ("○", "同じ"), 8: ("○", "同じ"), 11: ("△", "線が 細く 遠くで 消えやすい"), 13: ("―", "回らない"), 16: ("○", "同じ"), 18: ("△", "うしろ（アーチ）は Wi-Fi に 見える")},
        "K3": {1: ("○", "同じ"), 2: ("○", "「くるくる 手裏剣の 風」"), 3: ("○", "同じ"), 8: ("○", "同じ"), 11: ("○", "回りで 遠くでも 見える"), 13: ("△", "画面の 中で 1 つの 軸だけ 回る（板 なので ほかの 軸は ない）"), 16: ("○", "同じ"), 18: ("○", "回る ので 向きの 差が 目立たない")},
    }
    for kind in ("K1", "K2", "K3"):
        name, desc = BLADE_INFO[kind]
        s2 = Sheet(1660, 1500)
        s2.text((20, 14), f"WEAPON-8 v2 ② {name}", 22, HEAD)
        s2.text((20, 46), desc, 14)
        y = 76
        s2.text((20, y), "絵（1 点 = 1/16 ブロック・5 倍）: 0° = 横に とぶ / 45° = ななめ / 90° = うしろから（はなれる）", 14, HEAD)
        sprite_row(s2, 20, y + 22, kind, 5)
        y += 22 + 18 + 24 * 5 + 20
        s2.text((20, y), "ゲームの スクショに 重ねた 絵", 14, HEAD)
        y += 22
        x = 20
        for shot, t, lab in BLADE_SHOTS:
            img, s, th = BL.render(shot, kind, t)
            s2.img((x, y), blade_crop(img, s, 390), lab, 12)
            x += 404
        y += 18 + 282 + 14
        # 横から 見た 動き（とぶ 0〜5 マス）
        s2.text((20, y), "横から 見た 動き（MOTION ③）: 出る（0.6 倍）→ とぶ → さいご 網で きえる。コマ 3 ステップごと", 14, HEAD)
        y += 22
        x = 20
        for i, t in enumerate((0.25, 0.5, 1.5, 2.5, 3.5, 4.5)):
            sc = 0.6 if i == 0 else 1.0
            img, s, th = BL.render("ww_side", kind, t, frame=i % BL.FRAMES[kind], scale=sc)
            if i == 5:  # きえかけ（網）
                lay = BL.LAST
                m = (np.indices(lay.a.shape).sum(0) // 6) % 2 == 0
                lay.a[m] = 0
                cam = SC.Cam("ww_side")
                img = SC.composite(SC.bg("ww_side"), lay, cam, SC.char_depth(cam), SC.char_mask(SC.bg("ww_side"), cam))
            s2.img((x, y), crop(img, (560, 280, 1100, 560), 262), f"{t} マス", 12)
            x += 272
        y += 18 + 136 + 14
        # 8 方向（カメラを 回した とき えらばれる 絵）
        s2.text((20, y), "8 方向ならべ（MOTION ②: カメラの 向きを 45° ずつ 変えた とき えらばれる 絵。上 = 今の 十字の 板）", 14, HEAD)
        y += 22
        x = 20
        now_sheet = Image.open(os.path.join(K.ROOT, "public", "models", "fx", "windwave_sheet.png")).convert("RGBA")
        for i in range(8):
            ang = i * 45
            # 今: 十字の 板を その 向きから 見た 太さ（真うしろ・真正面は 線）
            nw = now_sheet.crop((32, 0, 64, 32))
            sx = abs(math.sin(math.radians(ang)))
            w = max(2, int(32 * sx))
            nb = Image.new("RGB", (32 * 3, 32 * 3), (60, 64, 80))
            sq = nw.resize((w * 3, 96), Image.NEAREST)
            nb.paste(sq, ((96 - w * 3) // 2, 0), sq)
            s2.img((x, y), nb, f"{ang}°", 11)
            # 案
            if ang in (0, 180):
                th = math.pi / 2 if ang == 0 else -math.pi / 2
            else:
                th = 0.0 if ang < 180 else math.pi
                if ang in (45, 135, 225, 315):
                    th = math.radians(45 if ang in (45, 315) else 135) if ang < 180 else math.radians(225 if ang == 225 else -45)
            sp = BL.KINDS[kind](th, 0)
            b = Image.new("RGB", (sp.width * 4, sp.height * 4), (60, 64, 80))
            big = sp.resize(b.size, Image.NEAREST)
            b.paste(big, (0, 0), big)
            s2.img((x, y + 128), b, "", 11)
            x += max(96, b.width) + 10
        y += 128 + 100
        # 確かめ
        img, s, th = BL.render("ww_side", kind, 2.8)
        lay = BL.LAST
        box = (int(s[0]) - 200, int(s[1]) - 140, int(s[0]) + 200, int(s[1]) + 140)
        # 今と らせんと ならべる
        tri = Image.new("RGB", (400, 280), (60, 64, 80))
        nowc = crop(now, (330, 250, 730, 530), 133)
        tri.paste(nowc, (0, 60))
        tri.paste(crop(img, box, 133), (133, 60))
        tri.paste(crop(sp_img, (380, 200, 1180, 700), 134), (266, 60))
        d = ImageDraw.Draw(tri)
        d.text((4, 4), "今 / 案 / らせん", font=K.font(14), fill=(236, 232, 220))
        sh2y = y
        s2.text((20, y), "確かめの 絵（CRITERIA 4 まい）", 15, HEAD)
        y += 22
        xx = 20
        for lab, t in (("① シルエット（エフェクト だけ）", eff_silhouette(lay, box, 300)), ("② 白黒", K.gray(crop(img, box, 300))),
                       ("③ ぼかし", crop(img, box, 300).filter(ImageFilter.GaussianBlur(4))), ("④ 今の 三日月・案・らせん", tri.resize((300, 210)))):
            s2.img((xx, y), t, lab, 12)
            xx += 312
        y += 18 + 210 + 16
        _ = sh2y
        s2.text((20, y), "ものさし表 CRITERIA 1〜17", 15, HEAD)
        s2.text((840, y), "ものさし表 MOTION 1〜18（体の 動きは 今の まま。― = かかわらない）", 15, HEAD)
        y += 22
        s2.table((20, y), criteria_rows(marks[kind], CRITERIA_NAMES), [26, 130, 40, 600], 12, 17)
        s2.table((840, y), criteria_rows(mmarks[kind], MOTION_NAMES), [26, 130, 40, 600], 12, 17)
        s2.save(os.path.join(OUT, f"blade-{kind.lower()}.png"))


# ====================================================================== 3. ため（手もと）
def build_charge():
    sh = Sheet(1660, 1500)
    sh.text((20, 14), "WEAPON-8 v2 ③ ため中の 光を「剣を 持つ 手」へ（T1 の 直し H1「手もとの 光」）", 22, HEAD)
    sh.text((20, 46), "オーナー:「体を 隠すは やりすぎかも 剣を 持ってる 手の あたりが 光る とかで いいかも」。T1 の 区間・音・色の 表は そのまま、集まる 所と 大きさを 変える。", 14)
    sh.text((20, 66), "芯は 手（にぎり）に 直径 4 点（0.25 ブロック）まで。つぶは 体の 方からは 来ない。いっぱい: 手もとに 小さな 輪 1 回 ＋ 刃を 光が 1 回 走る → 剣先に きらり（止まった まま）。", 13, K.SUB)
    y = 96
    L = [("ch_back_F30", "back", 30, "fujin", "集まる ためF 30"), ("ch_back_F62", "back", 62, "fujin", "いっぱい ためF 62（輪・刃の 光）"),
         ("ch_back_F62", "back", 66, "fujin", "ためF 66（輪 ひろがる・光 剣先へ）"), ("ch_back_F90", "back", 90, "fujin", "いっぱい中 ためF 90"),
         ("ch_side_F90", "side", 90, "fujin", "ななめ横 ためF 90"), ("ch_back_F90", "back", 90, "raijin", "雷神剣（色だけ ちがう）")]
    x = 20
    keep = {}
    for i, (shot, view, F, pal, lab) in enumerate(L):
        img, (hx, hy), n = CH.render(shot, view, F, pal)
        keep[i] = (img, CH.LAST, (hx, hy))
        sh.img((x, y), crop(img, (hx - 150, hy - 90, hx + 110, hy + 230), 260), f"{lab}  つぶ {n}", 12)
        x += 270
    y += 18 + 320 + 16
    sh.text((20, y), "今（試作の T1）: 胸の 芯と 大きな にじみが 体を かくす", 15)
    y += 22
    x = 20
    for f in ("2_fujin_T1_F30.png", "2_fujin_T1_F62.png", "2_fujin_T1_F90.png", "2_raijin_T1_F90.png"):
        sh.img((x, y), crop(Image.open(os.path.join(PROTO, f)).convert("RGB"), (440, 310, 700, 630), 260), f, 12)
        x += 270
    # 等倍の 全体
    img, lay, (hx, hy) = keep[3]
    sh.img((x, y), crop(img, (240, 150, 1040, 650), 450), "全体（ためF 90）: 体は ぜんぶ 見える", 12)
    y += 18 + 320 + 16
    # 確かめ
    box = (hx - 150, hy - 90, hx + 110, hy + 230)
    y = checks(sh, 20, y, img, lay, box, 300, Image.open(os.path.join(PROTO, "2_fujin_T1_F90.png")).convert("RGB"), "④ 今の T1 と ならべる",
               extra=(440, 310, 700, 630))
    sh.text((20, y), "区間（今の 仕様 §3.5 と 同じ。変える 所 だけ）", 15, HEAD)
    y += 22
    rows = [["区間", "ためF", "見た目（v2）"],
            ["集まる gather", "1〜59", "つぶ（頭 1 点＋尾 2 点）が 手へ。体の まん中の 向き ±70° からは 出さない。芯 = 半径 0.5 → 1.5 点（＋網の にじみ）"],
            ["いっぱいの 瞬間 burst", "60〜71", "手もとの 輪（半径 3 → 8.5 点・1 点の 線・後半 網）1 回。60〜65 に 刃の 根もと → 先へ 光が 1 回 走る（2 点＋1 点＋1 点）"],
            ["いっぱい中 full", "72〜", "剣先に きらり 7×7（止まった まま）。手の まわりを つぶ 2 つが ゆっくり（1 回り 120 ステップ）。つぶは 集まりつづける"],
            ["消える fade", "F1〜4", "今の まま（網で 4 段）"],
            ["一人称", "", "集まる 所を「画面の 下の まん中」→「画面に 見える 剣の 手（右下）」へ（仕様 §3.5 の 変更 = designer へ）"]]
    y = sh.table((20, y), rows, [180, 80, 1300], 13, 19) + 8
    sh.text((20, y), "数: 芯・輪・きらり = 1 まいの 絵の 板 3 まいを 1 つの メッシュに（描画 1・三角形 6）＋ つぶ（THREE.Points・48 まで）描画 1 = 描画 2・三角形 6（今の T1 は 2・約 52）。", 13, K.SUB)
    y += 20
    sh.text((20, y), "刃の 光は つぶと 同じ Points。手と 剣先の 位置は 人形の 手の 骨と 剣の 先（本番は developer が 骨から とる）。点滅なし: 明るさは 上がって 止まる・輪と 刃の 光は 1 回だけ。", 13, K.SUB)
    y += 28
    marks = {1: ("○", "剣を かかげた 影に 手もとの 光"), 2: ("○", "白い 芯が いちばん 明るい"), 3: ("○", "手もと → 剣先へ 目が 行く。体は かくさない"),
             4: ("○", "細かいのは 手もとと 剣先 だけ"), 6: ("○", "光は 小さな 面積"), 7: ("○", "5 段"), 8: ("○", "風神 水色・雷神 黄色"),
             9: ("○", "まる（芯・輪）＋さんかく（きらり）"), 10: ("○", "T1 と 同じ 色の 表・点の 大きさ"), 11: ("―", ""), 12: ("○", "字なしで「剣に 力が たまった」"),
             13: ("○", "輪・きらりの 形でも 分かる"), 16: ("○", "chargeReady の 音と 同じ ステップ"), 17: ("○", "剣が 光る のは かっこいい")}
    mm = {1: ("○", "区間は 今の 仕様"), 2: ("○", "「手に 光が すいこまれ、剣が きらり」"), 4: ("○", "つぶが 手へ・芯が 大きく（剣を かかげる ポーズは 今の まま）"),
          11: ("△", "小さく した ので 遠くでは 目立ちにくい（輪と きらりで 補う）"), 18: ("○", "光は カメラに 向く 板と 点。どの 向きでも 同じ")}
    sh.text((20, y), "ものさし表 CRITERIA", 15, HEAD)
    sh.text((840, y), "ものさし表 MOTION（― = かかわらない）", 15, HEAD)
    y += 22
    sh.table((20, y), criteria_rows(marks, CRITERIA_NAMES), [26, 130, 40, 600], 12, 17)
    sh.table((840, y), criteria_rows(mm, MOTION_NAMES), [26, 130, 40, 600], 12, 17)
    sh.save(os.path.join(OUT, "charge-v2.png"))


if __name__ == "__main__":
    build_spiral()
    build_blades()
    build_charge()
