# WEAPON-8 ため音 4 回目: 決まった「② 風の うず」を 土台に 和風に した 3 案（オーナー「チャージ音は和風で、このおとのはじまりのかんじでどう？」2026-10-21。見本の 曲は 使わない）。
# (a) 尺八の 息 (b) 篠笛の 短い のぼり (c) 琴の かき鳴らし。音階は 都節（ド レ♭ ファ ソ ラ♭）、根音 C（ゲームで 和音に 合わせて 動かす）。
# audio-reviewer 軽微: T1 いっぱいの 変わり目に +2〜3 dB の 山 / T2 風神の ため続けを 少し 下げる（-3 dB）。
# 素材: 琴 = VCSL Dan Tranh（ベトナムの 琴、CC0）`Chordophones/Zithers/Dan Tranh/Normal/D#3_mf_1.wav` → tranh_Ds3.f32（実音 312 Hz）。尺八・篠笛は 合成。
# 使い方: python3 charge4_render.py <素材の .f32 の フォルダ> <出す フォルダ>
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
import charge3_render as C3
from lufs import kw, lufs_int
from render import N, fade, add, svf_bp, onepole_lp as lp, loopify, resample, seg, hz
SR = 48000; T = 1.0
R.SMP['tranh'] = R.load('tranh_Ds3'); TR_F0 = 312.0
def miya(semi): return hz('C4') * 2 ** (semi / 12)       # C4 から 半音
SC = [0, 1, 5, 7, 8]                                      # 都節
def deg(i): return 12 * (i // 5) + SC[i % 5]

# T2: 風神の ため続けを -3 dB
_orig_loop = R.flavor_loop
def _loop(kind, L, rng):
    y = _orig_loop(kind, L, rng); return y * (10 ** (-3 / 20) if kind == 'fujin' else 1.0)
R.flavor_loop = _loop

def mix(a, b):
    n = max(len(a), len(b)); o = np.zeros(n); o[:len(a)] += a; o[:len(b)] += b; return o

def uzu(rng, k):  # charge3 ② を そのまま（和の 音を のせる ため 少し 下げる）
    ch, rd, lpx = C3.p2_uzu(rng); return ch * k * 0.75, rd * k * 0.75, lpx * k * 0.75

def flute(freq, breath, amp, brightness=2600, rng=None):  # 竹の 笛（息の 多い やわらかい 音）
    n = len(freq); ph = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph)
    w = rng.standard_normal(n)
    b = svf_bp(w, freq, 6.0); b /= np.abs(b).max() + 1e-9
    air = svf_bp(w[::-1].copy(), 1400, 0.9); air /= np.abs(air).max() + 1e-9
    return lp(lp(tone * amp * (1 - 0.6 * breath) + (b * 0.9 + air * 0.5) * amp * breath, brightness), brightness)

def glide(points, n):  # [(時刻, Hz)] を なめらかに つなぐ
    t = np.arange(n) / SR; ts, fs = zip(*points)
    return np.exp(np.interp(t, ts, np.log(fs)))

def pa_shaku(rng, k):  # (a) 尺八の 息「ふぉぉ…」が うずに 乗って 上がる
    ch, rd, lpx = uzu(rng, k)
    n = N(T); t = np.arange(n) / SR; u = t / T
    f = glide([(0, miya(5) * 0.94), (0.3, miya(5)), (0.55, miya(5)), (0.8, miya(7)), (1.0, miya(12))], n)   # メリ → ファ → ソ → ド
    amp = np.interp(t, [0, 0.25, 0.5, 0.7, 1.0], [0.0, 0.35, 0.3, 0.55, 0.8])
    br = np.interp(t, [0, 0.3, 1.0], [0.95, 0.55, 0.4])        # 始めは 息だけ「ふぉぉ」
    ch = ch + fade(flute(f, br, amp, rng=rng), 0.05, 0.01) * 0.30
    # いっぱい: むら息の「ふっ」と 1 段 上の ソ（T1: ためより 明るく +2〜3 dB の 山）
    m = N(0.6); tt = np.arange(m) / SR
    f2 = glide([(0, miya(12)), (0.05, miya(19)), (0.6, miya(19))], m)
    burst = flute(f2, np.interp(tt, [0, 0.06, 0.2], [0.9, 0.5, 0.35]), np.interp(tt, [0, 0.04, 0.3, 0.6], [0.0, 1.0, 0.7, 0.55]), 3000, rng)
    rd = mix(rd, fade(burst, 0.004, 0.1) * 0.36)
    L = len(lpx) / SR + 0.3; m = N(L); tt = np.arange(m) / SR
    yuri = 1 + 0.008 * np.sin(2 * np.pi * 5 * tt)               # ゆり（ゆっくり ゆれる）
    hold = flute(miya(19) * yuri, 0.4 + 0.1 * np.sin(2 * np.pi * tt / L), np.full(m, 0.5), 2600, rng)
    lpx = lpx + loopify(hold, 0.3)[:len(lpx)] * 0.16
    return ch, rd, lpx

