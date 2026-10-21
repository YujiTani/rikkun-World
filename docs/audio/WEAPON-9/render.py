# WEAPON-9 虹（にじ）の 音の 3 案（試聴用）。中心は にじの 斬撃（3 段攻撃の 1・2・3 段）と 弾を かき消す 音。
# ほかに shiningStart・shiningHit・shiningEnd・shiningReady を 各案 1 つずつ。
# 作り: 本物の 楽器の 録音（VCSL、CC0。sources.txt）を 切る・音程を 変える・響きを 足す ＋ 刃の 風（合成）。
# オーナーの 見本（on-jin）は 聞いて「シャキン と 何回も 切りきざむ」の 性格だけ 決めた。切り出し・まねは して いない。
# 使い方: python3 -I render.py <VCSL を 48kHz モノラルに した フォルダ> <出す フォルダ>
#   （sources.txt の URL から とって、`ffmpeg -i x.wav -ac 1 -ar 48000 -c:a pcm_s16le <名前>.wav` で 名前を そろえる）
# 大きさは WEAPON-8 と 同じ ゲームの ものさし（はじめの 設定・リミッターの 前）。TARGET の 400ms の 大きさに そろえる。
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def midi(n):
    s = n.replace('s', '#'); k = NOTE[s[0]] + (1 if '#' in s else 0); return 12 * (int(s[-1]) + 1) + k
