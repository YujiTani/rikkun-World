import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GADGET_TUNING } from '../../content/items/gadgetTuning';
import { bigSample, hookE, needBokenHook, type BokenShaft, type ESample } from './mineBokenKit';
import { DugCols, deadEndsOf, dugSetOf, lightProblemsE } from './mineBokenReport';
import { standable, type PathCell } from './mineShaftKit';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.5・§4.6・§4.8・§4.11・受け入れ基準 E3〔光〕・E10〔ちょうちんの まわり〕）: 明るさ。
 *
 *   光の 計算は 重い ので、ひびの ある 坑道・キャンプの ある 坑道・迷路の ある 坑道から 小さい 順に 少しだけ えらぶ〔計画の 標本から。数は 窓口の 表〕。
 *   ・E3: 作った ときの 足の マスぜんぶ〔かくしべや・ほった あとの ひびの 通り道も〕で ブロックの 光 6 以上・妖怪が 出る 暗さでない・こわれない たいまつ なし
 *   ・E10: ちょうちんの まわり〔`GADGET_TUNING.lantern.noSpawnRadius` マス の 立方体〕の 立てる マスは どこも 妖怪が 出る 暗さでない
 *         〔仕様の「妖怪の ためし 1,000 回で 出る 数 0」を、まわりの 立てる マス ぜんぶ〔1,000 回より きびしい〕で 置きかえた〕
 * 時間〔ms〕では 合否を きめない。赤の 確かめ: 1E の 前は「窓口が まだ ない」「1E の 坑道が ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 1200_000 });

const hasHibi = (s: BokenShaft): boolean => deadEndsOf(s).some((e) => e.kind === 'hibi_naka' || e.kind === 'hibi_oo');
const enough = (all: readonly ESample[]): boolean => all.filter((a) => hasHibi(a.shaft)).length >= 3 && all.filter((a) => a.shaft.camp).length >= 3 && all.filter((a) => a.shaft.maze).length >= 2;

interface Pick {
  seed: number;
  shaft: BokenShaft;
  path: PathCell[];
  dug: DugCols;
}
const picks: Pick[] = [];

beforeAll(() => {
  const { all } = bigSample(enough);
  const small = (xs: readonly ESample[], n: number): ESample[] => [...xs].sort((a, b) => (a.shaft.style?.size ?? 0) - (b.shaft.style?.size ?? 0)).slice(0, n);
  const chosen = new Map<string, ESample>();
  for (const a of [...small(all.filter((x) => hasHibi(x.shaft)), 3), ...small(all.filter((x) => x.shaft.camp), 3), ...small(all.filter((x) => x.shaft.maze), 2)]) chosen.set(`${a.seed}:${a.shaft.id}`, a);
  for (const a of chosen.values()) {
    const h = hookE(a.seed);
    needBokenHook(h, ['shaftPath']);
    picks.push({ seed: a.seed, shaft: a.shaft, path: h.shaftPath(a.shaft.id).filter((c) => (c.part as string) !== 'yakata'), dug: new DugCols(a.seed, dugSetOf(a.shaft)) });
  }
}, 1200_000);

describe('E3: 明るい', () => {
  it('光を しらべる 坑道が ある〔ひび・キャンプ・迷路〕', () => {
    expect(picks.length, '1E の 坑道が ない').toBeGreaterThanOrEqual(3);
    expect(picks.filter((p) => hasHibi(p.shaft)).length, 'ひびの ある').toBeGreaterThan(0);
    expect(picks.filter((p) => p.shaft.camp).length, 'キャンプの ある').toBeGreaterThan(0);
    expect(picks.filter((p) => p.shaft.maze).length, '迷路の ある').toBeGreaterThan(0);
  });

  it('作った ときの 足の マス ぜんぶで ブロックの 光 6 以上・isDarkForSpawn false〔迷路の 床・かくしべや・ほった あとの ひびの 通り道も〕。こわれない たいまつ なし', () => {
    expect(picks.length, '1E の 坑道が ない').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const p of picks) for (const m of lightProblemsE(p.dug, p.shaft, p.path).slice(0, 3)) bad.push(`seed ${p.seed} ${p.shaft.id}: ${m}`);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});

describe('E10: ちょうちんの まわりで 妖怪が 出ない', () => {
  it('ちょうちんの まわり〔noSpawnRadius の 立方体〕の 立てる マスは どこも 妖怪が 出る 暗さでない', () => {
    const R = GADGET_TUNING.lantern.noSpawnRadius;
    const bad: string[] = [];
    let cells = 0;
    for (const p of picks.filter((x) => x.shaft.camp)) {
      const c = p.shaft.camp!.lantern;
      const light = p.dug.lit(p.shaft.box);
      for (let x = c.x - R; x <= c.x + R; x++) {
        for (let z = c.z - R; z <= c.z + R; z++) {
          for (let y = c.y - R; y <= c.y + R; y++) {
            if (!standable(p.dug, x, y, z)) continue;
            cells++;
            if (light.isDarkForSpawn(x, y, z)) bad.push(`seed ${p.seed} ${p.shaft.id}: (${x}, ${y}, ${z}) は 妖怪が 出る 暗さ`);
          }
        }
      }
    }
    expect(cells, '調べた 立てる マス').toBeGreaterThan(25);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});
