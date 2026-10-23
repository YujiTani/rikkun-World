import { describe, expect, it } from 'vitest';
import { meshChunk } from '../render/meshChunk';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { LIGHT_CONFIG as C } from './config';
import { blockLightBrightness, combinedBrightness, darkenFromBrightness, isDarkForSpawn, lightBrightness, nightSkyFactor, skyBrightness } from './curve';
import { M7_SETTING_DEFAULTS } from '../../contracts';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/** 平らな床（y=0 いわ、y=1〜 くうき）の小さな世界 */
function flat(): { w: ArrayVoxelWorld; l: WorldLight; d: SkyDarkness } {
  const w = new ArrayVoxelWorld({ x: 48, y: 16, z: 48 });
  w.fill(0, 0, 0, 47, 0, 47, 'stone');
  const d = new SkyDarkness();
  return { w, l: new WorldLight(w, d), d };
}

describe('空の光', () => {
  it('空の下は 15、はっぱは 1 弱める', () => {
    const { w, l } = flat();
    expect(l.skyLight(5, 3, 5)).toBe(15);
    w.setBlock(20, 5, 20, 'leaves');
    l.update();
    l.flush();
    expect(l.skyLight(20, 4, 20)).toBe(14);
    expect(l.skyLight(20, 5, 20)).toBe(14);
  });
  it('屋根の下へ横から 1 マスごとに 1 弱まって入る', () => {
    const { w, l } = flat();
    w.fill(10, 5, 0, 40, 5, 47, 'stone');
    l.update();
    l.flush();
    expect(l.skyLight(9, 3, 20)).toBe(15);
    expect(l.skyLight(10, 3, 20)).toBe(14);
    expect(l.skyLight(12, 3, 20)).toBe(12);
    expect(l.skyLight(25, 3, 20)).toBe(0);
  });
  it('夜は level が下がる', () => {
    const { l, d } = flat();
    expect(l.level(5, 3, 5)).toBe(15);
    d.value = 11;
    expect(l.level(5, 3, 5)).toBe(4);
  });
});

describe('たいまつの光', () => {
  it('14 から 1 マスごとに 1 弱まる。かべでさえぎられる', () => {
    const { w, l } = flat();
    w.setBlock(24, 1, 24, 'torch');
    l.update();
    l.flush();
    expect(l.blockLight(24, 1, 24)).toBe(14);
    expect(l.blockLight(28, 1, 24)).toBe(10);
    expect(l.blockLight(24, 1, 33)).toBe(5);
    w.fill(26, 1, 20, 26, 6, 28, 'stone');
    l.update();
    l.flush();
    expect(l.blockLight(27, 1, 24)).toBeLessThan(10);
    expect(l.blockLight(27, 1, 24)).toBeGreaterThan(0); // 回りこむ
  });
  it('こわすと もとにもどる。計算し直しは近くだけ', () => {
    const { w, l } = flat();
    w.setBlock(24, 1, 24, 'start_torch');
    l.update();
    l.flush();
    w.setBlock(24, 1, 24, 'air');
    l.update();
    l.flush();
    expect(l.blockLight(24, 1, 24)).toBe(0);
    expect(l.blockLight(26, 1, 24)).toBe(0);
    expect(l.lastRecomputeCells).toBeLessThan(48 * 16 * 48);
  });
  it('光が変わったチャンクに作り直しを伝える', () => {
    const { w, l } = flat();
    w.setBlock(24, 1, 24, 'torch');
    w.takeDirtyChunks();
    l.update();
    l.flush();
    expect(w.takeDirtyChunks().length).toBeGreaterThan(0);
  });
});

describe('3 だんかい（強い・少し・なし）', () => {
  const lvl = (n: number) => C.torchLevel - n; // 距離 n マスの光
  it('4 マスまで強い、5〜8 マスは少し、9 マスからなし', () => {
    expect(blockLightBrightness(lvl(4))).toBe(C.torchBrightBrightness);
    expect(blockLightBrightness(lvl(5))).toBe(C.torchDimBrightness);
    expect(blockLightBrightness(lvl(8))).toBe(C.torchDimBrightness);
    expect(blockLightBrightness(lvl(9))).toBe(0);
    expect(blockLightBrightness(0)).toBe(0);
  });
  it('たいまつから実際に数えた境目', () => {
    const { w, l } = flat();
    w.setBlock(24, 1, 24, 'torch');
    l.update();
    l.flush();
    const at = (n: number) => blockLightBrightness(l.blockLight(24 + n, 1, 24));
    expect(at(4)).toBe(C.torchBrightBrightness);
    expect(at(5)).toBe(C.torchDimBrightness);
    expect(at(8)).toBe(C.torchDimBrightness);
    expect(at(9)).toBe(0);
  });
  it('妖怪が出ない所: 夜でも たいまつ 8 マス以内。9 マスからは出る', () => {
    const { w, l, d } = flat();
    w.setBlock(14, 1, 24, 'torch');
    l.update();
    l.flush();
    d.value = 11;
    expect(l.isDarkForSpawn(14 + 8, 1, 24)).toBe(false);
    expect(l.isDarkForSpawn(14 + 9, 1, 24)).toBe(true);
    d.value = 0;
    expect(l.isDarkForSpawn(14 + 20, 1, 24)).toBe(false); // 昼の外
    expect(isDarkForSpawn(15, 0, 0)).toBe(false);
  });
});