def pb_shino(rng, k):  # (b) 篠笛の 短い のぼり ＋ うず（間を あけて 3 回 のぼる）
    ch, rd, lpx = uzu(rng, k)
    n = N(T); t = np.arange(n) / SR
    pts = [(0, miya(12)), (0.05, miya(17)), (0.3, miya(17)), (0.45, miya(17)), (0.5, miya(19)), (0.72, miya(19)), (0.76, miya(20)), (0.8, miya(24)), (1.0, miya(24))]
    f = glide(pts, n)
    amp = np.interp(t, [0, 0.04, 0.3, 0.4, 0.46, 0.65, 0.72, 0.78, 1.0], [0, 0.5, 0.35, 0.08, 0.5, 0.35, 0.1, 0.6, 0.7])  # 間（ま）
    ch = ch + fade(flute(f, np.full(n, 0.3), amp, 2800, rng), 0.03, 0.01) * 0.26
    # いっぱい: ド ↔ レ♭ の 短い ふるえ（トリル）→ ド を のばす（T1 山）
    m = N(0.6); tt = np.arange(m) / SR
    tr = np.where((tt < 0.18) & (np.floor(tt / 0.03) % 2 == 1), miya(25), miya(24))
    f2 = lp(tr.astype(float), 60)
    rd = mix(rd, fade(flute(f2, np.full(m, 0.28), np.interp(tt, [0, 0.02, 0.25, 0.6], [0, 1.0, 0.75, 0.6]), 3000, rng), 0.004, 0.1) * 0.30)
    L = len(lpx) / SR + 0.3; m = N(L); tt = np.arange(m) / SR
    hold = flute(miya(24) * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * tt)), np.full(m, 0.35), np.full(m, 0.45), 2800, rng)
    lpx = lpx + loopify(hold, 0.3)[:len(lpx)] * 0.10
    return ch, rd, lpx

def koto(semi, dur=1.2):
    x = resample(seg(R.SMP['tranh'], 0.0, dur * 4), miya(semi) / TR_F0)[:N(dur)]
    return fade(lp(lp(x, 3000), 3000), 0.002, dur * 0.5)

def pc_koto(rng, k):  # (c) 琴の かき鳴らし「シャラララ」が 速く・高く → いっぱいで 1 回「しゃらん」
    ch, rd, lpx = uzu(rng, k)
    ch = np.concatenate([ch, np.zeros(N(0.6))])
    times = [0.0, 0.24, 0.42, 0.55, 0.65, 0.73, 0.80]       # 0.8 秒で 止めて 間（ま）→ いっぱいで しゃらん
    for i, tt in enumerate(times):
        add(ch, koto(deg(i)), tt, 0.22 + 0.06 * i / 6)
    ch = ch[:N(T)]
    rd = np.concatenate([rd, np.zeros(max(0, N(1.6) - len(rd)))])
    for i, s in enumerate([deg(5), deg(6), deg(7), deg(8), deg(9), deg(10)]):   # しゃらん（25 ms ずつ）
        add(rd, koto(s, 1.4), 0.01 + i * 0.025, 0.42 - 0.03 * i)
    add(rd, koto(deg(0), 1.5), 0.0, 0.38)                       # 下の ド（余韻）
    m = len(lpx); L = m / SR
    for tt, s, g in [(0.35, deg(8), 0.14), (1.05, deg(7), 0.10)]:   # ため続け: ときどき ぽろん（間）
        x = koto(s, 0.8); seg_end = min(m, N(tt) + len(x)); lpx[N(tt):seg_end] += g * x[:seg_end - N(tt)]
    return ch, rd, lpx

PLANS = [('a_shakuhachi', pa_shaku), ('b_shinobue', pb_shino), ('c_koto', pc_koto)]
G = 0.566; TARGET = -30.0
CUE = 10 ** (4.0 / 20)   # T1: 風神・雷神の 味つきでも いっぱいが ための おわりより +2〜3 dB 上に なるよう 合図ごと 上げる
if __name__ == '__main__':
    out = sys.argv[2]; R.SOFT['on'] = False
    x, _ = R.assemble(C3.p2_uzu, None, 5); k_uzu = 10 ** ((TARGET - lufs_int(kw(x * G))) / 20)
    for name, fn in PLANS:
        cue = CUE
        x, _ = R.assemble(lambda rng, fn=fn, cue=cue: (lambda a, b, c: (a, b * cue, c))(*fn(rng, k_uzu)), None, 5)
        kk = 10 ** ((TARGET - lufs_int(kw(x * G))) / 20)
        def plan(rng, fn=fn, kk=kk, cue=cue):
            a, b, c = fn(rng, k_uzu); return a * kk, b * kk * cue, c * kk
        for fl in [None, 'fujin', 'raijin']:
            y, _ = R.assemble(plan, fl, 5)
            R.write(f'{out}/charge4_{name}' + (f'_{fl}' if fl else '') + '.wav', y * G)
