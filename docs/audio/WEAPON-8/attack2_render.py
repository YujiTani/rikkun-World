# WEAPON-8 攻撃の 音 2 版（オーナー「いいかんじ。もっと派手でもいい」2026-10-21）＋ ためわざ「らせんの かぜ」spiralWind。
# 作りは attack_render.py と 同じ（合成だけ）。高い 帯域（3 kHz より 上）は 1 版と 同じくらいに おさえる。ものさしも 同じ。
# 使い方: python3 -I attack2_render.py <出す フォルダ>
import numpy as np, sys
from attack_render import N, fade, add, svf_bp, lp, write
SR = 48000

# 真空波（小さな 風の 刃）: 速く 入って 鋭く 上がる「ひゅるっ」＋ 刃の「シュッ」＋ 少し おくれた 2 本目の 風（広がり）
WIND2 = [dict(lo=650, hi=2300, end=1000, spin=(20, 11)), dict(lo=750, hi=2600, end=1150, spin=(22, 12)), dict(lo=560, hi=2000, end=880, spin=(18, 10))]
def wind_blade(v, rng):
    T = 0.34; n = N(T); out = np.zeros(N(0.45))
    for k, (dly, mul, g, q) in enumerate([(0.0, 1.0, 1.0, 5.0), (0.018, 0.82, 0.55, 3.0)]):
        t = np.arange(n) / n
        fc = np.where(t < 0.22, v['lo'] * (v['hi'] / v['lo']) ** (t / 0.22), v['hi'] * (v['end'] / v['hi']) ** ((t - 0.22) / 0.78)) * mul
        y = svf_bp(rng.standard_normal(n), fc, q); y /= np.abs(y).max()
        spin = 0.55 + 0.45 * np.sin(2 * np.pi * np.cumsum(np.linspace(*v['spin'], n)) / SR + k)
        e = np.minimum(1, t / 0.035) * np.exp(-np.maximum(0, t - 0.035) * 5.5)  # 約 0.012 秒で 立ち上がる
        add(out, y * spin * e, dly, g)
    s = svf_bp(rng.standard_normal(N(0.05)), 2600, 2.0); s /= np.abs(s).max()   # 刃の「シュッ」
    add(out, fade(s * np.exp(-np.arange(len(s)) / N(0.012)), 0.003, 0.02), 0.0, 0.45)
    return fade(lp(lp(out, 3200), 3200), 0.002, 0.05)

# 雷の 斬撃: 大きめの「バチッ」1 つ ＋ ばちばち 10〜14 粒（2〜3 粒の かたまりで はじける）＋ 低い「ごろろ」
THUNDER2 = [dict(k=12, span=0.24, rum=0.42), dict(k=14, span=0.27, rum=0.46), dict(k=10, span=0.22, rum=0.38)]
def crack(rng, dur=0.014, f=None, q=4.0):
    c = svf_bp(rng.standard_normal(N(dur)), f or (3000 + 1300 * rng.random()), q); return fade(c / np.abs(c).max(), 0.002, dur * 0.7)
def thunder2(v, rng):
    out = np.zeros(N(0.75))
    big = svf_bp(rng.standard_normal(N(0.03)), 2400, 2.0); big = fade(big / np.abs(big).max() * np.exp(-np.arange(N(0.03)) / N(0.008)), 0.002, 0.015)
    add(out, big, 0.01, 1.0)
    ts = np.sort(rng.random(v['k']) ** 1.4 * v['span'])
    for i, tt in enumerate(ts):
        g = (1 - 0.55 * i / v['k']) * rng.uniform(0.7, 1.0)
        for j in range(rng.integers(1, 4)):  # かたまりで はじける
            add(out, crack(rng), 0.02 + tt + j * rng.uniform(0.004, 0.012), g * (1 - 0.3 * j))
    m = N(v['rum']); t = np.arange(m) / SR
    r = lp(lp(rng.standard_normal(m), 190), 190); r /= np.abs(r).max()
    add(out, r * np.minimum(1, t / 0.03) * np.exp(-t / (v['rum'] * 0.4)) * (0.8 + 0.2 * np.sin(2 * np.pi * 9 * t)), 0.03, 0.8)
    return fade(lp(out, 4000), 0.002, 0.06)