describe('明るさの曲線', () => {
  it('0 でも真っ黒でなく、15 で 1', () => {
    expect(lightBrightness(0)).toBeGreaterThan(0);
    expect(lightBrightness(0)).toBeLessThan(0.1);
    expect(lightBrightness(15)).toBeCloseTo(1);
    expect(lightBrightness(8)).toBeLessThan(lightBrightness(12));
  });
  it('時刻の明るさから弱める段数', () => {
    expect(darkenFromBrightness(1, 0.45)).toBe(0);
    expect(darkenFromBrightness(0.45, 0.45)).toBe(C.nightDarken);
  });
});

describe('メッシュ', () => {
  it('たいまつは細い箱で描かれ、頂点に光が入る', () => {
    const { w, l } = flat();
    w.setBlock(5, 1, 5, 'torch');
    l.update();
    l.flush();
    const m = meshChunk(w, 0, 0, l);
    expect(m.opaque.lights.length / 2).toBe(m.opaque.positions.length / 3);
    expect(m.opaque.lights.length).toBeGreaterThan(0);
  });
});

describe('手動のモード（VOX-D の lightColumn）', () => {
  function cols(): ArrayVoxelWorld {
    const w = new ArrayVoxelWorld({ x: 48, y: 32, z: 48 });
    w.fill(0, 0, 0, 47, 0, 47, 'stone');
    w.setBlock(24, 1, 24, 'torch');
    return w;
  }

  it('読みこんでも勝手に計算しない。lightColumn で 1 列ぶん計算し、ふつうの計算と同じ値', () => {
    const auto = new WorldLight(cols(), new SkyDarkness());
    auto.flush();
    const w = cols();
    const l = new WorldLight(w, new SkyDarkness());
    l.setManual(true);
    w.unloadColumn(1, 1);
    l.update();
    expect(l.isLitColumn(1, 1)).toBe(false);
    expect(l.pendingCount()).toBe(0);
    w.loadColumn(cols().column(1, 1)!);
    l.update();
    expect(l.pendingCount()).toBe(0); // まわりを作り直し待ちにしない
    expect(l.isLitColumn(1, 1)).toBe(false);
    l.lightColumn(1, 1);
    expect(l.isLitColumn(1, 1)).toBe(true);
    for (const [x, y, z] of [[24, 1, 24], [28, 1, 24], [20, 5, 30], [17, 2, 17]] as const) {
      expect(l.blockAt(x, y, z)).toBe(auto.blockAt(x, y, z));
      expect(l.skyAt(x, y, z)).toBe(auto.skyAt(x, y, z));
    }
  });

  it('列を捨てても となりの光は そのまま。ブロックを変えたときは ふつうに作り直す', () => {
    const w = cols();
    const l = new WorldLight(w, new SkyDarkness());
    l.setManual(true);
    const before = l.blockAt(30, 1, 24);
    w.unloadColumn(0, 1);
    l.update();
    expect(l.isLitColumn(1, 1)).toBe(true);
    expect(l.blockAt(30, 1, 24)).toBe(before);
    w.setBlock(40, 1, 5, 'torch');
    l.update();
    l.flush();
    expect(l.blockAt(40, 1, 5)).toBe(14);
  });
});

describe('夜の倍率（#76）', () => {
  it('夜の外は 0.125 × 0.16 ≈ 0.02。昼は 1.0 のまま', () => {
    expect(skyBrightness(15, C.nightDarken)).toBeCloseTo(lightBrightness(4) * 0.16, 6);
    expect(skyBrightness(15, C.nightDarken)).toBeCloseTo(0.02, 2);
    expect(skyBrightness(15, 0)).toBeCloseTo(1, 6);
  });
  it('どうくつ（空の光 0）は かけない: 0.045 のまま。入り口は なめらか', () => {
    expect(skyBrightness(0, C.nightDarken)).toBeCloseTo(C.minBrightness, 6);
    expect(nightSkyFactor(0, C.nightDarken)).toBe(1);
    expect(nightSkyFactor(2, C.nightDarken)).toBeGreaterThan(nightSkyFactor(4, C.nightDarken));
    expect(nightSkyFactor(4, C.nightDarken)).toBeCloseTo(0.16, 6);
    expect(nightSkyFactor(15, C.nightDarken)).toBeCloseTo(0.16, 6);
  });
  it('夕方（段数が半分）は 昼と夜の間', () => {
    const f = nightSkyFactor(15, C.nightDarken / 2);
    expect(f).toBeCloseTo(0.58, 6);
  });
  it('combinedBrightness: たいまつの 3 だんかいは 夜でも そのまま', () => {
    expect(combinedBrightness(15, C.nightDarken, 14)).toBeCloseTo(C.torchBrightBrightness, 6);
    expect(combinedBrightness(15, C.nightDarken, 0)).toBeCloseTo(0.02, 2);
  });
  it('夜の度合い nt は skyDarkness の入れ物で一緒に動く。isDarkForSpawn・level は変えない', () => {
    const d = new SkyDarkness();
    d.value = C.nightDarken;
    expect(d.night).toBe(1);
    d.value = C.nightDarken / 2;
    expect(d.nightUniform.value).toBeCloseTo(0.5, 6);
    expect(isDarkForSpawn(15, C.nightDarken, 0)).toBe(true);
    expect(isDarkForSpawn(15, 0, 0)).toBe(false);
  });
  it('既定: 妖怪の下限 0・作物の下限 0（自分のキャラ dollMin は 0.3 のまま）', () => {
    expect(C.yokaiMin).toBe(0);
    expect(C.dollMin).toBe(0.3);
    expect(M7_SETTING_DEFAULTS.farmRipeMinBrightness).toBe(0);
  });
});
