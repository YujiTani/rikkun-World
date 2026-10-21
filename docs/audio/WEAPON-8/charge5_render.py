# WEAPON-8 ため音 5 回目: 決まった「風の うず」＋ オーナー提供の 素材 u1〜u5（「FREE音源撮ってきたのでこの辺使って」2026-10-21）。
# 元素材: オーナー提供 u1〜u5（mp3、出どころ 確認中）。**元の mp3 は リポジトリに 入れない**。ここに 入るのは 加工した 通しの WAV だけ。
# 使い方: python3 charge5_render.py <素材の .f32 の フォルダ（render.py 用）> <u1〜u5 の .f32 の フォルダ> <出す フォルダ>
#   u1〜u5 は ffmpeg -i uN_*.mp3 -ac 1 -ar 48000 -f f32le uN.f32 に して おく。
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
import charge3_render as C3
import charge4_render as C4   # 風神の ため続け -3 dB（T2）も ここで 入る
from lufs import kw, lufs_int
from render import N, fade, add, onepole_lp as lp, loopify
SR = 48000; G = 0.566; T = 1.0
OWN = sys.argv[2] if len(sys.argv) > 2 else '.'
def own(i):
    x = np.fromfile(f'{OWN}/u{i}.f32', np.float32).astype(float); return x / np.abs(x).max()
def seg(x, a, b): return x[N(a):N(b)].copy()
def decay(x, hold, tau):
    t = np.arange(len(x)) / SR; return x * np.exp(-np.maximum(0, t - hold) / tau)

def uzu(rng, k):
    ch, rd, lpx = C3.p2_uzu(rng); return ch * k * 0.8, rd * k * 0.8, lpx * k * 0.8

# X「ドロドロ… ドーン」: u1 の 太鼓の ロール（はじめ 0.5 秒）が ため後半で だんだん 大きく → いっぱいで u1 の「ドーン」（0.7 秒で 止める）
def px_doro(rng, k, g):
    ch, rd, lpx = uzu(rng, k); u1 = own(1)
    roll = seg(u1, 0.0, 0.5); n = len(roll); roll *= np.linspace(0.05, 1.0, n) ** 1.5
    add(ch, fade(lp(roll, 3000), 0.08, 0.02), T - 0.5, 0.12 * g)
    hit = fade(lp(decay(seg(u1, 0.5, 1.3), 0.08, 0.16), 3000), 0.004, 0.2)
    rd = C4.mix(rd, hit * g)
    return ch, rd, lpx

# Y「カカッ」: u3（ふちの 2 打）を いっぱいの 合図に。ためは うずだけ（間）
def py_kaka(rng, k, g):
    ch, rd, lpx = uzu(rng, k)
    kk = fade(lp(lp(own(3), 4500), 4500), 0.002, 0.15)
    return ch, C4.mix(rd, kk * g), lpx

# Z「鈴 → どん」: u5（鈴の しゃらしゃら）が ため中に うすく ふくらみ、いっぱいで u2 の 頭の「どん」（0.5 秒）。ため続けに うすい 鈴
def pz_suzu(rng, k, g):
    ch, rd, lpx = uzu(rng, k); u5 = lp(lp(own(5), 4000), 4000)
    s = seg(u5, 0.05, 1.05); s *= np.linspace(0, 1, len(s)) ** 2
    add(ch, fade(s, 0.1, 0.02), 0.0, 0.12 * g)
    don = fade(lp(decay(seg(own(2), 0.0, 0.6), 0.05, 0.12), 2500), 0.004, 0.15)
    rd = C4.mix(rd, don * g)
    unit = loopify(seg(u5, 0.1, 1.15), 0.3)                    # 0.75 秒で 切れ目 なく まわる 鈴（ループ 1.5 秒の ちょうど 半分）
    ring = np.tile(unit, int(np.ceil(len(lpx) / len(unit))))[:len(lpx)]
    lpx = lpx + ring * 0.10 * g
    return ch, rd, lpx

PLANS = [('x_doro-doon', px_doro), ('y_kaka', py_kaka), ('z_suzu-don', pz_suzu)]
TARGET_T1 = 3.5   # いっぱい 0.3 秒が ための おわり 0.3 秒より +3.5 dB（風神の 味つきで 測る）
PEAK_MAX = -6.0

def measure(y):
    k = kw(y); L = lambda a, b: -0.691 + 10 * np.log10(np.mean(k[N(a):N(b)] ** 2))
    return L(1.15, 1.45) - L(0.85, 1.15), 20 * np.log10(np.abs(y).max())

if __name__ == '__main__':
    out = sys.argv[3]; R.SOFT['on'] = False
    x, _ = R.assemble(C3.p2_uzu, None, 5); k_uzu = 10 ** ((-30.0 - lufs_int(kw(x * G))) / 20)
    for name, fn in PLANS:
        g = 0.3
        for _ in range(4):   # 合図の 大きさを T1 に 合わせる（ピークは 上限まで）
            y, _ = R.assemble(lambda rng: fn(rng, k_uzu, g), 'fujin', 5); t1, pk = measure(y * G)
            g *= 10 ** ((TARGET_T1 - t1) / 20 / 1.3); 
            if pk > PEAK_MAX: g *= 10 ** ((PEAK_MAX - pk) / 20)
        for fl in ['fujin', 'raijin']:
            y, _ = R.assemble(lambda rng: fn(rng, k_uzu, g), fl, 5)
            R.write(f'{out}/charge5_{name}_{fl}.wav', y * G)
        print(name, 'g %.3f' % g)
