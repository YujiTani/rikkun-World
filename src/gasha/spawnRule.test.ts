import { describe, expect, it } from 'vitest';
import { createRng } from '../world/gen/random';
import { RELEASE } from './releaseTuning';
import { dayRng, faceYawDeg, gashaEnabled, horizontalDistance, pickSpawnSpot, rollMorning, shouldDespawn } from './spawnRule';

const S = RELEASE.spawn;

describe('出る 日の くじ（あさごとに 約 3 割）', () => {
  it('同じ（世界の シード, 何日目）なら いつも 同じ 答え（乱数は シード付き）', () => {
    for (let day = 0; day < 40; day++) {
      expect(rollMorning(777, day).appear).toBe(rollMorning(777, day).appear);
    }
    expect(dayRng(1, 5)()).toBe(dayRng(1, 5)());
    expect(dayRng(1, 5)()).not.toBe(dayRng(1, 6)());
    expect(dayRng(1, 5)()).not.toBe(dayRng(2, 5)());
  });

  it('1 万日 ためすと 出る 割合は 調整表の 確率（0.3）に ちかい', () => {
    let n = 0;
    const days = 10_000;
    for (let d = 0; d < days; d++) if (rollMorning(20260, d).appear) n++;
    expect(n / days).toBeGreaterThan(S.chancePerMorning - 0.03);
    expect(n / days).toBeLessThan(S.chancePerMorning + 0.03);
  });

  it('確率 0 なら 出ない、1 なら かならず 出る（表を かえる だけで 直せる）', () => {
    expect(rollMorning(5, 3, { ...S, chancePerMorning: 0 }).appear).toBe(false);
    expect(rollMorning(5, 3, { ...S, chancePerMorning: 1 }).appear).toBe(true);
  });

  it('シードが ちがえば 出る 日の ならびも ちがう', () => {
    const a = Array.from({ length: 60 }, (_, d) => rollMorning(1, d).appear);
    const b = Array.from({ length: 60 }, (_, d) => rollMorning(2, d).appear);
    expect(a).not.toEqual(b);
  });
});

describe('出る 場所（プレイヤーから 150〜250 ブロック）', () => {
  const player = { x: 1000.5, z: -300.5 };
  const allLand = () => true;

  it('距離は いつも 調整表の 最小〜最大の あいだ、向きは ばらける', () => {
    const rng = createRng(11);
    const angles = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const spot = pickSpawnSpot(rng, player, allLand)!;
      expect(spot).not.toBeNull();
      const d = horizontalDistance(player, spot);
      expect(d).toBeGreaterThanOrEqual(S.minDistance - 1e-6);
      expect(d).toBeLessThanOrEqual(S.maxDistance + 1e-6);
      expect(d).toBeCloseTo(spot.distance, 6);
      angles.add(Math.round(spot.angleDeg / 45));
    }
    expect(angles.size).toBeGreaterThanOrEqual(7); // 8 方向 ちかく ばらける
  });

  it('同じ 乱数なら 同じ 場所（シード付き）', () => {
    const a = pickSpawnSpot(createRng(5), player, allLand)!;
    const b = pickSpawnSpot(createRng(5), player, allLand)!;
    expect(a).toEqual(b);
  });

  it('表を かえると 距離も かわる', () => {
    const t = { ...S, minDistance: 40, maxDistance: 60 };
    for (let i = 0; i < 50; i++) {
      const d = pickSpawnSpot(createRng(i), player, allLand, t)!.distance;
      expect(d).toBeGreaterThanOrEqual(40);
      expect(d).toBeLessThanOrEqual(60);
    }
  });

  it('海・水の 上は さける: 置く 場所と まわりの 4 点が ぜんぶ 陸の 向きだけ えらぶ', () => {
    // 東がわ（x が 大きい 方）は 全部 海
    const land = (x: number) => x < player.x;
    for (let i = 0; i < 100; i++) {
      const spot = pickSpawnSpot(createRng(100 + i), player, (x) => land(x))!;
      expect(spot).not.toBeNull();
      expect(spot.x + S.landProbeRadius).toBeLessThan(player.x);
    }
  });

  it('どの 向きも 海なら null（その 日は 出ない）', () => {
    expect(pickSpawnSpot(createRng(1), player, () => false)).toBeNull();
  });

  it('プレイヤーの 向き yawDeg で 前に 立つと その 場所が 前方（gashaBig の place が 前に 置く ため）', () => {
    for (let i = 0; i < 20; i++) {
      const spot = pickSpawnSpot(createRng(i), player, allLand)!;
      const y = (faceYawDeg(spot.dx, spot.dz) * Math.PI) / 180;
      // プレイヤーの 前方 = (sin yaw, -cos yaw)（gashaBig.ts の fwdOf と おなじ）
      expect(Math.sin(y)).toBeCloseTo(spot.dx, 6);
      expect(-Math.cos(y)).toBeCloseTo(spot.dz, 6);
    }
  });
});

describe('遠く はなれると 消える', () => {
  it('調整表の 距離を こえたら 消す（ちょうどは まだ）', () => {
    expect(shouldDespawn(S.despawnDistance - 1)).toBe(false);
    expect(shouldDespawn(S.despawnDistance)).toBe(false);
    expect(shouldDespawn(S.despawnDistance + 1)).toBe(true);
    expect(shouldDespawn(100, { ...S, despawnDistance: 50 })).toBe(true);
  });

  it('消える 距離は 出る 最大の 距離より 遠い（出た とたんに 消えない）', () => {
    expect(S.despawnDistance).toBeGreaterThan(S.maxDistance);
  });
});

describe('いつ 出して よいか（gashaEnabled）', () => {
  it('ふだんは オン。?gasha=off と 自動テスト（webdriver）と 試作ページ（?proto=）では オフ', () => {
    expect(gashaEnabled('', false)).toBe(true);
    expect(gashaEnabled('?gasha=off', false)).toBe(false);
    expect(gashaEnabled('', true)).toBe(false);
    expect(gashaEnabled('?proto=gashaBig', false)).toBe(false);
    expect(gashaEnabled('?proto=gashaGirl', false)).toBe(false);
  });
  it('?gasha=on は 自動テストでも 出す', () => {
    expect(gashaEnabled('?gasha=on', true)).toBe(true);
  });
});
