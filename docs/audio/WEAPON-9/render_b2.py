# WEAPON-9 B2: B「はがねの にじ」の 斬撃を「ドシュ」に 直した 版（決定 2026-10-21-niji-sound-b.md）。
# ド = 低くて 重い 当たり（下がる 低音 ＋ 丸い 衝撃）、シュ = 速くて 鋭い 切れ。はがねの 鳴りは 少しだけ。余韻は 短め。
# 使い方: python3 -I render_b2.py <VCSL フォルダ> <出す フォルダ>   （B_ の 名前は そのまま、B2_hagane2_ で 書き出す）
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render import *

def dosh(k, rng, note, g=1.0, size=1.0, sweep=0.10):
    """1 回の「ドシュ」。size は 大きい 切りの 重さ・長さ"""
    out = np.zeros(N(0.6))
    # ド: 低音が 速く 下がる（150 → 55 Hz）＋ 丸い 衝撃（低い 帯の ノイズ）
    add(out, sine(150 * (0.9 + 0.1 * size), 55, 0.16 * size + 0.05, a=0.002, tau=0.05 * size + 0.02), 0.0, 0.85 * g)
    add(out, lp(swish(rng, 0.05, 700, 300, q=1.2, a=0.001), 900), 0.0, 0.6 * g)
    # シュ: ド の すぐ 後ろに 速くて 鋭い 切れ（高い 帯が 上へ 走る）
    add(out, swish(rng, sweep, 2500, 8500, q=2.2, a=0.0015, curve=0.35), 0.012, 0.7 * g)
    # はがねの 鳴り: 少しだけ（金床 ＋ くし形）
    add(out, fade(pitch(k.s(f'anvil__{rng.integers(0, 3)}', 0, 0.25), rng.uniform(-1, 1)), 0.001, 0.12), 0.02, 0.07 * g)
    add(out, kin_comb(rng, note, 0.14), 0.02, 0.22 * g)
    return out

def B2_slash(k, rng, stage, v):
    out = np.zeros(N(1.4)); sh = [0, 1, -1][v % 3]
    if stage == 1:   cuts = [(0.0, 3, 1.0, 1.0, 0.09)]
    elif stage == 2: cuts = [(0.0, 4, 1.0, 1.15, 0.13), (0.11, 6, 0.45, 0.6, 0.06)]
    else:            cuts = [(0.0, 5, 1.0, 1.3, 0.12), (0.10, 6, 0.55, 0.6, 0.06), (0.17, 7, 0.55, 0.6, 0.06)]
    for t, deg, g, sz, sw in cuts: add(out, dosh(k, rng, penta(deg + sh, 6), g, sz, sw), t, 1.0)
    if stage == 3:
        for j, nt in enumerate(['C5', 'E5', 'G5']): add(out, k.chime(nt, 0.7), 0.24 + 0.02 * j, 0.10)
    return finish(hall(lp(out, 9500), 0.35, 0.08), 0.0015, 0.12)

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
    k = Kit(Samples(src)); rng = np.random.default_rng(94); pre = f'{out}/B2_hagane2'
    combo = np.zeros(N(4.6))
    for s in (1, 2, 3):
        vs = [trim(level(B2_slash(k, rng, s, v), TARGET[f'slash{s}'])) for v in range(3)]
        write(f'{pre}_slash{s}.wav', pad(vs[0]))
        add(combo, vs[0], 0.15 + COMBO_T[s - 1]); add(combo, vs[(s % 2) + 1], 2.35 + COMBO_T[s - 1])
    write(f'{pre}_slash_combo.wav', trim(combo))
    print('done B2')
