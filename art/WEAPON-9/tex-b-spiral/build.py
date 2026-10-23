"""WEAPON-9 v2 ドーム B「しゃぼんだま」＋ 今の にじの らせん（オーナー決定 2026-10-23 `docs/decisions/2026-10-23-niji-dome-b-spiral.md`）。
- まくの もよう（B の うず・あわ）は とても ゆっくり（4 点/秒 → 1 まわり 88 秒）。あわは 1/3 秒ごとに 上へ。
- にじの らせんは 今の ゲームと 同じ 式・同じ 速さ（5 秒で 1 まわり）。色だけ B の パステルに 合わせた こい めの にじ色 ＋ 白い 芯 ＋ 紺の へり（昼の 空に とけない）。
実行: uv run --no-project --with pillow --with numpy python art/WEAPON-9/tex-b-spiral/build.py
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import tex9  # noqa: E402
import sheet9  # noqa: E402
import kit9  # noqa: E402
from kit9 import kit  # noqa: E402
from PIL import Image  # noqa: E402

sp = importlib.util.spec_from_file_location("tex_b", os.path.join(HERE, "..", "tex-b", "build.py"))
tb = importlib.util.module_from_spec(sp)
sp.loader.exec_module(tb)

SPIRAL = {"hues": ["#6CD9A6", "#62B6F2", "#B98CEB"], "core": "#FBFDF6", "edge": tex9.D, "period": 5.0}


def build():
    O = dict(tb.O)
    O["shift"] = lambda t: int(t * 4)
    O["spiral"] = SPIRAL
    tile = O["tile_fn"]()
    rim = tex9.rim_sprite(O["rim_bins"])
    ring = tex9.ring_img(*O["ring"])
    O.update(tile=tile.composite(1), rim=rim.composite(1), ring_img=ring.composite(1), orb_img=tex9.orb_img())
    tile.save_png(os.path.join(HERE, "dome_surf_1x.png"))
    rim.save_png(os.path.join(HERE, "dome_rim_1x.png"))
    ring.save_png(os.path.join(HERE, "ring_1x.png"))
    return dict(render=tex9.make_render(O), light=0.30, tint=(1.0, 0.95, 0.8))


def main():
    SP = build()
    _, key = sheet9.scene(SP, 120)
    _, key_fp = sheet9.scene(SP, 120, first=True)
    key.save(os.path.join(HERE, "key_outside.png"))
    key_fp.save(os.path.join(HERE, "key_first.png"))
    # とどまる 間の 2.5 秒（F60〜F210 は とどまる 160 の 中）: 0.5 秒ごと → コマ表、4 ステップごと → GIF
    table = []
    for k in range(6):
        stp = 50 + k * 30
        _, im = sheet9.scene(SP, stp, size=(320, 200))
        t = stp / 60
        table.append((im, f"{(stp - 50) / 60:.1f} 秒: らせん {round((t * 360 / 5) % 360)}°・もよう {int(t * 4)} 点"))
    gif = []
    for stp in range(41, 201, 4):
        _, im = sheet9.scene(SP, stp, size=(480, 300))
        gif.append(im)
    gif[0].save(os.path.join(HERE, "spin.gif"), save_all=True, append_images=gif[1:], duration=67, loop=0)
    # 出る〜消える も（うかぶ・おりる）
    tl = []
    for name, stp, dur in sheet9.TIMELINE:
        tl.append((sheet9.scene_t(SP, stp, (640, 400)), dur))
    tl[0][0].save(os.path.join(HERE, "scene.gif"), save_all=True, append_images=[a for a, _ in tl[1:]],
                  duration=[max(40, round(min(d, 90) * 1000 / 60)) for _, d in tl], loop=0)
    return key, key_fp, table


if __name__ == "__main__":
    key, fp, table = main()
    sh = kit.Sheet(1360, 1060)
    sh.text((24, 14), "ドーム B「しゃぼんだま」＋ にじの らせん（2026-10-23 決定）", 28, sheet9.GOLD)
    sh.text((24, 54), "らせん = 今の ゲームと 同じ 式・5 秒で 1 まわり（はやい）。B の もよう = 1 まわり 88 秒（ほぼ 止まって 見える）・あわが のぼる。色は B に 合う こい めの パステル にじ ＋ 白い 芯 ＋ 紺の へり。", 14)
    sh.label_img((24, 86), key, "外から（カメラ 12・F120）", 13)
    sh.label_img((684, 86), fp, "中から（一人称。らせんは 細い 線・網）", 13)
    y = 520
    sh.text((24, y), "コマ表（とどまる 間 0.5 秒ごと。らせんだけ 大きく まわり、もようは ほとんど うごかない）", 16, sheet9.GOLD)
    for i, (im, lab) in enumerate(table):
        x = 24 + (i % 3) * 444
        yy = y + 30 + (i // 3) * 250
        sh.label_img((x, yy), im.resize((420, 262), Image.NEAREST) if False else im, lab, 13)
    sh.save(os.path.join(HERE, "sheet.png"))
