# WEAPON-8 ため音 3 案の 書き出し（CC0 の VCSL 録音 ＋ 合成）。乱数は シード付き。
# 使い方: python3 -I render.py <素材の .f32 の フォルダ> <出す フォルダ>
#   素材は directions.md の「素材」の 表の ファイルを https://raw.githubusercontent.com/sgossner/VCSL/master/ から 取り、
#   ffmpeg -i X.wav -ac 1 -ar 48000 -f f32le <名前>.f32 に する（元の 素材は リポジトリに 置かない）。
import numpy as np, wave, sys, os
SR = 48000
RAW, OUT = sys.argv[1], sys.argv[2]
rng0 = np.random.default_rng

def load(n):
    x = np.fromfile(f'{RAW}/{n}.f32', np.float32).astype(np.float64)
    return x / (np.abs(x).max() + 1e-12)

def N(t): return int(round(t * SR))

def fade(x, a=0.003, r=0.05):
    x = x.copy(); na, nr = max(1, N(a)), max(1, N(r))
    na = min(na, len(x)); nr = min(nr, len(x))
    x[:na] *= np.linspace(0, 1, na); x[-nr:] *= np.linspace(1, 0, nr)
    return x

def seg(x, t0, dur): return x[N(t0):N(t0) + N(dur)]

def resample(x, ratio):  # ratio > 1 = 高く・短く
    pos = np.arange(0, len(x) - 1, ratio)
    return np.interp(pos, np.arange(len(x)), x)

def varispeed(x, rate):  # rate: 出力 1 サンプルごとの 速さ
    pos = np.cumsum(rate); pos = pos[pos < len(x) - 1]
    return np.interp(pos, np.arange(len(x)), x)

def add(buf, x, t, g=1.0):
    i = N(t); j = min(len(buf), i + len(x))
    if j > i: buf[i:j] += g * x[:j - i]

def svf_bp(x, fc, q):  # Chamberlin 状態変数フィルター（帯域）。fc は 配列でも よい
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    f = 2 * np.sin(np.pi * np.minimum(fc, SR / 6) / SR); d = np.broadcast_to(1.0 / np.asarray(q, float), x.shape)
    lo = bp = 0.0; y = np.empty_like(x)
    for i in range(len(x)):
        hp = x[i] - lo - d[i] * bp; bp += f[i] * hp; lo += f[i] * bp; y[i] = bp
    return y

def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a) * x[i] + a * s; y[i] = s
    return y

def hz(note):
    names = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
    s = names[note[0]] + (1 if '#' in note else 0); o = int(note[-1])
    return 440 * 2 ** ((s + 12 * (o + 1) - 69) / 12)

def ramp(n, a, b, curve=1.0):
    t = np.linspace(0, 1, n) ** curve; return a + (b - a) * t

def loopify(x, xf):  # 頭と おしりを 重ねて 切れ目の ない ループに する
    n = N(xf); body = x[:-n].copy(); tail = x[-n:]
    w = np.linspace(0, 1, n)
    body[:n] = body[:n] * w + tail * (1 - w)
    return body

# ---- 素材（VCSL、実音を 測った 高さ）----
SMP = {k: load(k) for k in ['mark_asc','mark_fastasc','mark_random','vib_bowed_A4','vib_bowed_D4','glass_D5',
                            'chime_C5','chime_C6','glock_C6','glock_G6','handbell1','fingcym','ocarina_C5']}
F0 = {'vib_bowed_A4':880.0,'vib_bowed_D4':587.3,'chime_C5':1046.5,'chime_C6':2093.0,'glock_C6':2093.0,
      'glock_G6':1568*2/2,'handbell1':1099.0,'ocarina_C5':1046.5,'glass_D5':1178.0}

def note(name, target_hz, dur, a=0.003, r=None, t0=0.0):
    x = resample(seg(SMP[name], t0, dur * 3), target_hz / F0[name])[:N(dur)]
    return fade(x, a, r if r is not None else dur * 0.4)

def glock(f, dur=0.5): return note('glock_C6', f, dur, 0.002, dur * 0.6)

