import { describe, expect, it } from 'vitest';
import { CHEER_KEYS, FIGHT_BONES, FIGHT_POSES, FLEX_KEYS, PUNCH_KEYS, UPPER_KEYS, fightPoseOf, makeFightPose, mixPoseInto, sampleInto } from './fightPose';

/** LIVE-4 の ポーズ（アート 案 C）の 数 と つなぎ（docs/design/LIVE-4.md §3.3） */
describe('マッチョ の たたかい の ポーズ', () => {
  it('キー の ポーズ 名 が ぜんぶ 表 に ある・時間 は 小さい 順', () => {
    for (const keys of [PUNCH_KEYS, UPPER_KEYS, FLEX_KEYS, CHEER_KEYS]) {
      keys.forEach(([t, n], i) => {
        expect(FIGHT_POSES[n], n).toBeTruthy();
        if (i > 0) expect(t).toBeGreaterThan(keys[i - 1]![0]);
      });
    }
  });
  it('パンチ・きりあげ は 41 ステップ 以内、かちポーズ・おうえん は 30', () => {
    expect(PUNCH_KEYS[PUNCH_KEYS.length - 1]![0]).toBeLessThanOrEqual(41);
    expect(UPPER_KEYS[UPPER_KEYS.length - 1]![0]).toBeLessThanOrEqual(41);
    expect(FLEX_KEYS[FLEX_KEYS.length - 1]![0]).toBe(30);
    expect(CHEER_KEYS[CHEER_KEYS.length - 1]![0]).toBe(30);
  });
  it('当たる コマ（5）で 決めポーズ: パンチ は 腕 を のばしきった p_hit、きりあげ は u_hit', () => {
    const out = makeFightPose();
    const hit = fightPoseOf('punch', 5, false, out)!;
    expect(hit.bones.wingR!.q).toEqual(FIGHT_POSES.p_hit!.bones.wingR!.q);
    const up = fightPoseOf('upper', 5, false, makeFightPose())!;
    expect(up.root.sc).toEqual(FIGHT_POSES.u_hit!.root.sc);
    expect(up.root.off).toEqual(FIGHT_POSES.u_hit!.root.off);
  });
  it('はしる は 12 ステップ で 1 まわり。おうえん は 30 ステップ で くり返す', () => {
    const a = fightPoseOf('run', 3, false, makeFightPose())!;
    const b = fightPoseOf('run', 15, false, makeFightPose())!;
    expect(a.root.rot[0]).toBeCloseTo(b.root.rot[0], 6);
    const c = fightPoseOf('cheer', 7, false, makeFightPose())!;
    const d = fightPoseOf('cheer', 37, false, makeFightPose())!;
    expect(c.root.rot[2]).toBeCloseTo(d.root.rot[2], 6);
  });
  it('動き の 強さ 0（hold）: まぜずに キー の ポーズ に 切りかわる', () => {
    const mid = sampleInto(PUNCH_KEYS, 4.5, makeFightPose(), true);
    expect(mid.root.rot).toEqual(FIGHT_POSES.p_tame!.root.rot);
    const end = sampleInto(PUNCH_KEYS, 5, makeFightPose(), true);
    expect(end.root.rot).toEqual(FIGHT_POSES.p_hit!.root.rot);
  });
  it('たたかい で ない state は null。骨 は ぜんぶ そろう。まぜた 回転 は 長さ 1', () => {
    expect(fightPoseOf('follow', 0, false, makeFightPose())).toBeNull();
    const m = mixPoseInto(FIGHT_POSES.u_hit!, FIGHT_POSES.f_flex!, 0.4, makeFightPose());
    for (const n of FIGHT_BONES) {
      const q = m.bones[n]!.q!;
      expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 5);
    }
  });
});
