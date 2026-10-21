# BS.1770 の 大きさ（LUFS、モノラル・48 kHz）を ゲート付きで 測る。使い方: python3 -I lufs.py a.wav b.wav ...
import numpy as np, wave, sys
SR = 48000
def biquad(x, b, a):
    y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = b[0]*x[i] + b[1]*x1 + b[2]*x2 - a[1]*y1 - a[2]*y2
        x2, x1, y2, y1 = x1, x[i], y1, v; y[i] = v
    return y
def kw(x):
    x = biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585])
    return biquad(x, [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621])
def lufs_int(y):
    w, h = int(0.4*SR), int(0.1*SR)
    z = np.array([np.mean(y[i:i+w]**2) for i in range(0, len(y)-w, h)])
    l = -0.691 + 10*np.log10(z + 1e-20); z = z[l > -70]
    rel = -0.691 + 10*np.log10(z.mean()) - 10
    z = z[-0.691 + 10*np.log10(z) > rel]
    return -0.691 + 10*np.log10(z.mean())
def part(y, a, b): return -0.691 + 10*np.log10(np.mean(y[int(a*SR):int(b*SR)]**2) + 1e-20)
for p in sys.argv[1:]:
    with wave.open(p) as f: x = np.frombuffer(f.readframes(f.getnframes()), '<i2') / 32768
    y = kw(x)
    print(f"{p.split('/')[-1]:32s} 通し {lufs_int(y):6.1f} LUFS  ため {part(y,0.15,1.15):6.1f}  合図 {part(y,1.15,1.65):6.1f}  ため続け {part(y,1.9,len(x)/SR-0.8):6.1f}")
