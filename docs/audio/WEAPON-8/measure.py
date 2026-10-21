import numpy as np, wave, sys, glob, os
SR=48000
def rd(p):
    with wave.open(p) as w: return np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(float)/32768
def db(v): return 20*np.log10(max(v,1e-9))
for p in sorted(glob.glob(sys.argv[1]+'/*.wav')):
    x=rd(p); n=len(x)
    up=np.interp(np.arange(0,n-1,0.25),np.arange(n),x)  # 4 倍の 細かさで 見た ピーク
    w=N=int(0.05*SR); hop=int(0.01*SR)
    r=np.array([np.sqrt(np.mean(x[i:i+w]**2)+1e-12) for i in range(0,n-w,hop)])
    rdb=20*np.log10(r)
    # 急な 大音量: 50ms の 大きさが、その前 0.3 秒の いちばん 大きい 所より 何 dB 上がったか（音が 鳴っている 所だけ）
    jumps=[rdb[i]-rdb[max(0,i-30):i].max() for i in range(30,len(rdb)) if rdb[i]>-40]
    # 立ち上がり: 1 サンプルで 動く いちばん 大きい 差
    dmax=np.abs(np.diff(x)).max()
    seg=lambda a,b: x[int(a*SR):int(b*SR)]
    rms=lambda y: db(np.sqrt(np.mean(y**2)))
    env=' '.join('%d'%db(np.sqrt(np.mean(seg(t,t+0.1)**2))) for t in np.arange(0.1,n/SR-0.1,0.1))
    print(f"{os.path.basename(p):28s} peak {db(np.abs(x).max()):5.1f} dBFS  4x {db(np.abs(up).max()):5.1f}  max50ms {rdb.max():5.1f}  "
          f"ため平均 {rms(seg(0.15,1.15)):5.1f}  合図0.5s {rms(seg(1.15,1.65)):5.1f}  ループ平均 {rms(seg(1.9,n/SR-0.8)):5.1f}  "
          f"急な上がり(最大) {max(jumps):+4.1f} dB  1サンプル差 {dmax:.3f}  クリップ {(np.abs(x)>=0.999).sum()}")
    print('   0.1秒ごと dB:', env)
