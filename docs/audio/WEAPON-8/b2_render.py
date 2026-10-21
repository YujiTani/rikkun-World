# WEAPON-8 ため音 B2「ひかりの うた（しずか版）」: 最初の 案 B を そのまま 静かに（オーナー「最初のひかりうたが良かった気もしてきましたね。あれを静かにして採用しましょう」2026-10-21）。
# 音の 中身・流れは B の まま。ため -9.5 dB・合図 -6 dB（ための おわりより 大きく）・ため続け -13.5 dB。耳に ささる 高い 所だけ 少し けずる（2 段 ローパス 5.5 kHz）。
# 風神・雷神の 味は 前と 同じ 層で、B の 中での 割合を 保つ（本体と いっしょに -9.5 dB。風神の ため続けは T2 の -3 dB を さらに）。書き出しの 倍率は B と 同じ（差が そのまま 比べられる）。
# 使い方: python3 b2_render.py <素材の .f32 の フォルダ> <出す フォルダ>
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
from render import onepole_lp as lp
DB = lambda d: 10 ** (d / 20)
CH, RD, LP = DB(-9.5), DB(-6.0), DB(-13.5)   # 合図は ための おわりより 上に（T1）
FL = DB(-9.5)
_fc, _fl = R.flavor_charge, R.flavor_loop
R.flavor_charge = lambda kind, T, rng: _fc(kind, T, rng) * FL
R.flavor_loop = lambda kind, L, rng: _fl(kind, L, rng) * FL * (DB(-3.0) if kind == 'fujin' else 1.0)
def soft(x): return lp(lp(x, 5500), 5500)
def planB2(rng):
    ch, rd, lpx = R.planB(rng)
    return soft(ch) * CH, soft(rd) * RD, soft(lpx) * LP
if __name__ == '__main__':
    out = sys.argv[2]; R.SOFT['on'] = False
    base, _ = R.assemble(R.planB, None, 7); gB = 10 ** (-6 / 20) / np.abs(base).max()   # render.py の B と 同じ 倍率
    for fl in [None, 'fujin', 'raijin']:
        x, _ = R.assemble(planB2, fl, 7)
        R.write(f'{out}/B2_hikari-uta-shizuka' + (f'_{fl}' if fl else '') + '.wav', x * gB)
