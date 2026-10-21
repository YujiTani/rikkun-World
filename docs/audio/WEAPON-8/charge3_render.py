# WEAPON-8 ため音 3 回目: 最初から 作り直し（オーナー「チャージオン自体最初からつくりなおしましょう！ これまでとは違う感じに」2026-10-21）。
# 楽器の メロディ（鈴・鉄琴・オカリナ・チャイム・五音）を やめ、合成だけ。いっぱいは「音が かわって ループに 入る」ことで 分かる 作り（別の 決め音に たよらない）。
# 4 案 × 風神剣・雷神剣の 味（render.py の 風・ばちばちの 層 ＝ オーナーが「いいかんじ」と 言った 物）。
# 使い方: python3 charge3_render.py <素材の .f32 の フォルダ（render.py が 読む。この 4 案は 使わない）> <出す フォルダ>
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
from lufs import kw, lufs_int
from render import N, fade, add, svf_bp, onepole_lp as lp, loopify
SR = 48000
T = 1.0

def osc(freq, harm=((1, 1.0), (2, 0.25), (3, 0.12), (4, 0.05)), ph0=0.0):  # やわらかい 倍音の 音（四角い波は 使わない）
    ph = 2 * np.pi * np.cumsum(freq) / SR + ph0
    return sum(g * np.sin(k * ph) for k, g in harm)

# ① うなりが ぐんぐん 上がる（ロックマン型・やわらかい シンセ）
def p1_unari(rng):
    n = N(T); t = np.arange(n) / SR; u = t / T
    f = 140 * (560 / 140) ** (u ** 1.3)                       # 140 → 560 Hz（2 オクターブ）
    vib = 1 + 0.012 * np.sin(2 * np.pi * np.cumsum(4 + 10 * u) / SR)
    a = osc(f * vib) + 0.6 * osc(f * vib * 1.004, ph0=1.0)     # 少し ずらした 2 本で 厚く
    a = lp(a, 900) * 0.6 + lp(a, 2400) * 0.4 * u              # だんだん 明るく
    ch = fade(a * (0.25 + 0.75 * u ** 1.2), 0.03, 0.01)
    # いっぱい: 560 → 840 Hz へ ひゅっと 1 段 上がって（60 ms）ループへ。決め音は 足さない
    m = N(0.5); tt = np.arange(m) / SR
    fr = np.where(tt < 0.06, 560 * (840 / 560) ** (tt / 0.06), 840)
    rd = fade(lp(osc(fr) + 0.5 * osc(fr * 1.5), 2400) * np.exp(-tt / 0.25) * 0.5, 0.004, 0.2)
    L = 1.5; m = N(L + 0.3); tt = np.arange(m) / SR
    trem = 0.65 + 0.35 * np.sin(2 * np.pi * 12 * tt)          # 「わわわわ」（12 回/秒。ループの 長さで 割りきれる）
    lpx = lp(osc(np.full(m, 840.0)) + 0.45 * osc(np.full(m, 1260.0), ph0=0.5), 2200) * trem * 0.55
    return ch, rd, loopify(lpx, 0.3)

# ② 風が うずを 巻いて 吸いこまれる（音程 なし。攻撃音の 仲間）
def p2_uzu(rng):
    n = N(T); t = np.arange(n) / SR; u = t / T
    rot = np.cumsum(3 + 19 * u ** 1.2) / SR                    # 回る 速さ 3 → 22 回/秒
    out = np.zeros(n)
    for f0, f1, ph in [(320, 1500, 0.0), (240, 1100, np.pi)]:
        y = svf_bp(rng.standard_normal(n), f0 * (f1 / f0) ** u, 1.8 + 4.5 * u); y /= np.abs(y).max()
        out += y * (0.5 + 0.5 * np.sin(2 * np.pi * rot + ph))
    b = lp(svf_bp(rng.standard_normal(n), 200, 1.2), 450); b /= np.abs(b).max()
    ch = fade((out * 0.6 + b * 0.35 * u) * (0.2 + 0.8 * u ** 1.5), 0.08, 0.01)
    # いっぱい: うずが 閉じる「ふぉっ」（低い 胴が 入る）。ループは 回る 速さが そろった 一定の うず
    m = N(0.4); tt = np.arange(m) / SR
    puff = lp(svf_bp(rng.standard_normal(m), 600 * (300 / 600) ** (tt / 0.4), 2.0), 1200); puff /= np.abs(puff).max()
    rd = fade(puff * np.minimum(1, tt / 0.02) * np.exp(-tt / 0.1) * 0.55, 0.004, 0.1)
    L = 1.5; m = N(L + 0.3); tt = np.arange(m) / SR
    lpx = np.zeros(m)
    for fc, ph in [(1150, 0.0), (850, np.pi)]:
        y = svf_bp(rng.standard_normal(m), fc + 120 * np.sin(2 * np.pi * tt * 2 / (L + 0.3)), 5.0); y /= np.abs(y).max()
        lpx += y * (0.5 + 0.5 * np.sin(2 * np.pi * 22 * tt + ph))
    bb = lp(svf_bp(rng.standard_normal(m), 200, 1.2), 450); bb /= np.abs(bb).max()
    return ch, rd, loopify((lpx * 0.4 + bb * 0.25) * 0.7, 0.3)

