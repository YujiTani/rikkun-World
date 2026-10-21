# WEAPON-8 ため音 C2 の「いっぱいの 合図」候補（オーナー「ちーんという音がもっとしっくりくるものをさがしたい」2026-10-21）。
# ため・ため続けは C2 の まま（風神剣の 味つき）。合図だけ 入れかえた 通しを 書き出す。合図の 大きさは 今の C2 の「チーン」に そろえる（K 重み）。
# 使い方: python3 -I ready_render.py <素材の .f32 の フォルダ> <出す フォルダ>（素材は render.py と 同じ ＋ VCSL バラフォン
#   Idiophones/Struck Idiophones/Balafon/Soft Mallet/EthnicXylo_softM_C5_vl3_rr1_Mid.wav → balafon_C5.f32、CC0）
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
from lufs import kw
from render import N, fade, seg, resample, add, svf_bp, onepole_lp as lp, note, hz, ramp, SMP, F0
SMP['balafon_C5'] = R.load('balafon_C5'); F0['balafon_C5'] = 1046.5
SR = 48000

def kaze_hyuin(rng):  # 風が ふわっと 集まって「ひゅいん」と 閉じる
    out = np.zeros(N(1.2)); m = N(0.28); t = np.arange(m) / m
    g = svf_bp(rng.standard_normal(m), 500 * (1500 / 500) ** t, 3.0); g /= np.abs(g).max()
    spin = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(np.linspace(8, 22, m)) / SR)
    add(out, g * spin * t ** 1.5, 0.0, 0.8)
    m2 = N(0.55); t2 = np.arange(m2) / SR
    w = svf_bp(rng.standard_normal(m2), 1050 * (1400 / 1050) ** np.minimum(1, t2 / 0.12), 14.0); w /= np.abs(w).max()
    add(out, w * np.minimum(1, t2 / 0.02) * np.exp(-t2 / 0.16), 0.24, 1.0)
    return lp(lp(out, 2800), 2800)

def fue_kime(rng):  # オカリナの 短い 上がりの 決め「ぴ・ぽー」
    out = np.zeros(N(1.2))
    add(out, note('ocarina_C5', hz('G5'), 0.10, 0.02, 0.04, t0=0.4), 0.0, 0.7)
    x = note('ocarina_C5', hz('C6'), 0.55, 0.025, 0.35, t0=0.6)
    vib = 1 + 0.05 * np.sin(2 * np.pi * 5.5 * np.arange(len(x)) / SR) * np.minimum(1, np.arange(len(x)) / N(0.2))
    add(out, x * vib, 0.08, 1.0)
    b = svf_bp(rng.standard_normal(N(0.3)), 900, 1.5); b /= np.abs(b).max()   # 息
    add(out, fade(b * np.exp(-np.arange(len(b)) / N(0.08)), 0.01, 0.1), 0.06, 0.12)
    return lp(out, 3000)

def take_koron(rng):  # 木・竹の「ころん」（バラフォン やわらかい ばち、ソ → ド）
    out = np.zeros(N(1.2))
    add(out, note('balafon_C5', hz('G5'), 0.5, 0.004, 0.3), 0.0, 0.7)
    add(out, note('balafon_C5', hz('C6'), 0.8, 0.004, 0.5), 0.09, 1.0)
    add(out, note('balafon_C5', hz('C5'), 0.6, 0.004, 0.4), 0.09, 0.35)
    return lp(out, 3200)

def hikari_kiran(rng):  # 光が はじける「きらん」（やわらかく けずった グロッケン 2 音 ＋ 小さな 粒）
    out = np.zeros(N(1.2))
    add(out, lp(lp(R.glock(hz('G6'), 0.5), 2600), 2600), 0.0, 0.7)
    add(out, lp(lp(R.glock(hz('C7'), 0.8), 2600), 2600), 0.07, 1.0)
    for i in range(6):
        c = svf_bp(rng.standard_normal(N(0.012)), 2400 + 600 * rng.random(), 4.0); c /= np.abs(c).max()
        add(out, fade(c, 0.003, 0.008), 0.08 + i * 0.035 + rng.uniform(0, 0.02), 0.10 * (1 - i / 7))
    return lp(out, 3000)

def rasen_mini(rng):  # らせんの 風の ミニ版「ふぉるっ」（spiralWind と 同じ 作りを 0.45 秒に）
    out = np.zeros(N(1.2)); m = N(0.45); t = np.arange(m) / SR
    env = np.minimum(1, t / 0.03) * np.exp(-t / 0.13)
    rot = np.cumsum(np.interp(t, [0, 0.45], [26, 14])) / SR
    for f0, ph in [(1150, 0.0), (820, np.pi)]:
        y = svf_bp(rng.standard_normal(m), np.interp(t, [0, 0.08, 0.45], [f0 * 0.7, f0, f0 * 0.8]), 4.0); y /= np.abs(y).max()
        add(out, y * (0.5 + 0.5 * np.sin(2 * np.pi * rot + ph)) * env, 0.0, 0.6)
    b = lp(svf_bp(rng.standard_normal(m), 220, 1.2), 500); b /= np.abs(b).max()
    add(out, b * env, 0.0, 0.5)
    return lp(lp(out, 3200), 3200)

CANDS = [('1_kaze-hyuin', kaze_hyuin), ('2_fue-kime', fue_kime), ('3_take-koron', take_koron), ('4_hikari-kiran', hikari_kiran), ('5_rasen-mini', rasen_mini)]

def k_energy(x): return np.sum(kw(x) ** 2)
if __name__ == '__main__':
    out = sys.argv[2]; R.SOFT['on'] = False
    _, ref, _ = R.planC2(np.random.default_rng(7)); ref_e = k_energy(ref)
    for name, fn in CANDS:
        cue = fn(np.random.default_rng(31)); cue *= np.sqrt(ref_e / k_energy(cue))   # 今の「チーン」と 同じ 大きさ
        def plan(rng, cue=cue):
            ch, _, lpx = R.planC2(rng); return ch, cue, lpx
        x, _ = R.assemble(plan, 'fujin', 7)
        R.write(f'{out}/ready_{name}.wav', x * 0.566)  # C2 と 同じ 倍率
    x, _ = R.assemble(R.planC2, 'fujin', 7); R.write(f'{out}/ready_0_ima-chiin.wav', x * 0.566)  # くらべる: 今の C2
