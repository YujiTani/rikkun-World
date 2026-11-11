import { describe, expect, it } from 'vitest';
import type { Blueprint } from './editor/blueprint';
import { windowMax } from './editor/model';
import { SIZES } from './editor/tuning';
import { ALL_KINDS, LIGHT_KINDS, PART_FORMS, STYLES, kindsOfForm, splitKind } from './recipes/kinds';
import { houseTriangles, lookBp } from './recipes/lookKit';

/**
 * HOUSE-2B AC12（仕様 3.3 版 §4.2・決定 2026-11-10 三角形 3,000）: いちばん 大きい 家（外 11×11・窓 いっぱい）に 各 ばしょで 三角形の いちばん 多い しゅるい（案を まぜて よい）と
 * かざり ぜんぶを つけても houseTriangles ≦ 3,000。あわせて 3 案 それぞれ だけで 組んだ いちばん 重い 家も ≦ 3,000。家具は のぞく（家具は 1 こ 300 まで〔今の まま〕）。
 * 3,000 は yuzu の 決定（2,000 から 上げた）。数は 家の 三角形の 上限で、足場の 三角形 2,000（build/plan.test.ts）とは 別。
 */

const CAP = 3000; // 三角形（家 1 けん・家具を のぞく）。2B の 決定
const BIG = SIZES[SIZES.length - 1]!; // 中の 9×9 ＝ 外 11×11
const BIG_WINDOWS = windowMax({ w: BIG, d: BIG });
const bigBp = (over: Partial<Blueprint>): Blueprint => lookBp({ w: BIG, d: BIG, windows: BIG_WINDOWS, furniture: [], ...over });

type SoloPart = 'roof' | 'wall' | 'window' | 'door';
const SOLO: readonly SoloPart[] = ['roof', 'wall', 'window', 'door'];
const withSolo = (part: SoloPart, kind: string): Partial<Blueprint> => ({ [part === 'window' ? 'windowKind' : part]: kind }) as Partial<Blueprint>;

/** かざり ぜんぶ（形ごとに 1 つ）。styleOf が かざりごとに 案を えらぶ（しゃちほこ は 案が ない） */
const decosBy = (styleOf: (form: string) => string): string[] => PART_FORMS.deco.map((f) => (f === 'shachi' ? 'shachi' : `${f}_${styleOf(f)}`));

describe('AC12: 家の 三角形（houseTriangles）の 上限 3,000', () => {
  it('いちばん 大きい 家（外 11×11・窓 いっぱい）: 窓口が 数を かえす（0 では ない）・なにも 足さない 家より かざりが ある 家が 多い', () => {
    const plain = houseTriangles(bigBp({}));
    expect(plain, 'いつもの 物の 家').toBeGreaterThan(0);
    const decorated = houseTriangles(bigBp({ deco: decosBy(() => 'shiro') as never }));
    expect(decorated, 'かざりを つけた 家').toBeGreaterThan(plain);
  });

  it('各 ばしょで 三角形の いちばん 多い しゅるい（案を まぜて よい）＋ かざり ぜんぶ ＋ あかり: ≦ 3,000', () => {
    const base = bigBp({});
    const heaviest = (part: SoloPart): string => {
      let best = '';
      let bestN = -1;
      for (const kind of ALL_KINDS[part]) {
        const n = houseTriangles({ ...base, ...withSolo(part, kind) });
        if (n > bestN) [best, bestN] = [kind, n];
      }
      return best;
    };
    const picks = Object.fromEntries(SOLO.map((p) => [p, heaviest(p)])) as Record<SoloPart, string>;
    // かざりは 形ごとに いちばん 多い 案
    const decos = PART_FORMS.deco.map((form) => {
      const kinds = kindsOfForm(form);
      return kinds.reduce((a, b) => (houseTriangles({ ...base, roof: 'sankaku_mura', deco: [b as never] }) > houseTriangles({ ...base, roof: 'sankaku_mura', deco: [a as never] }) ? b : a));
    });
    for (const light of LIGHT_KINDS) {
      const bp = bigBp({ roof: picks.roof as never, wall: picks.wall as never, windowKind: picks.window as never, door: picks.door as never, deco: decos as never, light });
      const n = houseTriangles(bp);
      expect(n, `いちばん 重い 組み合わせ ${JSON.stringify(picks)} ＋ ${decos} ＋ ${light}`).toBeLessThanOrEqual(CAP);
    }
  });

  for (const style of STYLES) {
    it(`案 ${style} だけで 組んだ いちばん 重い 家（やね・かべ・まど・と・かざり ぜんぶ）: ≦ 3,000`, () => {
      const base = bigBp({});
      const onlyStyle = (part: SoloPart): string[] => ALL_KINDS[part].filter((k) => splitKind(k).style === style);
      const heaviest = (part: SoloPart): string => onlyStyle(part).reduce((a, b) => (houseTriangles({ ...base, ...withSolo(part, b) }) > houseTriangles({ ...base, ...withSolo(part, a) }) ? b : a));
      // しゃちほこ は おしろの 行だけ（案が ない ので むら・こうざんの 家には 入れない）
      const decos = PART_FORMS.deco.filter((f) => f !== 'shachi' || style === 'shiro').map((f) => (f === 'shachi' ? 'shachi' : `${f}_${style}`));
      const bp = bigBp({
        roof: heaviest('roof') as never,
        wall: heaviest('wall') as never,
        windowKind: heaviest('window') as never,
        door: heaviest('door') as never,
        deco: decos as never,
      });
      const worst = houseTriangles(bp);
      expect(worst, `案 ${style}`).toBeLessThanOrEqual(CAP);
      expect(worst, `案 ${style}: 数えて いる（0 では ない）`).toBeGreaterThan(0);
    });
  }

  it('三角形は 家具に よらない（家具は のぞく）', () => {
    const noFurn = houseTriangles(bigBp({}));
    const withFurn = houseTriangles(bigBp({ furniture: [{ kind: 'table', x: 0, z: 0, rot: 0 }] as never }));
    expect(withFurn, '家具を のぞく').toBe(noFurn);
  });
});