# ③ 低い「ゴゴゴ」が 力を ためて、いっぱいで「ドゥン」と 一段 かわる
def p3_gogogo(rng):
    n = N(T); t = np.arange(n) / SR; u = t / T
    f = 80 * (160 / 80) ** u                                   # 80 → 160 Hz（ノートの スピーカーでも 倍音で 聞こえる）
    hum = osc(f, ((1, 1.0), (2, 0.6), (3, 0.35), (4, 0.2), (5, 0.1)))
    g = lp(lp(rng.standard_normal(n), 260), 260); g /= np.abs(g).max()
    grit = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(9 + 9 * u) / SR)   # ゴゴゴの つぶ
    ch = fade((lp(hum, 700) * 0.6 + g * 0.6) * grit * (0.25 + 0.75 * u ** 1.3), 0.06, 0.01)
    # いっぱい: やわらかい「ドゥン」（120→70 Hz、0.4 秒）→ 1 段 上の 明るい うなり（240 Hz ＋ 5 度）に かわる
    m = N(0.45); tt = np.arange(m) / SR
    dn = osc(120 * (70 / 120) ** (tt / 0.45), ((1, 1.0), (2, 0.5), (3, 0.2))) * np.minimum(1, tt / 0.01) * np.exp(-tt / 0.13)
    rd = fade(lp(dn, 900) * 0.9, 0.004, 0.1)
    L = 1.5; m = N(L + 0.3); tt = np.arange(m) / SR
    h2 = osc(np.full(m, 240.0), ((1, 1.0), (2, 0.4), (3, 0.15))) + 0.5 * osc(np.full(m, 360.0), ((1, 1.0), (2, 0.3)))
    gg = lp(lp(rng.standard_normal(m), 300), 300); gg /= np.abs(gg).max()
    lpx = (lp(h2, 1200) * 0.35 + gg * 0.3) * (0.75 + 0.25 * np.sin(2 * np.pi * 8 * tt))
    return ch, rd, loopify(lpx, 0.3)

# ④ こどう「トクン…トクトク」が 速く なり、いっぱいで あたたかい 光の うなりに かわる
def beat(f=95, g=1.0):
    m = N(0.16); tt = np.arange(m) / SR
    s = osc(f * (0.7 + 0.3 * np.exp(-tt / 0.03)), ((1, 1.0), (2, 0.35), (3, 0.1))) * np.minimum(1, tt / 0.006) * np.exp(-tt / 0.045)
    return fade(lp(s, 800) * g, 0.004, 0.04)
def p4_kodou(rng):
    n = N(T); ch = np.zeros(n + N(0.3)); t = np.arange(n) / SR; u = t / T
    times = [0.0, 0.34, 0.6, 0.78, 0.9, 0.98]                   # 間が つまって いく
    for i, tt in enumerate(times):
        g = 0.55 + 0.45 * i / 5
        add(ch, beat(90 + 8 * i, g), tt); add(ch, beat(110 + 8 * i, g * 0.6), tt + 0.11 - 0.06 * i / 5)
    pad = lp(osc(130 * (260 / 130) ** u, ((1, 1.0), (2, 0.3))), 900) * u ** 2 * 0.25   # うしろで あたたかく 上がる
    ch = ch[:n] + pad
    m = N(0.5); tt = np.arange(m) / SR
    rd = fade(lp(osc(np.full(m, 260.0)) + 0.6 * osc(np.full(m, 390.0)) + 0.3 * osc(np.full(m, 520.0)), 1500) * np.exp(-tt / 0.3) * 0.45 * np.minimum(1, tt / 0.01), 0.004, 0.2)
    L = 1.5; m = N(L + 0.3); lpx = np.zeros(m); tt = np.arange(m) / SR
    lpx += lp(osc(np.full(m, 260.0)) + 0.5 * osc(np.full(m, 390.0)), 1300) * (0.8 + 0.2 * np.sin(2 * np.pi * 2 * tt)) * 0.22
    for k in range(int((L + 0.3) * 2) + 1):                    # ゆっくり トクトク（2 回/秒）
        add(lpx, beat(100, 0.45), k * 0.5); add(lpx, beat(120, 0.27), k * 0.5 + 0.1)
    return ch, rd, loopify(lpx, 0.3)

PLANS = [('1_unari', p1_unari), ('2_uzu', p2_uzu), ('3_gogogo', p3_gogogo), ('4_kodou', p4_kodou)]
G = 0.566                       # C・C2 と 同じ 倍率（風・ばちばちの 層の 大きさを 前と 同じに する）
TARGET = -30.0                  # 味 なしの 通しの 大きさ（C2 は -30.3 LUFS。うるさく しない）
if __name__ == '__main__':
    out = sys.argv[2]; R.SOFT['on'] = False
    for name, fn in PLANS:
        x, _ = R.assemble(fn, None, 5)
        k = 10 ** ((TARGET - lufs_int(kw(x * G))) / 20)
        def plan(rng, fn=fn, k=k):
            a, b, c = fn(rng); return a * k, b * k, c * k
        for fl in [None, 'fujin', 'raijin']:
            y, _ = R.assemble(plan, fl, 5)
            R.write(f'{out}/charge3_{name}' + (f'_{fl}' if fl else '') + '.wav', y * G)
