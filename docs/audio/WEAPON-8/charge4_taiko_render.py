# WEAPON-8 ため音 charge4 ＋ いっぱいの 和太鼓（オーナー「チャージ完了したら太鼓のカカッとかどん！とかならせばそれっぽいのでは？」2026-10-21）。
# 「カカッ」= ふちを 打つ 軽い 2 打、「どん！」= 胴の 1 打（低音は しっかり、0.45 秒で 止めて 長く 響かせない）。charge4 の 3 案 × 2 × 風神・雷神。
# 素材（VCSL、CC0）: どん = `Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_mf1.wav`（大太鼓）＋ `Tom 2/Mallet/TomL_HitM_v3_rr1_Mid.wav`（胴の 張り）、
#   カカッ = `Tom 2/TomL_rimS_v2_rr1_Mid.wav`・`TomL_rimS_v2_rr2_Mid.wav`（ふち）。→ bd_mf1・toml_m・rim1・rim2 .f32
# 使い方: python3 charge4_taiko_render.py <素材の .f32 の フォルダ> <出す フォルダ>
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
import charge4_render as C4
from lufs import kw, lufs_int
from render import N, fade, add, onepole_lp as lp
SR = 48000; G = 0.566

def hit(name, dur, tau):
    x = R.load(name); i0 = int(np.argmax(np.abs(x) > 0.1)); i0 = max(0, i0 - N(0.002))
    x = x[i0:i0 + N(dur)]; t = np.arange(len(x)) / SR
    return fade(x * np.exp(-np.maximum(0, t - 0.02) / tau), 0.001, 0.08)

def don():
    a = hit('bd_mf1', 0.45, 0.13); b = hit('toml_m', 0.3, 0.07)
    y = np.zeros(N(0.5)); add(y, a / np.abs(a).max(), 0, 1.0); add(y, b / np.abs(b).max(), 0, 0.45)
    return lp(lp(y, 2500), 2500)

def kaka():
    y = np.zeros(N(0.35))
    for k, (nm, t, g) in enumerate([('rim1', 0.0, 1.0), ('rim2', 0.085, 0.8)]):
        r = hit(nm, 0.15, 0.03); add(y, r / np.abs(r).max(), t, g)
    return lp(lp(y, 5000), 5000)

def k_loud(x):  # 0.4 秒窓での K 重みの 大きさ（WAV の ものさし）
    y = kw(np.concatenate([x * G, np.zeros(N(0.4))])[:max(len(x), N(0.4))]); return -0.691 + 10 * np.log10(np.mean(y[:N(0.4)] ** 2))

DRUMS = {'don': (don(), -32.5), 'kaka': (kaka(), -36.5)}   # ピーク -8 dBFS 前後・いっぱいが ための おわりより +3〜5 dB に なる 大きさ（K 重みは 低音を 小さく 見るので 数は 小さめ）
if __name__ == '__main__':
    out = sys.argv[2]; R.SOFT['on'] = False
    x, _ = R.assemble(C4.C3.p2_uzu, None, 5); k_uzu = 10 ** ((C4.TARGET - lufs_int(kw(x * G))) / 20)
    for name, fn in C4.PLANS:
        x, _ = R.assemble(lambda rng, fn=fn: (lambda a, b, c: (a, b * C4.CUE, c))(*fn(rng, k_uzu)), None, 5)
        kk = 10 ** ((C4.TARGET - lufs_int(kw(x * G))) / 20)
        for dn, (dr, lv) in DRUMS.items():
            d = dr * 10 ** ((lv - k_loud(dr)) / 20) / G
            def plan(rng, fn=fn, kk=kk, d=d):
                a, b, c = fn(rng, k_uzu); b = C4.mix(b * kk * C4.CUE, d); return a * kk, b, c * kk
            for fl in ['fujin', 'raijin']:
                y, _ = R.assemble(plan, fl, 5)
                R.write(f'{out}/charge4_{name}_{dn}_{fl}.wav', y * G)