# ---- 風神・雷神の 味（どの 案にも 重ねられる 層）----
SOFT = {'on': False}
def flavor_charge(kind, T, rng):
    n = N(T); out = np.zeros(n)
    sg = 0.35 if SOFT['on'] else 1.0
    if kind == 'fujin':   # 回りながら 近づく 風「ひゅるるる」
        w = rng.standard_normal(n); t = np.arange(n) / SR
        fc = ramp(n, 500, 2600, 1.3); y = svf_bp(w, fc, 4.0)
        spin = 0.55 + 0.45 * np.sin(2 * np.pi * np.cumsum(ramp(n, 3, 11)) / SR)
        out = y * spin * ramp(n, 0.0, 1.0, 1.5) * 0.16 * (0.45 if SOFT['on'] else 1.0)
    elif kind == 'raijin':  # 小さな 光の パチ（だんだん 多く）
        t = 0.0
        while t < T:
            rate = 6 + 30 * (t / T) ** 1.5; t += rng.exponential(1 / rate)
            if t >= T: break
            c = svf_bp(rng.standard_normal(N(0.014)), 3600 + 1500 * rng.random(), 4.0); c /= np.abs(c).max()
            add(out, onepole_lp(fade(c, 0.004, 0.012), 3500) if SOFT['on'] else fade(c, 0.002, 0.01), t, sg * (0.15 + 0.30 * t / T))
    return out

def flavor_loop(kind, L, rng):
    n = N(L + 0.2); out = np.zeros(n)
    sg = 0.35 if SOFT['on'] else 1.0
    if kind == 'fujin':
        w = rng.standard_normal(n); t = np.arange(n) / SR
        y = svf_bp(w, 1300 + 700 * np.sin(2 * np.pi * t / (L + 0.2) * 2), 4.0)
        out = y * (0.6 + 0.4 * np.sin(2 * np.pi * t * 4)) * 0.10 * (0.5 if SOFT['on'] else 1.0)
    elif kind == 'raijin':
        for t in np.sort(rng.random(int(5 * L)) * L):
            c = svf_bp(rng.standard_normal(N(0.014)), 3800 + 1500 * rng.random(), 4.0); c /= np.abs(c).max()
            add(out, onepole_lp(fade(c, 0.004, 0.012), 3500) if SOFT['on'] else fade(c, 0.002, 0.01), t, 0.22 * sg)
    return loopify(out, 0.2)

# ================= 案 A: すずの かいだん（風鈴・鈴・グロッケン）=================
def planA(rng):
    T = 1.0
    ch = np.zeros(N(T + 1.5))
    # 風鈴の のぼる グリッサンド（マークツリー）を 速めて 1 秒に。だんだん 大きく
    m = varispeed(seg(SMP['mark_fastasc'], 0.05, 1.2), np.full(N(1.1), 0.75))[:N(T)]
    m = fade(m * ramp(len(m), 0.2, 1.0, 1.2), 0.03, 0.06); add(ch, m, 0, 0.35)
    # 鈴の 階段（五音: ド レ ミ ソ ラ ド レ）。だんだん 間が つまる
    steps = ['C6','D6','E6','G6','A6','C7','D7','E7']
    times = [0.0, 0.26, 0.47, 0.63, 0.75, 0.84, 0.91, 0.96]
    for i, (nm, tt) in enumerate(zip(steps, times)):
        add(ch, glock(hz(nm), 0.45), tt, 0.22 + 0.20 * i / (len(steps) - 1))
    # 息のように ふくらむ 空気
    w = rng.standard_normal(N(T)); air = svf_bp(w, ramp(N(T), 700, 3500, 1.2), 2.5)
    add(ch, fade(air * ramp(N(T), 0, 1, 2.0), 0.05, 0.05), 0, 0.10)
    ch = ch[:N(T)]  # ため中は ここまで（はなしたら 0.05 秒で 消す）
    # いっぱい: 鈴（ネパールの ハンドベル＝おりんの ような 響き）＋ 高い グロッケン 2 つ「チ・リーン」
    rd = np.zeros(N(1.8))
    add(rd, note('handbell1', hz('C6'), 1.8, 0.002, 1.2), 0.0, 0.70)
    add(rd, glock(hz('G7'), 0.7), 0.0, 0.40); add(rd, glock(hz('C8'), 0.9), 0.07, 0.45)
    add(rd, fade(seg(SMP['mark_random'], 6.0, 0.9), 0.05, 0.5), 0.05, 0.25)
    # ため続け: 風鈴の ちりちり（ランダム）＋ うすい 音の 柱（弓で こすった ビブラフォン C6）
    L = 1.6; n = N(L + 0.3)
    lp = fade(seg(SMP['mark_random'], 9.0, L + 0.3), 0.01, 0.01) * 0.30
    dr = seg(resample(SMP['vib_bowed_A4'], hz('C6') / F0['vib_bowed_A4']), 1.5, L + 0.3)
    lp = lp + dr * 0.20
    return ch, rd, loopify(lp, 0.3)

