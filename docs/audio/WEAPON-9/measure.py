# 試聴用 wav の 安全の 数。使い方: python3 -I measure.py <フォルダ>
import sys, os, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import rd, measure
print(f"{'file':34s} {'peak4x':>7s} {'max50ms':>8s} {'max400':>7s} {'LUFS':>6s} {'立上ms':>6s} {'急上がり':>7s} {'>3kHz':>6s} clip  秒")
for p in sorted(glob.glob(sys.argv[1] + '/*.wav')):
    m = measure(rd(p))
    print(f"{os.path.basename(p):34s} {m['peak']:7.1f} {m['m50']:8.1f} {m['m400']:7.1f} {m['lufs']:6.1f} {m['attack_ms']:6.1f} {m['rise']:+7.1f} {m['hi3k']:6.1f} {m['clip']:4d} {m['dur']:4.1f}")
