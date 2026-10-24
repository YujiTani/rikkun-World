import { describe, expect, it } from 'vitest';
import { IntroSeq, introAngleDeg, introSpot, type IntroEvent } from './gashaGirlIntro';

const cfg = { laughSec: 3, warps: 5, warpSec: 0.3, poseSec: 2.5 };
const run = (seq: IntroSeq, total: number, dt = 1 / 60): { t: number; e: IntroEvent }[] => {
  const out: { t: number; e: IntroEvent }[] = [];
  let t = 0;
  for (const e of seq.start()) out.push({ t, e });
  for (let i = 0; i < Math.round(total / dt); i++) { t += dt; for (const e of seq.update(dt)) out.push({ t, e }); }
  return out;
};

describe('決めポーズへの 登場の 流れ（笑う → ワープ 5 回 → ポーズ → おわり）', () => {
  it('順番: 笑い声 → ワープ 5 回(0.3 秒おき) → 正面で ポーズ → おわり。時刻は 設定どおり', () => {
    const ev = run(new IntroSeq(cfg), 12);
    expect(ev.map((x) => x.e.kind)).toEqual(['laugh', 'warp', 'warp', 'warp', 'warp', 'warp', 'pose', 'done']);
    expect(ev[0]!.t).toBe(0);
    const warps = ev.filter((x) => x.e.kind === 'warp');
    expect(warps.map((x) => x.e.index)).toEqual([0, 1, 2, 3, 4]);
    expect(warps[0]!.t).toBeCloseTo(3, 1);
    for (let i = 1; i < warps.length; i++) expect(warps[i]!.t - warps[i - 1]!.t).toBeCloseTo(0.3, 1);
    expect(ev.find((x) => x.e.kind === 'pose')!.t).toBeCloseTo(3 + 5 * 0.3, 1);
    expect(ev.find((x) => x.e.kind === 'done')!.t).toBeCloseTo(3 + 5 * 0.3 + 2.5, 1);
  });

  it('1 コマが 長くても(大きな dt) 取りこぼさず 順番に 出る', () => {
    const seq = new IntroSeq(cfg);
    seq.start();
    const kinds = seq.update(100).map((e) => e.kind);
    expect(kinds).toEqual(['warp', 'warp', 'warp', 'warp', 'warp', 'pose', 'done']);
    expect(seq.phase).toBe('done');
    expect(seq.update(1)).toEqual([]);
  });

  it('ワープの 角度: プレイヤーの まわりを 1 周(60° ずつ)して、さいごは 正面(0°)', () => {
    expect([0, 1, 2, 3, 4].map((k) => introAngleDeg(k, 5))).toEqual([60, 120, 180, 240, 300]);
    expect(introAngleDeg(5, 5)).toBe(0);
  });

  it('場所: 角度 0 は プレイヤーの 正面、180 は 真うしろ、距離は 指定どおり', () => {
    const p = { x: 10, z: 20, yawDeg: 0 }; // yaw 0 = -z 向き
    const f = introSpot(p, 0, 4);
    expect(f.x).toBeCloseTo(10, 6); expect(f.z).toBeCloseTo(16, 6);
    const b = introSpot(p, 180, 6);
    expect(b.x).toBeCloseTo(10, 6); expect(b.z).toBeCloseTo(26, 6);
    const q = introSpot({ x: 0, z: 0, yawDeg: 90 }, 0, 3); // yaw 90 = +x 向き
    expect(q.x).toBeCloseTo(3, 6); expect(q.z).toBeCloseTo(0, 6);
    const r = introSpot(p, 77, 5);
    expect(Math.hypot(r.x - 10, r.z - 20)).toBeCloseTo(5, 6);
  });

  it('キャンセル(cancel)すると それ いこうは 何も 出ない', () => {
    const seq = new IntroSeq(cfg);
    seq.start();
    seq.update(3.1);
    seq.cancel();
    expect(seq.update(10)).toEqual([]);
    expect(seq.phase).toBe('done');
  });
});
