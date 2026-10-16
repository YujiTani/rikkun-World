// #144 SHADOW-1 の受け入れテスト（ユニット層: AC5・AC13）。実装の前に書いた。
// 実装がまだ無いので、読みこみは動的 import（変数の道すじ）。developer は実装を入れたら
//   1. 下の load* を `import { shadowLight } from './shadowLight'` のふつうの import にかえ、
//   2. `it.fails` を `it` にかえる。
// 決まり: docs/design/SHADOW.md §5.1（強さ）・§5.2（地図のカメラ）・§8（AC5・AC13）。
import { describe, expect, it } from 'vitest';
import { createTimeSettings } from '../../../time/config';

const LIGHT = './shadowLight';
const CAMERA = './shadowCamera';

/**
 * shadowLight(dayTick, settings) → { body: 'sun'|'moon', dir: {x,y,z}（地面→光。単位ベクトル。sunMoonPose + skyDirection と同じ）,
 *   mapDir: dir の y を 0.05 以上に上げた単位ベクトル（真横の地図をさける）, strength: 0..1（月は × 0.5） }
 */
type Light = { body: 'sun' | 'moon'; dir: V; mapDir: V; strength: number };
type V = { x: number; y: number; z: number };
const loadLight = async (): Promise<(t: number, s: ReturnType<typeof createTimeSettings>) => Light> => (await import(/* @vite-ignore */ LIGHT)).shadowLight;
/**
 * snapMapCenter(center, mapDir, half, size) → 地図のカメラの中心（世界の座標）。
 * 右 = normalize(mapDir.y, -mapDir.x, 0)、上 = mapDir × 右 としたとき、中心の（右, 上）の値が 1 目（= 2*half/size）の整数倍。
 * 奥行きの値はそのまま。
 */
const loadSnap = async (): Promise<(c: V, dir: V, half: number, size: number) => V> => (await import(/* @vite-ignore */ CAMERA)).snapMapCenter;

const S = createTimeSettings();
const DAY_LEN = S.dayTicks + S.duskTicks + S.nightTicks + S.dawnTicks;
const smooth = (y: number) => {
  const t = Math.min(1, Math.max(0, (y - 0.03) / 0.22));
  return t * t * (3 - 2 * t);
};

describe('SHADOW AC5: 影の強さ', () => {
  it.fails('表の値（SHADOW.md §5.1）と同じ: smoothstep(L.y, 0.03, 0.25)、月は × 0.5', async () => {
    const light = await loadLight();
    const table: [number, number][] = [[0, 0], [1800, 0.19], [3600, 0.78], [9000, 1], [14000, 1], [29700, 1], [55600, 0.84], [67400, 0.5]];
    for (const [t, want] of table) expect(light(t, S).strength, `tick ${t}`).toBeCloseTo(want, 1);
    expect(light(14000, S).body).toBe('sun');
    expect(light(67400, S).body).toBe('moon');
  });

  it.fails('L.y < 0.03 のとき強さ 0（1 日ぜんぶの tick を調べる）。向きは単位ベクトル、mapDir.y ≥ 0.05', async () => {
    const light = await loadLight();
    let low = 0;
    for (let t = 0; t < DAY_LEN; t += 7) {
      const l = light(t, S);
      expect(Math.hypot(l.dir.x, l.dir.y, l.dir.z)).toBeCloseTo(1, 6);
      expect(Math.hypot(l.mapDir.x, l.mapDir.y, l.mapDir.z)).toBeCloseTo(1, 6);
      expect(l.mapDir.y).toBeGreaterThanOrEqual(0.05 - 1e-9);
      if (l.dir.y < 0.03) {
        low++;
        expect(l.strength, `tick ${t}`).toBe(0);
      } else {
        expect(l.strength).toBeCloseTo(smooth(l.dir.y) * (l.body === 'moon' ? 0.5 : 1), 6);
      }
    }
    expect(low).toBeGreaterThan(0); // 低い tick が本当にあった（調べたことになっている）
  });

  it.fails('太陽→月・月→太陽の切りかわりと 1 日のつなぎ目の前後 1 tick で、強さが 0.1 以上とばない（1 日ぜんぶ）', async () => {
    const light = await loadLight();
    let prev = light(DAY_LEN - 1, S).strength;
    for (let t = 0; t < DAY_LEN; t++) {
      const cur = light(t, S).strength;
      expect(Math.abs(cur - prev), `tick ${t - 1} → ${t}`).toBeLessThan(0.1);
      prev = cur;
    }
    const swap = S.dayTicks + S.duskTicks; // 太陽 → 月
    expect(Math.abs(light(swap, S).strength - light(swap - 1, S).strength)).toBeLessThan(0.1);
  });
});

describe('SHADOW AC13: 地図のカメラは 1 目単位でしか動かない', () => {
  it.fails('中心を 0.1 ブロックずつ動かしても、（右, 上）の値は 1 目の整数倍。1 目より小さく動いたら同じ所に止まる', async () => {
    const snap = await loadSnap();
    const half = 32;
    const size = 2048;
    const texel = (2 * half) / size;
    for (const dir of [{ x: 0.72, y: 0.65, z: 0.24 }, { x: -0.95, y: 0.19, z: 0.24 }, { x: 0, y: 0.97, z: 0.24 }]) {
      const n = Math.hypot(dir.x, dir.y, dir.z);
      const d = { x: dir.x / n, y: dir.y / n, z: dir.z / n };
      const rn = Math.hypot(d.y, d.x);
      const right = { x: d.y / rn, y: -d.x / rn, z: 0 };
      const up = { x: d.y * right.z - d.z * right.y, y: d.z * right.x - d.x * right.z, z: d.x * right.y - d.y * right.x };
      const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
      let last: V | null = null;
      let moved = 0;
      let same = 0;
      for (let i = 0; i < 60; i++) {
        const c = { x: 100.3 + i * 0.1, y: 20.7, z: -50.2 + i * 0.1 };
        const s = snap(c, d, half, size);
        const r = dot(s, right) / texel;
        const u = dot(s, up) / texel;
        expect(Math.abs(r - Math.round(r)), 'right').toBeLessThan(1e-3);
        expect(Math.abs(u - Math.round(u)), 'up').toBeLessThan(1e-3);
        if (last) {
          const dr = (dot(s, right) - dot(last, right)) / texel;
          const du = (dot(s, up) - dot(last, up)) / texel;
          if (Math.abs(dr) < 1e-6 && Math.abs(du) < 1e-6) same++;
          else moved++;
        }
        last = s;
      }
      // 0.1 ブロック = 3.2 目。動くときは 1 目以上、でも毎回は動かない（光の向きによっては 0.1 が 1 目より大きいので「same」は 0 でもよい）
      expect(moved).toBeGreaterThan(0);
      expect(same).toBeGreaterThanOrEqual(0);
    }
    // 1 目の 1/10 だけ動かしたら、ほとんど同じ所に止まる
    const d = { x: 0.6, y: 0.8, z: 0 };
    const a = snap({ x: 10, y: 10, z: 10 }, d, half, size);
    const b = snap({ x: 10.0004, y: 10, z: 10 }, d, half, size);
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(dist === 0 || Math.abs(dist - texel) < 1e-3).toBe(true);
  });
});
