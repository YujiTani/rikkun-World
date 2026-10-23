import { describe, expect, it } from 'vitest';
import { boneIndex, createPose, poseChicken, type PoseInput } from './chickenPose';
import { MODEL_SCALE, type AnimalModelKind } from './chickenModel';

const posed = (kind: AnimalModelKind, o: Omit<Partial<PoseInput>, "state"> & { state: string }) => {
  const p = createPose(MODEL_SCALE[kind]);
  poseChicken(p, { stateTicks: 0, headRelYaw: 0, motion: 1, kind, ...o } as PoseInput, MODEL_SCALE[kind]);
  return p;
};
const rotZ = (p: ReturnType<typeof createPose>, bone: Parameters<typeof boneIndex>[0]) => p.rot[boneIndex(bone) * 3 + 2]!;

describe('LIVE-2.1 なげられて いる 子（§3.2）', () => {
  it.each(['chick', 'chicken', 'machoChick', 'macho'] as const)('%s: 羽 を ひろげる・目 を まるく ひらく・数 は ぜんぶ 有限', (kind) => {
    const idle = posed(kind, { state: 'idle' });
    const thrown = posed(kind, { state: 'thrown', stateTicks: 10 });
    expect(Math.abs(rotZ(thrown, 'wingL'))).toBeGreaterThan(Math.abs(rotZ(idle, 'wingL')) + 40);
    expect(Math.abs(rotZ(thrown, 'wingR'))).toBeGreaterThan(Math.abs(rotZ(idle, 'wingR')) + 40);
    // 目 は つぶさない（たのしい 顔。びっくり でも ない）: たて の 拡大 が 1 いか
    expect(thrown.sc[boneIndex('eyes') * 3 + 1]!).toBeGreaterThanOrEqual(1);
    for (const a of [thrown.off, thrown.rot, thrown.sc]) for (const v of a) expect(Number.isFinite(v)).toBe(true);
  });

  it('羽 の ひろげ は 左右 で 逆向き（左右 たいしょう）', () => {
    const p = posed('chicken', { state: 'thrown', stateTicks: 10 });
    expect(rotZ(p, 'wingL') * rotZ(p, 'wingR')).toBeLessThan(0);
  });

  it('はじめ から ひろげる（0 ステップ でも 羽 が ひらく）', () => {
    const p = posed('chick', { state: 'thrown', stateTicks: 0 });
    expect(Math.abs(rotZ(p, 'wingL'))).toBeGreaterThan(20);
  });
});
