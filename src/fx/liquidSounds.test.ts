import { describe, expect, it } from 'vitest';
import { createLiquidSounds, liquidVolumeStep, LIQUID_SOUND_TUNING } from './liquidSounds';
import type { LiquidSoundKind } from '../world/water/waterSystem';
import { makeRig } from '../world/water/waterTestKit';
import type { Tone } from './sound';

const fake = () => {
  const played: (readonly Tone[])[] = [];
  return { played, sound: { playTones: (t: readonly Tone[]) => void played.push(t) } };
};

describe('WAKIDOKORO §11 液体の 音', () => {
  it('距離で 小さく なり、maxDist より 遠いと 鳴らない', () => {
    expect(liquidVolumeStep(0)).toBe(0);
    expect(liquidVolumeStep(LIQUID_SOUND_TUNING.fullDist)).toBe(0);
    expect(liquidVolumeStep(20)).toBeGreaterThan(0);
    expect(liquidVolumeStep(LIQUID_SOUND_TUNING.maxDist + 1)).toBe(-1);
  });

  it('同じ 種類は gapTicks に 1 回。ちがう 種類は べつ。遠い 音は gain が 小さい', () => {
    const f = fake();
    let t = 0;
    const play = createLiquidSounds(f.sound, () => t, () => ({ x: 0.5, y: 0.5, z: 0.5 }));
    expect(play('erode', 0, 0, 0)).toBe(0);
    expect(play('erode', 0, 0, 0)).toBe(-1);
    expect(play('placeMagma', 0, 0, 0)).toBe(0);
    t += LIQUID_SOUND_TUNING.gapTicks.erode;
    expect(play('erode', 18, 0, 0)).toBeGreaterThan(0);
    expect(f.played.length).toBe(3);
    expect(f.played[2]![0]!.gain).toBeLessThan(f.played[0]![0]!.gain);
    t += 100;
    expect(play('placeWater', 100, 0, 0)).toBe(-1);
  });

  it('水の 仕組みが 置いた・こくようせき・こげた を 知らせる（番号だけ・getBlock なし）', () => {
    const { world, sys, step } = makeRig({ x: 16, y: 12, z: 16 });
    const got: LiquidSoundKind[] = [];
    sys.setSound((k) => void got.push(k));
    for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) world.setBlock(x, 2, z, 'stone');
    got.length = 0;
    world.setBlock(3, 3, 3, 'wakimizu');
    world.setBlock(8, 3, 8, 'magma_wakimizu');
    expect(got).toEqual(['placeWater', 'placeMagma']);
    step(1200);
    expect(got).toContain('erode');
    sys.setSound(null);
  });
});
