# 今の ゲームの 音（src/fx/legendSounds.ts・sound.ts の Tone）を WebAudio と 同じ 作りで 近似して 書き出す（比べる ため）。
# 大きさ: fxVolume 0.5（はじめ）× GAIN_K 2 × masterVolume 0.6、ノイズは ×4（NOISE_BOOST）。リミッターの 前。
import numpy as np, wave, sys
SR = 48000; VOL = 0.5 * 2 * 0.6
def hz(n):
    s = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[n[0]]; o = int(n[-1]); return 440 * 2 ** ((s + 12*(o+1) - 69) / 12)
rng = np.random.default_rng(12345); NZ = rng.random(SR) * 2 - 1
def env(n, start_n, attack, stop, peak):
    t = np.arange(n) / SR; e = np.zeros(n)
    a = (t < attack); e[a] = peak * t[a] / attack
    b = (t >= attack) & (t < stop); e[b] = peak * (0.0001 / peak) ** ((t[b] - attack) / (stop - attack))
    return e
def bp_sweep(x, f0, f1, q, typ):
    n = len(x); y = np.zeros(n); x1 = x2 = y1 = y2 = 0.0
    fr = f0 * (f1 / f0) ** (np.arange(n) / n) if f1 else np.full(n, f0)
    for i in range(n):
        w = 2*np.pi*fr[i]/SR; al = np.sin(w)/(2*q); c = np.cos(w)
        if typ == 'bandpass': b0, b1, b2 = al, 0, -al
        else: b0, b1, b2 = (1+c)/2, -(1+c), (1+c)/2
        a0, a1, a2 = 1+al, -2*c, 1-al
        v = (b0*x[i] + b1*x1 + b2*x2 - a1*y1 - a2*y2) / a0
        x2, x1, y2, y1 = x1, x[i], y1, v; y[i] = v
    return y
def noise(delay, dur, gain, ftype, f0, f1, q, attack):
    attack = max(0.002, attack); stop = max(dur, attack + 0.01); n = int(stop * SR)
    src = np.resize(NZ, n); y = bp_sweep(src, f0, f1, q, ftype)
    return delay, y * env(n, 0, attack, stop, min(8, gain * VOL * 4))
def sine(f0, f1, delay, dur, gain, attack=0.002, partials=()):
    attack = max(0.002, attack); stop = max(dur, attack + 0.01); n = int(stop * SR); t = np.arange(n)/SR
    out = np.zeros(n); peak = min(1, gain * VOL)
    for ratio, g, ds in [(1, 1, 1)] + list(partials):
        ls = stop if ratio == 1 else max(dur*ds, attack+0.01); m = int(ls*SR)
        fr = f0*ratio*(f1/f0) ** (np.arange(m)/m)
        out[:m] += np.sin(2*np.pi*np.cumsum(fr)/SR) * env(m, 0, attack, ls, max(0.0002, peak*g))
    return delay, out
swish = lambda f0, f1, d, dur, g, q=1: noise(d, dur, g, 'bandpass', f0, f1, q, min(0.012, dur*0.3))
shaka = lambda d, dur, g, f=5000: noise(d, dur, g, 'highpass', f, None, 0.7, min(0.006, dur*0.3))
box = lambda f0, f1, d, dur, g, rich=False: [sine(f0, f1, d, dur, g, 0.002, [(2, .15, .6)] + ([(5.4, .06, .25)] if rich else []))]
suzu = lambda d, n, gap, g: [noise(d+i*gap, 0.05, g*(1-i/(n+1)), 'bandpass', 7000-i*300, None, 6, 0.002) for i in range(n)]
SOUNDS = {
 'now_windWave': [swish(1500, 3000, 0, 0.14, 0.12, 1.2), shaka(0.02, 0.06, 0.05, 5500)],
 'now_thunderSlash': [swish(1400, 5200, 0, 0.12, 0.16, 1.5), shaka(0.02, 0.04, 0.1, 6000)],
 'now_chargeReady': box(hz('G6'), hz('G6')*1.01, 0, 0.09, 0.3) + box(hz('D7'), hz('D7')*1.01, 0.07, 0.2, 0.28) + suzu(0.1, 3, 0.04, 0.1),
 'now_pickup': box(hz('C6'), hz('D6'), 0, 0.1, 0.45, True) + box(hz('G6'), hz('A6'), 0.06, 0.18, 0.35),
}
def render(parts, lead=0.1, tail=0.3):
    end = max(d + len(x)/SR for d, x in parts); out = np.zeros(int((lead+end+tail)*SR))
    for d, x in parts: i = int((lead+d)*SR); out[i:i+len(x)] += x
    return out
if __name__ == '__main__':
    for k, v in SOUNDS.items():
        y = render(v); y16 = np.clip(np.round(y*32767), -32768, 32767).astype('<i2')
        with wave.open(f'{sys.argv[1]}/{k}.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y16.tobytes())
        print(k, 'peak %.1f dBFS' % (20*np.log10(np.abs(y).max())))
