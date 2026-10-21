# WEAPON-8 いっぱいの 合図 2 回目の 候補（オーナー「もっとしゃきーん！っとか ぴきん！とかがいいかな」2026-10-21）。
# ため・ため続けは C2 の まま（風神剣の 味つき）。合図は 今の C2 の「チーン」より +2 dB（前より 目立って よい）。6 kHz より 上は 2 段で けずる。
# 使い方: python3 ready2_render.py <素材の .f32 の フォルダ> <出す フォルダ>（素材は render.py と 同じ）
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
from lufs import kw
from render import N, fade, add, svf_bp, onepole_lp as lp, note, hz, SMP, F0
SR = 48000

def ring(fs, gains, dur, tau, beat=4.0):  # 金属・ガラスの 鳴り（少し ずれた 2 本で きらめく ゆれ）
    t = np.arange(N(dur)) / SR; out = np.zeros(len(t))
    for f, g in zip(fs, gains):
        out += g * 0.5 * (np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * (f + beat) * t + 1.0)) * np.exp(-t / (tau * 1800 / max(f, 1800)))
    return fade(out, 0.002, dur * 0.3)

def scrape(rng, dur, f0, f1, q=6.0):  # 刃が さやを すべる「しゃっ」
    m = N(dur); t = np.arange(m) / m
    y = svf_bp(rng.standard_normal(m), f0 * (f1 / f0) ** t, q); y /= np.abs(y).max()
    return y * np.minimum(1, t / 0.15) * (1 - t) ** 0.5

def crack(rng, f=3400, d=0.010, q=4.0):
    c = svf_bp(rng.standard_normal(N(d)), f, q); return fade(c / np.abs(c).max(), 0.002, d * 0.6)

def shakiin_katana(rng):  # 刀を ぬく「しゃきーん！」: すべる 音 0.14 秒 → 金属の 鳴り（G6・B6+ の 鋼の 倍音）
    out = np.zeros(N(1.3))
    add(out, scrape(rng, 0.14, 1800, 4200), 0.0, 0.55)
    add(out, ring([1568, 2380, 3530, 4700], [1.0, 0.55, 0.35, 0.12], 1.1, 0.30), 0.12, 0.9)
    add(out, crack(rng, 3000, 0.012), 0.12, 0.5)
    return out

def shakiin_kaze(rng):  # 風の 刃の「しゃきーん！」: 回る 風が 鋭く 上がって → 澄んだ 鳴り（C7 と G7、風神・雷神 どちらにも）
    out = np.zeros(N(1.3)); m = N(0.18); t = np.arange(m) / m
    w = svf_bp(rng.standard_normal(m), 900 * (3800 / 900) ** t, 7.0); w /= np.abs(w).max()
    add(out, w * t ** 1.2 * (0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(np.linspace(15, 35, m)) / SR)), 0.0, 0.6)
    add(out, ring([2093, 3136, 4186], [1.0, 0.45, 0.15], 1.0, 0.26, beat=5.0), 0.17, 0.85)
    return out

def pikin_glass(rng):  # 光・ガラスの「ぴきん！」: とても 短い はじけ ＋ 高い 2 音（E7・B7 を けずって）が すぐ 消える
    out = np.zeros(N(1.0))
    add(out, crack(rng, 3800, 0.008, 5.0), 0.0, 0.6)
    add(out, ring([2637, 3951], [1.0, 0.5], 0.45, 0.10, beat=7.0), 0.004, 0.9)
    add(out, ring([2637 * 1.5], [0.3], 0.3, 0.06), 0.05, 0.4)
    return out

def pikin_kori(rng):  # 氷が はじける「ぴきっ・きん」: 小さな ひび 3 つ（ばちばちの 仲間）→ 少し 上がる 高い 鳴り
    out = np.zeros(N(1.0))
    for i, (tt, f) in enumerate([(0.0, 3200), (0.018, 3700), (0.03, 4200)]):
        add(out, crack(rng, f, 0.009, 5.0), tt, 0.55 - 0.1 * i)
    t = np.arange(N(0.5)) / SR; f = 2350 + 450 * np.minimum(1, t / 0.025)
    pk = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12) + 0.35 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) * np.exp(-t / 0.05)
    add(out, fade(pk, 0.002, 0.15), 0.035, 0.9)
    return out

CANDS = [('1_shakiin-katana', shakiin_katana), ('2_shakiin-kaze', shakiin_kaze), ('3_pikin-glass', pikin_glass), ('4_pikin-kori', pikin_kori)]
def k_energy(x): return np.sum(kw(x) ** 2)
if __name__ == '__main__':
    out = sys.argv[2]; R.SOFT['on'] = False
    _, ref, _ = R.planC2(np.random.default_rng(7)); ref_e = k_energy(ref) * 10 ** (2 / 10)
    for name, fn in CANDS:
        cue = lp(lp(fn(np.random.default_rng(41)), 5500), 5500)
        cue *= np.sqrt(ref_e / k_energy(cue)) * (10 ** (-2 / 20) if name.startswith('3_') else 1.0)  # ぴきん（ガラス）は とがるので -2 dB
        def plan(rng, cue=cue):
            ch, _, lpx = R.planC2(rng); return ch, cue, lpx
        x, _ = R.assemble(plan, 'fujin', 7); R.write(f'{out}/ready2_{name}.wav', x * 0.566)
        x, _ = R.assemble(plan, 'raijin', 7); R.write(f'{out}/ready2_{name}_raijin.wav', x * 0.566)