# ハ長調の 五音（ド レ ミ ソ ラ）。BGM の 和音に 合わせて 鳴らす ときは ド を 根音に して 動かす（SOUND.md §6）
PENTA = ['C', 'D', 'E', 'G', 'A']
def penta(i, octave):
    return PENTA[i % 5] + str(octave + i // 5)

class Kit:
    def __init__(self, sm): self.s = sm
    def pitched(self, family, have, note, dur=None, start=0.0):
        """have の 中で いちばん 近い 録音を えらび、note の 高さに する"""
        # VCSL の 名前は 1 オクターブ 下の 書き方（ファイルの 名前 C5 が 鳴ると C6 = 1047 Hz）。はかって たしかめた
        m = midi(note); real = lambda h: midi(h) + 12; best = min(have, key=lambda h: abs(real(h) - m))
        st = m - real(best)
        return pitch(self.s(f'{family}__{best}', start, None if dur is None else dur * 2 ** (st / 12) + 0.01), st)[:None if dur is None else N(dur)]
    def glock(self, note, dur=1.2): return fade(self.pitched('glockenspiel', ['G4', 'C5', 'G5', 'C6', 'G6', 'C7'], note, dur), 0.001, dur * 0.5)
    def chime(self, note, dur=2.5): return fade(self.pitched('handchimes', ['C4', 'E4', 'Gs4', 'C5', 'D5', 'E5', 'Gs5', 'C6'], note, dur), 0.002, dur * 0.5)
    def bell(self, note, dur=1.5): return fade(self.pitched('belltree', ['C5', 'D5', 'E5', 'Fs5', 'Gs5', 'As5'], note, dur), 0.001, dur * 0.5)
    def glass(self, note, dur=2.0, start=0.0): return self.pitched('wineglass', ['Ds4', 'Fs4', 'As4', 'D5'], note, dur, start)
    def vibe(self, note, dur=2.5, start=0.3): return self.pitched('vibraphone_bowed', ['G3', 'D4', 'A4', 'E5'], note, dur, start)

def kin_comb(rng, note, dur=0.3, fb=0.93):
    """刃が 鳴る「シャリン」: ノイズを 音の 高さの くし形フィルタに 通す（はがねの 鳴り）。3 kHz より 上は おさえて 1 つめの 鳴りを 主に（耳に ささらない）"""
    f = 440 * 2 ** ((midi(note) - 69) / 12); d = SR / f; n = N(dur)
    x = rng.standard_normal(n) * env_exp(n, 0.001, 0.006); y = np.zeros(n)
    di = int(d); fr = d - di
    for i in range(n):
        a = y[i - di] if i >= di else 0.0; b = y[i - di - 1] if i > di else 0.0
        y[i] = x[i] + fb * ((1 - fr) * a + fr * b)
    y = lp(lp(hp(y, 500), 3000), 3000); y /= np.abs(y).max(); return fade(y * env_exp(n, 0.001, dur * 0.3), 0.001, dur * 0.4)

# ================================================================ 案 A「にじの すず刃」
# 刃の 風「シャッ」＋ 鉄琴（グロッケン）の「キン」。段ごとに 鉄琴の 音が 1・2・4 と ふえて、高く なる。3 段目は ウィンドチャイムが キラキラ。
def A_slash(k, rng, stage, v):
    out = np.zeros(N(2.0)); sh = [0, 1, -1][v % 3]  # 毎回 ちがう 高さ（3 とおり）
    if stage == 1:
        add(out, swish(rng, 0.10, 2600, 6200, q=2.5, a=0.003), 0.0, 0.8)
        add(out, k.glock(penta(2 + sh, 6), 0.9), 0.035, 0.55)
    elif stage == 2:
        add(out, swish(rng, 0.16, 1800, 6500, q=2.5, a=0.004, curve=0.6), 0.0, 0.8)
        for j, deg in enumerate([3, 4]): add(out, k.glock(penta(deg + sh, 6), 0.9), 0.05 + 0.07 * j, 0.5)
    else:
        add(out, swish(rng, 0.24, 5200, 1700, q=2.0, a=0.005, curve=0.8), 0.0, 0.85)
        for j, deg in enumerate([5, 6, 7, 8]):
            add(out, swish(rng, 0.06, 3500, 7000, q=3.0, a=0.002), 0.04 + 0.055 * j, 0.35)
            add(out, k.glock(penta(deg + sh, 6), 1.0), 0.05 + 0.055 * j, 0.42 - 0.03 * j)
        add(out, fade(k.s('marktrees__2', 0.15, 0.8), 0.04, 0.4), 0.10, 0.35)
    return finish(hall(lp(out, 9000), 0.9, 0.18), 0.002, 0.3)

def A_erase(k, rng, v):
    """弾を かき消す「シュワッ… キラ」: 下がって とける 風 ＋ 小さな シンバル（フィンガーシンバル）の 光"""
    out = np.zeros(N(1.2)); sh = [0, 2, -2][v % 3]
    add(out, swish(rng, 0.28, 6500, 1400, q=1.8, a=0.006, curve=0.5), 0.0, 0.7)
    add(out, fade(pitch(k.s('fingercymbal__0', 0, 0.9), 5 + sh), 0.002, 0.4), 0.02, 0.35)
    add(out, k.bell(penta(4 + sh // 2, 6), 0.5), 0.09, 0.22)
    return finish(hall(out, 0.8, 0.2), 0.004, 0.25)

def A_start(k, rng):
    """シャイニング はじまり: ウィンドチャイムが のぼり、鉄琴が ド ミ ソ ド ミ と 上がる（うかぶ 0.67 秒）＋ 弓で ひいた ビブラフォンの 和音が ふわっと"""
    out = np.zeros(N(3.6))
    add(out, fade(k.s('marktrees__0', 0, 2.2), 0.05, 1.0), 0.0, 0.55)
    for j, nt in enumerate(['C6', 'E6', 'G6', 'C7', 'E7']): add(out, k.glock(nt, 1.6), 0.08 + 0.14 * j, 0.40)
    pad = sum(fade(k.vibe(nt, 2.8), 0.35, 1.2) for nt in ['C4', 'E4', 'G4']) / 3
    add(out, pad, 0.05, 0.75)
    return finish(hall(out, 1.6, 0.3), 0.01, 0.6)

def A_hit(k, rng, v):
    """ドームが 妖怪を はじく「ティン」: トライアングル（小さく）＋ やわらかい「ぽん」"""
    out = np.zeros(N(0.7)); sh = [0, 3, -2][v % 3]
    add(out, fade(pitch(k.s(f'triangles__{v % 4}', 0, 0.5), sh), 0.001, 0.3), 0.0, 0.5)
    add(out, sine(330, 190, 0.18, a=0.004, tau=0.06), 0.0, 0.4)
    return finish(hall(out, 0.6, 0.15), 0.002, 0.2)

def A_end(k, rng):
    """シャイニング おわり: ウィンドチャイムが 下りて、鉄琴が ソ ミ ド と 小さく おりる"""
    out = np.zeros(N(2.6))
    add(out, fade(k.s('marktrees__1', 0, 1.6), 0.05, 0.9), 0.0, 0.45)
    for j, nt in enumerate(['G6', 'E6', 'C6']): add(out, k.glock(nt, 1.3), 0.1 + 0.2 * j, 0.30 - 0.04 * j)
    return finish(hall(out, 1.4, 0.3), 0.01, 0.6)

def A_ready(k, rng):
    """休みが あけた「ティロン」: 鉄琴 ソ → 高い ド ＋ ベルツリーの つぶ"""
    out = np.zeros(N(1.6))
    add(out, k.glock('G6', 1.2), 0.0, 0.45); add(out, k.glock('C7', 1.3), 0.11, 0.5)
    add(out, k.bell('E5', 0.9), 0.16, 0.2)
    return finish(hall(out, 1.0, 0.22), 0.002, 0.4)

# ================================================================ 案 B「はがねの にじ」
# 見本に いちばん 近い: 鋭い「シャッ」＋ 金床（アンビル）の「キィン」＋ はがねの「シャリン」。
# 段ごとに 切る 数が 2・3・6 と ふえる（切りきざむ）。3 段目の おわりに ハンドチャイムの 和音が うすく 光る（にじ）。
def B_cut(k, rng, note, g=1.0, long=False):
    out = np.zeros(N(0.8))
    add(out, swish(rng, 0.08 if not long else 0.15, 2000, 6000, q=2.0, a=0.002, curve=0.3), 0.0, 0.75 * g)
    add(out, swish(rng, 0.10 if not long else 0.16, 700, 1600, q=1.5, a=0.004, curve=0.5), 0.0, 0.35 * g)  # 刃の 胴（低めの 風）
    add(out, fade(pitch(k.s(f'anvil__{rng.integers(0, 3)}', 0, 0.4), rng.uniform(-1.0, 1.0)), 0.001, 0.25), 0.02, 0.12 * g)
    add(out, kin_comb(rng, note, 0.35 if long else 0.22), 0.015, 0.5 * g)
    return out

def B_slash(k, rng, stage, v):
    out = np.zeros(N(2.0)); sh = [0, 1, -1][v % 3]
    if stage == 1:
        cuts = [(0.0, 3, 1.0, False), (0.075, 4, 0.6, False)]
    elif stage == 2:
        cuts = [(0.0, 4, 1.0, True), (0.07, 5, 0.65, False), (0.13, 6, 0.55, False)]
    else:
        ts = [0.0, 0.07, 0.13, 0.18, 0.225, 0.265]
        cuts = [(t, 5 + j, 1.0 if j == 0 else 0.62 - 0.04 * j, j == 0) for j, t in enumerate(ts)]
    for t, deg, g, lg in cuts: add(out, B_cut(k, rng, penta(deg + sh, 6), g, lg), t, 1.0)
    if stage == 3:
        for j, nt in enumerate(['C5', 'E5', 'Gs5' if False else 'G5']): add(out, k.chime(nt, 1.2), 0.30 + 0.02 * j, 0.16)
    return finish(hall(lp(lp(out, 8000), 9000), 0.7, 0.14), 0.002, 0.3)

def B_erase(k, rng, v):
    """弾を かき消す「パシュン… シャラ」: 刃で 切る「パシッ」＋ 弓で こすった シンバルが 一しゅん 光って 消える"""
    out = np.zeros(N(1.2)); sh = [0, 2, -2][v % 3]
    add(out, swish(rng, 0.12, 7000, 2200, q=1.6, a=0.003, curve=0.4), 0.0, 0.7)
    cy = pitch(k.s(f'sus_cymbal__{v % 3}', 1.0, 0.8), 4 + sh); add(out, fade(cy * env_exp(len(cy), 0.02, 0.15), 0.02, 0.3), 0.01, 0.55)
    add(out, kin_comb(rng, penta(7 + sh // 2, 6), 0.18), 0.01, 0.25)
    return finish(hall(out, 0.7, 0.16), 0.003, 0.25)

def B_start(k, rng):
    """シャイニング はじまり: 弓の シンバルが ふくらみ、ハンドチャイムが ド ミ ソ ド と のぼり、上で 刀が「キィーン」"""
    out = np.zeros(N(3.8))
    cy = k.s('sus_cymbal__1', 0.5, 2.6); add(out, fade(cy * np.minimum(1, np.arange(len(cy)) / N(0.6)), 0.05, 1.2), 0.0, 0.45)
    for j, nt in enumerate(['C4', 'E4', 'G4', 'C5', 'E5']): add(out, k.chime(nt, 2.6), 0.05 + 0.13 * j, 0.32)
    add(out, B_cut(k, rng, 'C7', 0.6, True), 0.68, 1.0)
    return finish(hall(out, 1.8, 0.3), 0.01, 0.7)

def B_hit(k, rng, v):
    """ドームが はじく「キン」: 金床を 少し 低く した 小さな 音 ＋ 小さな 風"""
    out = np.zeros(N(0.6)); sh = [0, 2, -3][v % 3]
    add(out, fade(pitch(k.s(f'anvil__{v % 3}', 0, 0.35), -3 + sh), 0.001, 0.2), 0.0, 0.5)
    add(out, swish(rng, 0.07, 1500, 3500, q=2.0, a=0.003), 0.0, 0.3)
    add(out, sine(260, 160, 0.14, a=0.004, tau=0.05), 0.0, 0.35)
    return finish(hall(out, 0.5, 0.12), 0.002, 0.2)

def B_end(k, rng):
    """シャイニング おわり: 刀を おさめる「チャキッ」＋ ハンドチャイムが ソ ミ ド と おりる"""
    out = np.zeros(N(3.0))
    for j, nt in enumerate(['G5', 'E5', 'C5']): add(out, k.chime(nt, 2.0), 0.0 + 0.22 * j, 0.32 - 0.03 * j)
    add(out, fade(pitch(k.s('anvil__3', 0, 0.12), 2), 0.001, 0.06), 0.78, 0.25)
    add(out, fade(pitch(k.s('anvil__3', 0, 0.1), 5), 0.001, 0.05), 0.83, 0.18)
    return finish(hall(out, 1.4, 0.28), 0.01, 0.6)

def B_ready(k, rng):
    """休みが あけた「シャキーン」: 小さく 刃を ぬく 音 ＋ 高い ド の ハンドチャイム"""
    out = np.zeros(N(2.0))
    add(out, B_cut(k, rng, 'G6', 0.55, True), 0.0, 1.0); add(out, k.chime('C6', 1.5), 0.05, 0.35)
    return finish(hall(out, 1.0, 0.22), 0.002, 0.5)

# ================================================================ 案 C「ひかりの オルゴール」
# いちばん やさしい: やわらかい 風「ひゅん」＋ ハンドチャイム・鉄琴の まるい 音。段ごとに ド → ミソ → 高い ド ＋ ベルツリーの キラキラ。
def C_slash(k, rng, stage, v):
    out = np.zeros(N(2.2)); sh = [0, 1, -1][v % 3]
    if stage == 1:
        add(out, lp(swish(rng, 0.13, 1300, 3600, q=2.2, a=0.006), 5000), 0.0, 0.8)
        add(out, k.chime(penta(0 + sh, 6), 1.0), 0.04, 0.45)
    elif stage == 2:
        add(out, lp(swish(rng, 0.17, 1100, 4000, q=2.2, a=0.006, curve=0.6), 5000), 0.0, 0.8)
        add(out, k.chime(penta(2 + sh, 6), 1.0), 0.05, 0.38); add(out, k.glock(penta(3 + sh, 6), 0.8), 0.11, 0.3)
    else:
        add(out, lp(swish(rng, 0.26, 4200, 1300, q=2.0, a=0.008, curve=0.8), 5000), 0.0, 0.85)
        for j, deg in enumerate([5, 7, 8, 10]): add(out, k.bell(penta(deg + sh - 5, 5), 0.7), 0.05 + 0.06 * j, 0.25)
        add(out, k.chime(penta(5 + sh, 6), 1.4), 0.07, 0.42); add(out, k.glock(penta(7 + sh, 6), 1.2), 0.25, 0.3)
    return finish(hall(lp(out, 8000), 1.0, 0.22), 0.002, 0.35)

def C_erase(k, rng, v):
    """弾を かき消す「ぽわん…」: 上がる やわらかい 音（しゃぼん玉が はじける）＋ ワイングラスの 鳴りが すっと 消える"""
    out = np.zeros(N(1.4)); sh = [0, 2, -2][v % 3]
    add(out, sine(520 * 2 ** (sh / 12), 1500 * 2 ** (sh / 12), 0.16, a=0.006, tau=0.07), 0.0, 0.5)
    gl = k.glass(penta(7 + sh // 2, 4), 0.7, start=0.6); add(out, fade(gl * env_exp(len(gl), 0.03, 0.2), 0.03, 0.3), 0.02, 0.6)
    add(out, lp(swish(rng, 0.18, 3000, 900, q=1.5, a=0.008), 4000), 0.0, 0.3)
    return finish(hall(out, 1.0, 0.25), 0.004, 0.3)

def C_start(k, rng):
    """シャイニング はじまり: ワイングラスの 和音（ド ミ ソ）が ふわっと ふくらみ、ベルツリーが のぼる"""
    out = np.zeros(N(3.8))
    for nt, g in [('C5', 0.4), ('G4', 0.35), ('E5', 0.3)]:
        gl = k.glass(nt, 2.8, start=0.4); add(out, fade(gl, 0.3, 1.2), 0.0, g)
    for j, deg in enumerate(range(0, 7)): add(out, k.bell(penta(deg, 5), 1.0), 0.06 + 0.09 * j, 0.24)
    add(out, k.chime('C6', 2.0), 0.68, 0.35)
    return finish(hall(out, 1.8, 0.32), 0.01, 0.7)

def C_hit(k, rng, v):
    """ドームが はじく「ぽよん」: はずむ 音 ＋ 小さな 鉄琴"""
    out = np.zeros(N(0.7)); sh = [0, 3, -2][v % 3]
    n = N(0.2); t = np.arange(n) / SR; f = 260 * 2 ** (sh / 12) * (1 + 0.8 * np.sin(np.pi * np.minimum(1, t / 0.2)))
    add(out, fade(np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.006, 0.07), 0.006, 0.05), 0.0, 0.45)
    add(out, k.glock(penta(4 + sh // 3, 6), 0.4), 0.03, 0.22)
    return finish(hall(out, 0.6, 0.15), 0.004, 0.2)

def C_end(k, rng):
    """シャイニング おわり: グラスの 和音が すうっと 小さく なり、ベルツリーが おりる"""
    out = np.zeros(N(3.0))
    for nt, g in [('G4', 0.3), ('C5', 0.3)]:
        gl = k.glass(nt, 1.8, start=1.0); add(out, fade(gl, 0.05, 1.2), 0.0, g)
    for j, deg in enumerate(range(6, 0, -1)): add(out, k.bell(penta(deg, 5), 0.8), 0.05 + 0.09 * j, 0.2)
    return finish(hall(out, 1.4, 0.3), 0.02, 0.8)

def C_ready(k, rng):
    """休みが あけた「ポロン」: ハンドチャイム ソ → ド"""
    out = np.zeros(N(2.0))
    add(out, k.chime('G5', 1.4), 0.0, 0.4); add(out, k.chime('C6', 1.5), 0.12, 0.45)
    return finish(hall(out, 1.0, 0.22), 0.004, 0.5)

OPTIONS = {
    'A': ('nijisuzu', A_slash, A_erase, A_start, A_hit, A_end, A_ready),
    'B': ('hagane', B_slash, B_erase, B_start, B_hit, B_end, B_ready),
    'C': ('orgel', C_slash, C_erase, C_start, C_hit, C_end, C_ready),
}
# 400ms の 大きさ（K 重み・LUFS）の めやす。今の pickup -27.8・chargeReady -28.6・WEAPON-8 の thunderSlash 2 版 -31.8・spiralWind -26.5
TARGET = {'slash1': -31.0, 'slash2': -30.5, 'slash3': -29.5, 'erase': -32.0, 'start': -26.5, 'hit': -34.0, 'end': -30.0, 'ready': -29.0}
COMBO_T = [0.0, 0.53, 1.12]  # 3 段攻撃の 当たりの 秒（つき → きりあげ → けさ。bladeCombo の stepStartup・follow から）

def level(x, target):
    m = measure(x)['m400']; return x * 10 ** ((target - m) / 20)

def pad(x, pre=0.1, post=0.15):
    b = np.zeros(N(pre) + len(x) + N(post)); add(b, x, pre); return b

def trim(x, floor_db=-70):
    a = np.abs(x); idx = np.nonzero(a > 10 ** (floor_db / 20))[0]
    return x[: idx[-1] + N(0.02)] if len(idx) else x

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
    k = Kit(Samples(src))
    for key, (name, slash, erase, start, hit, end, ready) in OPTIONS.items():
        rng = np.random.default_rng({'A': 91, 'B': 92, 'C': 93}[key]); pre = f'{out}/{key}_{name}'
        # 1 段ずつ（高さの ちがう 3 とおりの 1 つめ）。大きさは 段ごとの めやすに 1 つずつ そろえる
        combo = np.zeros(N(4.6))
        for s in (1, 2, 3):
            vs = [trim(level(slash(k, rng, s, v), TARGET[f'slash{s}'])) for v in range(3)]  # 3 とおり とも 同じ 大きさ
            write(f'{pre}_slash{s}.wav', pad(vs[0]))
            add(combo, vs[0], 0.15 + COMBO_T[s - 1]); add(combo, vs[(s % 2) + 1], 2.35 + COMBO_T[s - 1])  # 2 回目は ちがう 高さ
        write(f'{pre}_slash_combo.wav', trim(combo))
        es = [level(erase(k, rng, v), TARGET['erase']) for v in range(3)]; g = 1.0
        seq = np.zeros(N(2.4))
        for j, x in enumerate(es): add(seq, x * g, 0.1 + 0.55 * j)  # 火の玉が 3 つ つづけて 消える
        write(f'{pre}_erase_x3.wav', trim(seq))
        write(f'{pre}_shiningStart.wav', pad(trim(level(start(k, rng), TARGET['start']))))
        hs = [level(hit(k, rng, v), TARGET['hit']) for v in range(3)]; g = 1.0
        seq = np.zeros(N(2.6))
        for j, x in enumerate(hs): add(seq, x * g, 0.1 + 0.8 * j)
        write(f'{pre}_shiningHit_x3.wav', trim(seq))
        write(f'{pre}_shiningEnd.wav', pad(trim(level(end(k, rng), TARGET['end']))))
        write(f'{pre}_shiningReady.wav', pad(trim(level(ready(k, rng), TARGET['ready']))))
        print('done', key)
