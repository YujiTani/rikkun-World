# WEAPON-9 虹の 音の 試聴用: 共通の 道具（読みこみ・音程・フィルタ・響き・書き出し・数で 見る）。
# 本物の 楽器の 録音は VCSL（CC0、sources.txt）。元の ファイルは リポジトリに 入れない（48 kHz モノラルに した 物を 外の フォルダに 置く）。
import numpy as np, wave, os
SR = 48000
def N(t): return int(round(t * SR))
def db(v): return 20 * np.log10(max(float(v), 1e-12))

def rd(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1
        return np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768

def write(path, x):
    y = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())

class Samples:
    """VCSL を 48 kHz モノラルに した フォルダ（render.py の 1 つめの 引数）。頭の 無音を 切り、いちばん 大きい 所を 1 に そろえる"""
    def __init__(self, folder): self.dir = folder; self.cache = {}
    def __call__(self, name, start=0.0, dur=None):
        if name not in self.cache:
            x = rd(os.path.join(self.dir, name + '.wav'))
            x = x - x.mean()
            i = int(np.argmax(np.abs(x) > np.abs(x).max() * 0.02))
            x = x[max(0, i - N(0.002)):]
            self.cache[name] = x / np.abs(x).max()
        x = self.cache[name][N(start):]
        return x if dur is None else x[:N(dur)]

def fade(x, a, r):
    x = x.copy(); na, nr = max(1, min(len(x), N(a))), max(1, min(len(x), N(r)))
    x[:na] *= np.linspace(0, 1, na); x[-nr:] *= np.linspace(1, 0, nr); return x

def add(buf, x, t, g=1.0):
    i = N(t); j = min(len(buf), i + len(x))
    if j > i: buf[i:j] += g * x[:j - i]

def pitch(x, semis):
    """テープの 速さを 変える 音程の 上げ下げ（長さも かわる）"""
    r = 2 ** (semis / 12); n = int(len(x) / r)
    return np.interp(np.arange(n) * r, np.arange(len(x)), x)

def env_exp(n, a, tau):
    t = np.arange(n) / SR; return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / tau)

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

def hp(x, fc): return x - lp(x, fc)

def conv(x, h):
    n = len(x) + len(h) - 1; m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(h, m), m)[:n]

def hall(x, t60=1.2, mix=0.25, seed=5, bright=6000):
    """合成の 響き（指数で 消える ノイズ）。ドームの 中の 光の 広がり"""
    rng = np.random.default_rng(seed); n = N(t60 * 1.2)
    h = rng.standard_normal(n) * np.exp(-6.9 * np.arange(n) / N(t60)); h = lp(h, bright); h[:N(0.012)] = 0
    h /= np.sqrt((h ** 2).sum())
    y = conv(x, h); out = np.zeros(len(y)); out[:len(x)] += x * (1 - mix); out += y * mix * 2.2
    return out

def swish(rng, dur, f0, f1, q=3.0, a=0.004, tau=None, curve=0.35):
    """刃の 風「シャッ」: ノイズを 細い 帯で 通し、高さを f0 → f1 へ 動かす"""
    n = N(dur); t = np.arange(n) / n
    fc = f0 * (f1 / f0) ** (t ** curve)
    y = svf_bp(rng.standard_normal(n), fc, q); y /= np.abs(y).max()
    return fade(y * env_exp(n, a, tau or dur * 0.3), a, dur * 0.3)

def sine(f0, f1, dur, a=0.004, tau=0.1):
    n = N(dur); f = np.geomspace(f0, f1, n)
    return fade(np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, a, tau), a, min(dur * 0.3, 0.05))

def finish(x, a=0.002, r=0.05):
    """頭と おしりを ふわっと（ぷつっと 鳴らさない）"""
    return fade(x, a, r)

# ---------------------------------------------------------------- 数で 見る（安全）
def kw(x):
    def bq(x, b, a):
        y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
        for i in range(len(x)):
            v = b[0]*x[i] + b[1]*x1 + b[2]*x2 - a[1]*y1 - a[2]*y2; x2, x1, y2, y1 = x1, x[i], y1, v; y[i] = v
        return y
    x = bq(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585])
    return bq(x, [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621])

def measure(x):
    """ピーク（4 倍の 細かさ）・K 重みの 50ms と 400ms の 最大・通しの LUFS・立ち上がり・急な 上がり・3 kHz より 上の 量"""
    n = len(x); up = np.interp(np.arange(0, n - 1, 0.25), np.arange(n), x)
    y = kw(x)
    def win(w, h): return np.array([-0.691 + 10 * np.log10(np.mean(y[i:i + w] ** 2) + 1e-20) for i in range(0, max(1, n - w), h)])
    m50 = win(N(0.05), N(0.01)); m400 = win(N(0.4), N(0.1))
    z = m400[m400 > -70]; integ = 10 * np.log10(np.mean(10 ** (z / 10))) if len(z) else -99
    z2 = z[z > integ - 10]; integ = 10 * np.log10(np.mean(10 ** (z2 / 10))) if len(z2) else integ
    # 立ち上がり: はじめて 0.5 × ピーク に とどく までの 秒（いちばん 大きい 1 発め）
    a = np.abs(x); k = int(np.argmax(a > 0.1 * a.max())); k2 = int(np.argmax(a > 0.5 * a.max()))
    # 急な 上がり: 50ms の 大きさが、その前 0.3 秒の いちばん 大きい 所より 上がった 量（前の 音が まだ -40 より 大きく 鳴っている 所だけ。無音からの 1 発めは 立ち上がりで 見る）
    jumps = [m50[i] - m50[max(0, i - 30):i].max() for i in range(30, len(m50)) if m50[i] > -45 and m50[max(0, i - 30):i].max() > -40]
    S = np.abs(np.fft.rfft(x)) ** 2; f = np.fft.rfftfreq(n, 1 / SR)
    return dict(peak=db(np.abs(up).max()), m50=m50.max(), m400=m400.max(), lufs=integ,
                attack_ms=(k2 - k) / SR * 1000, rise=max(jumps) if jumps else 0.0,
                hi3k=10 * np.log10(S[f >= 3000].sum() / S.sum() + 1e-12), clip=int((np.abs(x) >= 0.999).sum()),
                dur=n / SR)
