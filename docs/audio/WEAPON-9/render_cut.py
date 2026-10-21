# WEAPON-9 C3: yuzu の 見本（on-jin sen_ka_katana_kirikizamu02.mp3、6 秒）から 1 回 1 回の 切り音を 切り出して ならべる。
# 元の mp3 は リポジトリに 入れない。公開の 前に 配って よいか 確かめる（decisions/2026-10-21-niji-sound-b.md）。
# 使い方: python3 -I render_cut.py <見本の 48kHz モノラル wav> <出す フォルダ>
#   （ffmpeg -i slash_ref.mp3 -ac 1 -ar 48000 -c:a pcm_s16le ref48.wav）
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render import TARGET, COMBO_T, level, pad, trim
from common import *
# 見本の 中の 1 回ぶんの 切れ目（秒、はじめ, おわり）。音の 谷で 区切った
SEG = [(1.29, 1.40), (1.47, 1.70), (1.72, 1.98), (1.99, 2.30), (2.58, 2.95), (3.03, 3.40), (3.77, 4.10)]
ORDER = {1: [5], 2: [2, 5], 3: [2, 4, 6]}   # 1 段 = 1 回、2 段 = 2 回、3 段 = 3 回
GAP = {1: [0], 2: [0, 0.14], 3: [0, 0.13, 0.26]}
def cut(ref, i, semis):
    a, b = SEG[i]; x = ref[N(a):N(b)].copy(); x = pitch(x, semis)
    return fade(x, 0.003, 0.03)
def slash(ref, stage, semis):
    out = np.zeros(N(1.2)); sh = [0, 0.7, -0.7][semis]
    for j, (i, t) in enumerate(zip(ORDER[stage], GAP[stage])):
        c = cut(ref, i, sh + (0.5 * j if stage > 1 else 0)); c = c * (1.0 if j == stage - 1 or stage == 1 else 0.8)
        if j == stage - 1: c = fade(np.concatenate([c, c[-N(0.04):][::-1] * 0]), 0.003, 0.06)  # 最後の 1 回は おしりを 長めに
        add(out, c, t)
    return fade(out, 0.002, 0.08)
if __name__ == '__main__':
    src, o = sys.argv[1], sys.argv[2]; os.makedirs(o, exist_ok=True); ref = rd(src)
    combo = np.zeros(N(4.6))
    for s in (1, 2, 3):
        vs = [trim(level(slash(ref, s, v), TARGET[f'slash{s}'])) for v in range(3)]
        write(f'{o}/C3_cut_slash{s}.wav', pad(vs[0]))
        add(combo, vs[0], 0.15 + COMBO_T[s - 1]); add(combo, vs[(s % 2) + 1], 2.35 + COMBO_T[s - 1])
        for v in range(3): write(f'{o}/C3_cut_slash{s}_v{v}.wav', pad(vs[v]))
    write(f'{o}/C3_cut_slash_combo.wav', trim(combo)); print('done C3')
