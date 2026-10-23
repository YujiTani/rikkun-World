# WEAPON-9 B 案 domePull: シャイニングの すいこみ中の「すぅー」（ループ）。合成のみ（録音なし）。
# 2.0 秒の つなぎ目なしの ループ（B_hagane_domePull.wav）＋ 3 秒 ほど 鳴らして 止める 試し用（_x3）。
# つなぎ目: 尾を 頭に 重ねて クロスフェード ＋ 音の 高さ・ゆれは 2 秒で ちょうど 1 周する 形。ループに fade は つけない（ゲームで 頭から おしりへ そのまま つなぐ）
# 使い方: python3 -I render_pull.py <出す フォルダ>
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
L = 2.0; TARGET_M400 = -36.5   # shiningStart -26.5・shiningHit -34 より 小さく
def loop():
    rng = np.random.default_rng(97); X = 0.4; n = N(L + X); t = np.arange(n) / SR
    fc = 900 * 2 ** (0.5 * np.sin(2 * np.pi * t / L))           # 息が すう ように ゆっくり 上下（2 秒で 1 周）
    br = svf_bp(rng.standard_normal(n), fc, 1.6); br /= np.abs(br).max()
    am = 0.75 + 0.25 * np.sin(2 * np.pi * t / L - np.pi / 2)
    tone = sum(g * np.sin(2 * np.pi * f * t) for f, g in [(262, 1.0), (392, 0.6), (524, 0.35)]) * (0.5 + 0.5 * np.sin(2 * np.pi * t / L)) * 0.12  # ド ソ ド（BGM の 和音）を うっすら
    y = (br * 0.9 + tone) * am
    m = N(L); out = y[:m].copy(); k = N(X)
    w = np.linspace(0, 1, k); out[:k] = out[:k] * w + y[m:m + k] * (1 - w)   # 尾と 頭を 重ねる（等しい 重ね）
    return lp(np.concatenate([out, out, out]), 5000)[m:2 * m]               # 3 回 つないで 真ん中を 取る（フィルタの 頭の くせを 消す）
def level(x, target):
    from common import measure
    return x * 10 ** ((target - measure(np.tile(x, 2))['m400']) / 20)
if __name__ == '__main__':
    o = sys.argv[1]; os.makedirs(o, exist_ok=True); x = level(loop(), TARGET_M400)
    write(f'{o}/B_hagane_domePull.wav', x)
    seq = np.tile(x, 2)[:N(3.0)].copy(); seq = np.concatenate([seq, np.zeros(N(0.3))])
    seq[:N(0.2)] *= np.linspace(0, 1, N(0.2)); seq[N(2.6):N(3.0)] *= np.linspace(1, 0, N(0.4))  # はじめ ふわっと、止める ときも ふわっと
    write(f'{o}/B_hagane_domePull_x3.wav', seq); print('done pull')
