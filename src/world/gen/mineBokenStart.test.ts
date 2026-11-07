import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GOLDEN_FILE, golden1D, pathHashOf, shaftG, type Golden1D } from './mineBokenGolden';
import { hookCave, needCaveHook } from './mineCaveKit';
import { hookE, needBokenHook } from './mineBokenKit';
import { SEEDS_20, hook1c } from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * MINE-1E（docs/design/MINE-1E.md §2・§4.13・受け入れ基準 E15）: はじまりの 坑道は 1C・1D の 形の まま。
 *
 *   新しい 世界 20 シード ぜんぶ: `gen: 'c'`・`style` が null・`shaftPath`〔ハッシュ〕・入口・横穴が 1D の あとと 同じ。
 *   なかほどの いちばん 上の 横穴の 先が ほたるの ほらあな〔D8〕。
 *   見本 `src/save/__fixtures__/mine1d-before.json` は 1E を 入れる 前の main〔1D 入り。SAVE_GEN 6〕で 作る:
 *     MAKE_1D_GOLDEN=1 npx vitest run src/world/gen/mineBokenStart.test.ts -t '見本を 作る'
 *   〔見本は 書きかえて 通さない。E16 の 古い 保存の 確かめ〔src/save/mine1eSave.test.ts〕も 同じ 見本を 読む〕
 *   スタートの 見え方の 描画回数は E2E〔e2e/mine1e.spec.ts〕。
 */

vi.setConfig({ testTimeout: 600_000 });

describe('見本を 作る', () => {
  it.skipIf(!process.env['MAKE_1D_GOLDEN'])('1D の あとの 形〔20 シードの はじまりの 坑道・スタートに 近い 坑道〕を 作る〔1D 入りの main で 1 回〕', () => {
    const starts: Golden1D['starts'] = {};
    for (const seed of SEEDS_20) {
      const h = hook1c(seed);
      const s = h.startShaft();
      starts[String(seed)] = shaftG(s, h.shaftPath(s.id));
    }
    const h = hook1c(SEEDS_20[0]!);
    const sp = spawnOf(SEEDS_20[0]!);
    const near = h
      .shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535)
      .filter((x) => !x.start)
      .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z))
      .slice(0, 40)
      .map((x) => shaftG(x, h.shaftPath(x.id)));
    writeFileSync(GOLDEN_FILE, JSON.stringify({ starts, near } satisfies Golden1D));
    expect(near.length).toBeGreaterThan(10);
  });
});

describe('E15: はじまりの 坑道〔新しい 世界 20 シード〕は 1C・1D の 形の まま', () => {
  it('`gen` は \'c\'・`style` は null・`shaftPath` が 1D の あとと 同じ〔ハッシュ〕・入口・横穴〔どこから どこへ・end・当たり〕も 同じ', () => {
    const gold = golden1D();
    const bad: string[] = [];
    for (const seed of SEEDS_20) {
      const h = hookE(seed);
      needBokenHook(h, ['startShaft', 'shaftPath']);
      const s = h.startShaft();
      const g = gold.starts[String(seed)]!;
      const tag = `seed ${seed}`;
      if (s.gen !== 'c') bad.push(`${tag}: gen が ${String(s.gen)}〔'c' の はず〕`);
      if (s.style !== null) bad.push(`${tag}: style が ${JSON.stringify(s.style)}〔null の はず〕`);
      if (s.id !== g.id) bad.push(`${tag}: id ${s.id}〔${g.id} の はず〕`);
      if (JSON.stringify([s.entrance.x, s.entrance.y, s.entrance.z]) !== JSON.stringify([g.entrance.x, g.entrance.y, g.entrance.z])) bad.push(`${tag}: 入口が ちがう`);
      const path = h.shaftPath(s.id);
      if (path.length !== g.pathLength) bad.push(`${tag}: 道の 長さ ${path.length}〔${g.pathLength} の はず〕`);
      if (pathHashOf(path) !== g.pathHash) bad.push(`${tag}: shaftPath が 1D の あとと ちがう`);
      const sides = s.sides.map((d) => ({ layer: d.layer, from: d.from, to: d.to, end: d.end, heyaHit: d.heyaHit === true }));
      if (JSON.stringify(sides) !== JSON.stringify(g.sides)) bad.push(`${tag}: 横穴が 1D の あとと ちがう`);
      if (s.floors !== undefined && s.floors.length > 0) bad.push(`${tag}: 階が ある〔1C の 形に 階は ない〕`);
      if (s.camp || s.maze || (s.branches ?? []).length > 0) bad.push(`${tag}: キャンプ・迷路・えだ道が ある〔はじまりの 坑道には ない〕`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('なかほどの いちばん 上の 横穴の 先が ほたるの ほらあな〔D8。当たりは その 1 本 だけ・end は cave〕', () => {
    const bad: string[] = [];
    for (const seed of SEEDS_20) {
      const h = hookCave(seed);
      needCaveHook(h, ['startShaft', 'caves']);
      const start = h.startShaft();
      const hits = start.sides.filter((d) => d.heyaHit === true);
      if (hits.length !== 1) {
        bad.push(`seed ${seed}: 当たりの 横穴 ${hits.length} 本`);
        continue;
      }
      const hit = hits[0]!;
      const naka = start.sides.filter((d) => d.layer === 'nakahodo');
      const topY = Math.max(...naka.map((d) => d.from.y));
      if (hit.from.y !== topY) bad.push(`seed ${seed}: 当たりが いちばん 上の 横穴でない`);
      if (hit.end !== 'cave') bad.push(`seed ${seed}: end ${hit.end}`);
      const cave = h.caves(hit.to.x - 40, hit.to.z - 40, hit.to.x + 40, hit.to.z + 40).find((c) => c.id === hit.cave);
      if (!cave || cave.kind !== 'hotaru') bad.push(`seed ${seed}: 先が ほたるの ほらあなでない〔${cave?.kind}〕`);
    }
    expect(bad).toEqual([]);
  });

  it('同じ シードは いつも 同じ はじまりの 坑道〔窓口を 作りなおしても〕', () => {
    for (const seed of SEEDS_20.slice(0, 5)) {
      const a = hookE(seed);
      const b = hookE(seed);
      needBokenHook(a, ['startShaft', 'shaftPath']);
      expect(pathHashOf(b.shaftPath(b.startShaft().id))).toBe(pathHashOf(a.shaftPath(a.startShaft().id)));
    }
  });
});