# ためわざ「らせんの かぜ」: 打ち出し「ゴッ」→ 回る 風の ドリル（1 秒 前へ）＋ 地面の 土を 吹き飛ばす ザザザ → 風が ほどける 余韻
def spiral(rng):
    T = 1.05; tail = 0.7; n = N(T + tail); t = np.arange(n) / SR
    out = np.zeros(n + N(0.1))
    # 打ち出し: 下から 上へ 走る 風 ＋ やわらかい 低い 押し
    m = N(0.22); tt = np.arange(m) / m
    w = svf_bp(rng.standard_normal(m), 300 * (2000 / 300) ** tt, 2.5); w /= np.abs(w).max()
    add(out, w * np.minimum(1, tt / 0.15) * np.exp(-tt * 3), 0.0, 0.7)
    m2 = N(0.35); t2 = np.arange(m2) / SR
    push = np.sin(2 * np.pi * np.cumsum(90 * (55 / 90) ** (t2 / 0.35)) / SR) * np.minimum(1, t2 / 0.012) * np.exp(-t2 / 0.12)
    add(out, push, 0.0, 0.45)
    # ドリル: 回る 風（2 本の らせん ＝ 少し ちがう 高さで 逆の 位相）。だんだん 遠く・少し 低く
    env = np.minimum(1, t / 0.06) * np.where(t < T, 1 - 0.35 * t / T, (1 - 0.35) * np.exp(-(t - T) / 0.22))
    rot = np.cumsum(np.interp(t, [0, T, T + tail], [24, 17, 12])) / SR
    for k, (f0, f1, ph) in enumerate([(1250, 820, 0.0), (900, 600, np.pi)]):
        fc = np.interp(t, [0, 0.15, T, T + tail], [f0 * 0.7, f0, f1, f1 * 0.8])
        y = svf_bp(rng.standard_normal(n), fc, 4.0); y /= np.abs(y).max()
        add(out, y * (0.5 + 0.5 * np.sin(2 * np.pi * rot + ph)) * env, 0.0, 0.55)
    # 胴（低い 風の かたまり）
    b = lp(svf_bp(rng.standard_normal(n), 220, 1.2), 500); b /= np.abs(b).max()
    add(out, b * env, 0.0, 0.40)
    # 地面の 土: 小さな 土の 粒（帯域 0.5〜1.2 kHz、10〜25ms）が とぶ 間 ずっと ザザザ（だんだん 少なく）＋ 低い ゴロゴロ
    tg = 0.06
    while tg < T + 0.2:
        rate = np.interp(tg, [0, T, T + 0.2], [55, 35, 5]); tg += rng.exponential(1 / rate)
        d = rng.uniform(0.010, 0.025); g = svf_bp(rng.standard_normal(N(d)), rng.uniform(500, 1200), 1.5)
        add(out, fade(g / np.abs(g).max(), 0.002, d * 0.6), tg, 0.30 * rng.uniform(0.5, 1.0) * np.interp(tg, [0, T, T + 0.2], [1, 0.7, 0.2]))
    rr = lp(lp(rng.standard_normal(n), 140), 140); rr /= np.abs(rr).max()
    add(out, rr * env * np.interp(t, [0, 0.1, T, T + tail], [0, 1, 0.8, 0]), 0.0, 0.5)
    return fade(lp(lp(out, 3800), 3800), 0.003, 0.15)

GAIN2 = {'wind': 0.38, 'thunder': 0.20, 'spiral': 0.27}
if __name__ == '__main__':
    out = sys.argv[1]; rng = np.random.default_rng(21)
    sw = np.zeros(N(2.6)); st = np.zeros(N(2.6))
    for i, v in enumerate(WIND2): add(sw, wind_blade(v, rng) * GAIN2['wind'], 0.15 + 0.8 * i)
    for i, v in enumerate(THUNDER2): add(st, thunder2(v, rng) * GAIN2['thunder'], 0.15 + 0.8 * i)
    write(f'{out}/atk2_windWave_x3.wav', sw); write(f'{out}/atk2_thunderSlash_x3.wav', st)
    sp = np.zeros(N(2.2)); add(sp, spiral(rng) * GAIN2['spiral'], 0.1); write(f'{out}/spiralWind.wav', sp)