# ================= 案 B: ひかりの うた（のぼる 音の 柱＋光の つぶ）=================
def grains(T, rng, rate0, rate1, lo, hi, g0, g1):
    out = np.zeros(N(T + 0.6)); t = 0.0
    pent = [0, 2, 4, 7, 9]
    while True:
        r = rate0 + (rate1 - rate0) * (t / T); t += rng.exponential(1 / r)
        if t >= T: break
        # 時間が すすむほど 高い 音から えらぶ（つぶが 中心へ 集まる）
        k = lo + (hi - lo) * (t / T) + rng.uniform(-3, 3)
        k = int(round(k)); semi = min(pent, key=lambda p: abs((k % 12) - p)) + 12 * (k // 12)
        f = 523.25 * 2 ** (semi / 12)
        add(out, glock(f, 0.35), t, (g0 + (g1 - g0) * t / T) * rng.uniform(0.7, 1.0))
    return out

def planB(rng):
    T = 1.0; n = N(T)
    # 弓の ビブラフォン（ねいろは やさしい ガラスの ような 音）を G5→C7 へ なめらかに 上げる
    src = SMP['vib_bowed_D4'][N(0.9):]
    f = hz('G5') * (hz('C7') / hz('G5')) ** (np.linspace(0, 1, n) ** 1.4)
    up = varispeed(src, f / F0['vib_bowed_D4'])[:n]
    f5 = varispeed(SMP['vib_bowed_A4'][N(0.9):], f * 1.5 / F0['vib_bowed_A4'])[:n]
    ch = np.zeros(n)
    ch += fade(up, 0.04, 0.02) * ramp(n, 0.25, 0.75, 1.2) * 0.55
    ch += fade(f5, 0.04, 0.02) * ramp(n, 0.0, 0.35, 1.5) * 0.55
    ch += grains(T, rng, 5, 28, 0, 19, 0.05, 0.15)[:n]
    # いっぱい: ハンドチャイム C6＋C7（ポワーン）＋ 小さな シンバル（チーン）
    rd = np.zeros(N(2.0))
    add(rd, note('chime_C5', hz('C6'), 2.0, 0.003, 1.5), 0.0, 0.55)
    add(rd, note('chime_C6', hz('C7'), 1.6, 0.003, 1.2), 0.04, 0.40)
    add(rd, fade(seg(SMP['fingcym'], 0.0, 1.8), 0.002, 1.2), 0.08, 0.35)
    add(rd, glock(hz('E7'), 0.6), 0.10, 0.25); add(rd, glock(hz('G7'), 0.6), 0.16, 0.22)
    # ため続け: C7 の 柱が「ふわん ふわん」と ゆれる（ゆっくり 5 回/秒）＋ たまに 光の つぶ
    L = 1.2; m = N(L + 0.3); t = np.arange(m) / SR
    hold = seg(resample(SMP['vib_bowed_D4'], hz('C6') / F0['vib_bowed_D4']), 2.0, L + 0.3)
    hold5 = seg(resample(SMP['vib_bowed_A4'], hz('G6') / F0['vib_bowed_A4']), 2.0, L + 0.3)
    trem = 0.7 + 0.3 * np.sin(2 * np.pi * 5.0 * t)
    lp = (hold * 0.19 + hold5 * 0.075) * trem
    lp[:len(lp)] += grains(L + 0.3, rng, 4, 4, 14, 22, 0.06, 0.06)[:m]
    return ch, rd, loopify(lp, 0.3)

# ================= 案 C: かぜの ふえ（オカリナの 五音 ＋ 風 ＋ ドン・チーン）=================
def planC(rng):
    T = 1.0; n = N(T)
    ch = np.zeros(N(T + 0.5))
    w = rng.standard_normal(n)
    wind = svf_bp(w, ramp(n, 350, 2200, 1.4), ramp(n, 2.0, 6.0))
    add(ch, fade(wind * ramp(n, 0.1, 1.0, 1.6), 0.08, 0.03), 0, 0.24)
    steps = ['C5','D5','E5','G5','A5','C6']; times = [0.0, 0.30, 0.52, 0.68, 0.80, 0.90]
    for i, (nm, tt) in enumerate(zip(steps, times)):
        d = (times[i + 1] - tt + 0.08) if i + 1 < len(times) else 0.2
        x = note('ocarina_C5', hz(nm), d, 0.012, 0.05, t0=0.4)
        add(ch, x, tt, 0.20 + 0.12 * i / 5)
        # 木の「コッ」で 刻みを 足す（小さく）
        k = fade(np.sin(2 * np.pi * 1400 * np.arange(N(0.04)) / SR) * np.exp(-np.arange(N(0.04)) / N(0.008)), 0.001, 0.01)
        add(ch, k, tt, 0.12 + 0.10 * i / 5)
    ch = ch[:n]
    # いっぱい: 小さな 太鼓「ドン」（やわらかい）＋ おりん「チーン」
    rd = np.zeros(N(2.0)); m = N(0.5); tt = np.arange(m) / SR
    fdon = 95 * (60 / 95) ** (tt / 0.5)
    don = np.sin(2 * np.pi * np.cumsum(fdon) / SR) * np.exp(-tt / 0.16)
    thump = onepole_lp(rng.standard_normal(m), 300) * np.exp(-tt / 0.03) * 3
    add(rd, fade(don + thump, 0.004, 0.1), 0.0, 0.55)
    add(rd, note('handbell1', hz('C6'), 1.9, 0.002, 1.3), 0.05, 0.50)
    add(rd, note('ocarina_C5', hz('G6'), 0.5, 0.02, 0.3, t0=0.4), 0.05, 0.12)
    # ため続け: くるくる まわる 風 ＋ うすい オカリナ C6（ゆっくり いき）
    L = 1.5; m = N(L + 0.3); t = np.arange(m) / SR
    w = rng.standard_normal(m)
    wl = svf_bp(w, 1100 + 500 * np.sin(2 * np.pi * t * (2 / (L + 0.3))), 5.0) * (0.75 + 0.25 * np.sin(2 * np.pi * t * 2 / (L + 0.3) * 3))
    oc = seg(SMP['ocarina_C5'], 0.6, L + 0.3) * (0.8 + 0.2 * np.sin(2 * np.pi * t / (L + 0.3)))
    lp = wl * 0.20 + oc * 0.07
    return ch, rd, loopify(lp, 0.3)


# ================= 案 C2: かぜの ふえ（しずか版。オーナー 2026-10-21「どれも うるさい。C が いい」）=================
def planC2(rng):
    T = 1.0; n = N(T)
    ch = np.zeros(N(T + 0.5))
    w = rng.standard_normal(n)
    wind = svf_bp(w, ramp(n, 300, 1300, 1.4), ramp(n, 1.5, 3.0))  # 高く しすぎない（上は 1.3 kHz まで）
    add(ch, fade(wind * ramp(n, 0.15, 1.0, 1.4), 0.15, 0.04), 0, 0.22)
    steps = ['C5','D5','E5','G5','A5','C6']; times = [0.0, 0.30, 0.52, 0.68, 0.80, 0.90]
    for i, (nm, tt) in enumerate(zip(steps, times)):
        d = (times[i + 1] - tt + 0.10) if i + 1 < len(times) else 0.2
        x = note('ocarina_C5', hz(nm), d, 0.035, 0.06, t0=0.4)  # 息の ように ゆっくり 入る（木の「コッ」は やめる）
        add(ch, x, tt, 0.15 + 0.06 * i / 5)
    ch = onepole_lp(onepole_lp(ch[:n], 2400), 2400)  # 高い 音を 2 段で けずる
    # いっぱい: おりん「チーン」を やわらかく（高い 倍音を けずる）＋ ごく 軽い 太鼓「とん」＋ 笛の ソ
    rd = np.zeros(N(2.0)); m = N(0.35); tt = np.arange(m) / SR
    don = np.sin(2 * np.pi * np.cumsum(110 * (75 / 110) ** (tt / 0.35)) / SR) * np.exp(-tt / 0.09)
    add(rd, fade(don, 0.008, 0.08), 0.0, 0.18)
    rin = onepole_lp(onepole_lp(note('handbell1', hz('C6'), 1.9, 0.006, 1.4), 1800), 1800)
    add(rd, rin / np.abs(rin).max(), 0.02, 0.45)
    add(rd, note('ocarina_C5', hz('G5'), 0.45, 0.03, 0.3, t0=0.4), 0.04, 0.10)
    # ため続け: 背景に なじむ 風 ＋ ごく うすい 笛
    L = 1.5; m = N(L + 0.3); t = np.arange(m) / SR
    w = rng.standard_normal(m)
    wl = svf_bp(w, 800 + 250 * np.sin(2 * np.pi * t * (2 / (L + 0.3))), 3.0) * (0.8 + 0.2 * np.sin(2 * np.pi * t * 2 / (L + 0.3) * 3))
    oc = seg(SMP['ocarina_C5'], 0.6, L + 0.3) * (0.85 + 0.15 * np.sin(2 * np.pi * t / (L + 0.3)))
    lp = onepole_lp(onepole_lp(wl * 0.10 + oc * 0.035, 2000), 2000)
    return ch, rd, loopify(lp, 0.3)

def assemble(plan, flavor, seed):
    rng = rng0(seed)
    ch, rd, lp = plan(rng)
    T = len(ch) / SR
    frng = rng0(seed + 100)
    if flavor:
        ch = ch + flavor_charge(flavor, T, frng)[:len(ch)]
        fl = flavor_loop(flavor, len(lp) / SR, frng); lp = lp + fl[:len(lp)]
    lead = 0.15; loops = 2
    total = lead + T + loops * len(lp) / SR + 0.5
    out = np.zeros(N(total))
    add(out, fade(ch, 0.003, 0.003), lead)
    add(out, rd, lead + T)
    tiled = np.tile(lp, loops)
    li = np.ones(len(tiled)); k = N(0.12); li[:k] = np.linspace(0, 1, k)  # ループは いっぱいの 合図の 下から ふわっと 入る
    k2 = N(0.25); li[-k2:] = np.linspace(1, 0, k2)  # はなした: 0.25 秒で 消える（見本の おわり）
    add(out, tiled * li, lead + T)
    return out, dict(lead=lead, T=T, L=len(lp) / SR)

def write(path, x):
    y = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    plans = {'A': planA, 'B': planB, 'C': planC}
    target_peak = 10 ** (-6 / 20)  # -6 dBFS（天井 -1 dBFS まで 5 dB の よゆう）
    gains = {}
    for key, fn in plans.items():
        base, info = assemble(fn, None, 7)
        g = target_peak / np.abs(base).max(); gains[key] = g
        names = {'A': 'A_suzu-kaidan', 'B': 'B_hikari-uta', 'C': 'C_kaze-fue'}
        write(f'{OUT}/{names[key]}.wav', base * g)
        for fl in ['fujin', 'raijin']:
            x, _ = assemble(fn, fl, 7)
            write(f'{OUT}/{names[key]}_{fl}.wav', x * g)
        print(key, info, 'gain %.3f' % g)
    # C2: C と 同じ 倍率で 書き出す（下げた 分が そのまま 比べられる）
    SOFT['on'] = True
    for fl in [None, 'fujin', 'raijin']:
        x, _ = assemble(planC2, fl, 7)
        write(f'{OUT}/C2_kaze-fue-shizuka' + (f'_{fl}' if fl else '') + '.wav', x * gains['C'])
