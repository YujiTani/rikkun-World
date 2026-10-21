# WEAPON-8 攻撃の 音の 作り直し（試聴用）: 風神剣の 真空波 windWave・雷神剣の 斬撃に まざる 雷 thunderSlash。
# ため音 C2 の 風神の 風「ひゅるる」・雷神の「ばちばち」と 同じ 作り（合成だけ）。それぞれ 3 つ（毎回 ちがう 物を えらぶ）。
# 大きさは now_render.py と 同じ ものさし（ゲームの はじめの 設定・リミッターの 前）。使い方: python3 -I attack_render.py <出す フォルダ>
import numpy as np, wave, sys
SR = 48000
def N(t): return int(round(t * SR))
def fade(x, a, r):
    x = x.copy(); na, nr = max(1, min(len(x), N(a))), max(1, min(len(x), N(r)))
    x[:na] *= np.linspace(0, 1, na); x[-nr:] *= np.linspace(1, 0, nr); return x
def add(buf, x, t, g=1.0):
    i = N(t); j = min(len(buf), i + len(x)); buf[i:j] += g * x[:j - i]
def svf_bp(x, fc, q):
    fc = np.broadcast_to(np.asarray(fc, float), x.shape); f = 2 * np.sin(np.pi * np.minimum(fc, SR / 6) / SR); d = 1.0 / q
    lo = bp = 0.0; y = np.empty_like(x)
    for i in range(len(x)):
        hp = x[i] - lo - d * bp; bp += f[i] * hp; lo += f[i] * bp; y[i] = bp
    return y
def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a) * x[i] + a * s; y[i] = s
    return y

# 風神剣の 真空波「ひゅるっ」: 回る 風（ため音の 風神の 層と 同じ 作り）が 上がって 下がる。高さ・回る 速さが 3 とおり
WIND = [dict(lo=480, hi=1500, end=780, spin=(15, 8)), dict(lo=560, hi=1750, end=900, spin=(17, 9)), dict(lo=420, hi=1300, end=680, spin=(13, 7))]
def wind_wave(v, rng):
    T = 0.42; n = N(T); t = np.arange(n) / T / SR
    fc = np.where(t < 0.28, v['lo'] * (v['hi'] / v['lo']) ** (t / 0.28), v['hi'] * (v['end'] / v['hi']) ** ((t - 0.28) / 0.72))
    y = svf_bp(rng.standard_normal(n), fc, 3.5); y /= np.abs(y).max()
    spin = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(np.linspace(*v['spin'], n)) / SR)
    e = np.minimum(1, t / 0.07) * np.exp(-np.maximum(0, t - 0.07) * 4.2)   # 0.03 秒で ふわっと 入り、ゆっくり 消える
    body = lp(svf_bp(rng.standard_normal(n), 260, 1.5), 600); body /= np.abs(body).max()
    x = y * spin * e + 0.35 * body * e
    return fade(lp(lp(x, 3200), 3200), 0.002, 0.05)

# 雷神剣の 斬撃に まざる 雷「ばちばちっ…ごろ」: ため音の 雷神の ばちばちを 短く 集めた 物 ＋ 小さく 低い ごろ
THUNDER = [dict(k=6, span=0.16, rum=0.32), dict(k=7, span=0.19, rum=0.36), dict(k=5, span=0.14, rum=0.30)]
def thunder_slash(v, rng):
    out = np.zeros(N(0.6))
    ts = np.sort(rng.random(v['k']) ** 1.6 * v['span'])  # 頭に 多く、だんだん まばら
    for i, tt in enumerate(ts):
        c = svf_bp(rng.standard_normal(N(0.014)), 3600 + 1500 * rng.random(), 4.0); c /= np.abs(c).max()
        add(out, fade(c, 0.002, 0.01), 0.01 + tt, (1 - 0.6 * i / v['k']) * rng.uniform(0.75, 1.0))
    m = N(v['rum']); t = np.arange(m) / SR
    r = lp(lp(rng.standard_normal(m), 170), 170); r /= np.abs(r).max()
    add(out, r * np.minimum(1, t / 0.04) * np.exp(-t / (v['rum'] * 0.35)), 0.03, 0.55)
    return fade(out, 0.002, 0.05)

def write(path, x):
    y = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())

GAIN = {'wind': 0.085, 'thunder': 0.075}  # ものさしに 合わせた 大きさ（今の 音と 比べた 差は directions.md §8）
if __name__ == '__main__':
    out = sys.argv[1]; rng = np.random.default_rng(11)
    seq_w = np.zeros(N(2.6)); seq_t = np.zeros(N(2.6))
    for i, v in enumerate(WIND):
        x = wind_wave(v, rng) * GAIN['wind']; buf = np.zeros(N(0.1) + len(x) + N(0.2)); add(buf, x, 0.1)
        write(f'{out}/atk_windWave_{i+1}.wav', buf); add(seq_w, x, 0.15 + 0.8 * i)
    for i, v in enumerate(THUNDER):
        x = thunder_slash(v, rng) * GAIN['thunder']; buf = np.zeros(N(0.1) + len(x) + N(0.2)); add(buf, x, 0.1)
        write(f'{out}/atk_thunderSlash_{i+1}.wav', buf); add(seq_t, x, 0.15 + 0.8 * i)
    write(f'{out}/atk_windWave_x3.wav', seq_w); write(f'{out}/atk_thunderSlash_x3.wav', seq_t)
