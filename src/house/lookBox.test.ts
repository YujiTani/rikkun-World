import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { doorIndex, windowMax } from './editor/model';
import { SIZES } from './editor/tuning';
import { houseShape } from './shape';
import { ALL_KINDS, PART_FORMS, STYLES, kindsOfForm, splitKind } from './recipes/kinds';
import { findSitesH, houseBox, isRoofTop, lookBp, siteOkH } from './recipes/lookKit';
import { findSites, siteOk, type SiteWorld } from './build/sites';
import { HouseBuilder, type ActiveBuild } from './build/builder';
import { makeFakeWorld } from './fakeWorld';

/**
 * HOUSE-2B AC10（仕様 3.3 版 §4.2・§6.2）: 家の 箱（houseBox）の 高さ・案で かわらない・建てた ブロックが 箱の 外に ない・建てられる 場所は 床の 上 H − 1 段。
 * 窓口の 名前は src/house/recipes/lookKit.ts の「2B の 約束」。高さの 表は ここに 書いた 計算（仕様 §4.2）で、実装の 表を 写さない。
 */

const ROOFS = ALL_KINDS.roof;
const DECOS = ALL_KINDS.deco;
/** 仕様 §4.2 の 表 */
const wantH = (roof: string, decos: readonly string[]): number => {
  const top = decos.some(isRoofTop);
  if (roof === 'none') return 4;
  if (roof === 'flat') return top ? 6 : 5;
  return top ? 8 : 7;
};
/** かざりの 組み合わせ（なし・1 つずつ・ぜんぶ〔形ごとに 1 つ。同じ 案で そろえる〕） */
function decoSets(style: (typeof STYLES)[number]): string[][] {
  const all = PART_FORMS.deco.map((f) => (f === 'shachi' ? 'shachi' : `${f}_${style}`));
  return [[], ...DECOS.map((k) => [k]), all];
}
const bpOf = (over: Parameters<typeof lookBp>[0]) => lookBp(over);

describe('AC10: houseBox の 高さ（§4.2 の 表）', () => {
  it('やね ぜんぶ × かざり（なし・1 つずつ・ぜんぶ）× 3 つの 大きさ: よこ・たては 外の 寸法、高さは 表どおり', () => {
    let tried = 0;
    for (const roof of ROOFS) {
      const style = splitKind(roof).style ?? 'mura';
      for (const deco of decoSets(style)) {
        for (const w of SIZES) {
          tried++;
          const bp = bpOf({ w, d: w, windows: 2, roof: roof as never, deco: deco as never });
          expect(houseBox(bp), `${roof} ＋ [${deco}] ${w}×${w}`).toEqual({ w: w + 2, d: w + 2, h: wantH(roof, deco) });
        }
      }
    }
    expect(tried, '表から 数えた ぶん 回した').toBeGreaterThan(ROOFS.length);
  });

  it('やねの 上に つかない かざり（のれん・はなだん）では 高さは かわらない。やね なしは かざりが あっても 4', () => {
    for (const roof of ROOFS) {
      const base = houseBox(bpOf({ windows: 2, roof: roof as never })).h;
      for (const kind of DECOS.filter((k) => !isRoofTop(k))) {
        expect(houseBox(bpOf({ windows: 2, roof: roof as never, deco: [kind] as never })).h, `${roof} ＋ ${kind}`).toBe(base);
      }
    }
    for (const kind of DECOS) expect(houseBox(bpOf({ roof: 'none', deco: [kind] as never })).h, `やね なし ＋ ${kind}`).toBe(4);
  });

  it('案（むら・おしろ・こうざん）で かわらない: 同じ 形の 3 案で houseBox が 同じ（やね・かざり）', () => {
    for (const part of ['roof', 'deco'] as const) {
      for (const form of PART_FORMS[part]) {
        const boxes = kindsOfForm(form).map((k) => JSON.stringify(houseBox(part === 'roof' ? bpOf({ windows: 2, roof: k as never, deco: ['entotsu_mura'] }) : bpOf({ windows: 2, roof: 'sankaku_mura', deco: [k as never] }))));
        expect(new Set(boxes).size, `${form}: ${boxes.join(' / ')}`).toBe(1);
      }
    }
    expect(STYLES.length, '3 つの 案').toBeGreaterThan(1);
  });

  it('かべ・まどの「なし」と かべ・まど・との 案では 高さ・外の 寸法が かわらない', () => {
    for (const roof of ROOFS) {
      const decos = ['shachi'] as never;
      const base = houseBox(bpOf({ windows: 4, roof: roof as never, deco: decos }));
      const variants = [
        ...ALL_KINDS.wall.map((k) => bpOf({ windows: 4, roof: roof as never, deco: decos, wall: k as never })),
        ...ALL_KINDS.window.map((k) => bpOf({ windows: 4, roof: roof as never, deco: decos, windowKind: k as never })),
        ...ALL_KINDS.door.map((k) => bpOf({ windows: 4, roof: roof as never, deco: decos, door: k as never })),
      ];
      for (const v of variants) expect(houseBox(v), `${roof} ＋ かべ ${v.wall}・まど ${v.windowKind}・と ${v.door}`).toEqual(base);
    }
  });
});

describe('AC10: 建てた 家の ブロックは 箱の 外に ない（3 案 とも・おしろの のき・しゃちほこ も）', () => {
  /** 箱の ぜんぶの マスが 1 回ずつ 入って いて、外へ 出る マスは ない */
  function inBox(bp: ReturnType<typeof lookBp>, label: string): void {
    const box = houseBox(bp);
    const s = houseShape(bp);
    expect([s.outerW, s.outerD], `${label}: 外の よこ・たて`).toEqual([box.w, box.d]);
    expect(s.cells, `${label}: 箱の ぜんぶの マス`).toHaveLength(box.w * box.d * box.h);
    const seen = new Set<string>();
    for (const c of s.cells) {
      expect(c.x >= 0 && c.x < box.w && c.z >= 0 && c.z < box.d && c.y >= 0 && c.y < box.h, `${label}: (${c.x},${c.y},${c.z}) ${c.id} が 箱の 外`).toBe(true);
      seen.add(`${c.x},${c.y},${c.z}`);
    }
    expect(seen.size, `${label}: マスの 重なり なし`).toBe(s.cells.length);
  }

  it('やね ぜんぶ × かざり（なし・1 つずつ・ぜんぶ）× いちばん 大きい 家と 小さい 家', () => {
    for (const roof of ROOFS) {
      const style = splitKind(roof).style ?? 'mura';
      for (const deco of decoSets(style)) {
        for (const w of [SIZES[0]!, SIZES[SIZES.length - 1]!]) {
          const bp = bpOf({ w, d: w, windows: windowMax({ w, d: w }), roof: roof as never, deco: deco as never });
          inBox(bp, `${roof} ＋ [${deco}] ${w}×${w}`);
        }
      }
    }
  });

  it('かべ・まど・と・かざり ぜんぶを 同じ 案で そろえた 家（3 案 それぞれ）・かべ なし・まど なし でも 箱の 中', () => {
    for (const style of STYLES) {
      const pickOf = (part: 'roof' | 'wall' | 'window' | 'door'): string[] => ALL_KINDS[part].filter((k) => splitKind(k).style === style);
      for (const roof of pickOf('roof')) for (const wall of [...pickOf('wall'), 'none']) for (const win of [...pickOf('window'), 'none']) for (const door of pickOf('door')) {
        const bp = bpOf({ w: 9, d: 9, windows: windowMax({ w: 9, d: 9 }), roof: roof as never, wall: wall as never, windowKind: win as never, door: door as never, deco: decoSets(style).at(-1) as never });
        inBox(bp, `${style}: ${roof}・${wall}・${win}・${door}`);
      }
    }
  });
});

// ---- 建てられる 場所（床の 上 H − 1 段）
function world() {
  const edits = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const w: SiteWorld & { set(x: number, y: number, z: number, id: BlockId): void; fillK(x: number, y: number, z: number, ww: number, dd: number): void } = {
    getBlock: (x, y, z) => edits.get(key(x, y, z)) ?? (y < 10 ? 'dirt' : 'air'),
    set: (x, y, z, id) => void edits.set(key(x, y, z), id),
    fillK(x0, y, z0, ww, dd) {
      for (let z = z0; z < z0 + dd; z++) for (let x = x0; x < x0 + ww; x++) edits.set(key(x, y, z), 'katame_tsuchi' as BlockId);
    },
  };
  return w;
}
const DOOR5 = 1 + doorIndex({ w: 5, d: 5 });
const FLOOR = 9; // かためた つちの 段（床の 段）。床の 上 n 段目 ＝ FLOOR + n

describe('AC10: 建てられる 場所は 床の 上 H − 1 段を しらべる', () => {
  it('床の 上 6 段目に 石: ななめの やね（H 7）は 置けない・たいらの やね（H 5）は 置ける。7 段目は H 8 だけ 置けない', () => {
    const w = world();
    w.fillK(30, FLOOR, 30, 7, 7);
    w.set(32, FLOOR + 6, 32, 'stone');
    expect(siteOkH(w, 30, FLOOR, 30, 7, 7, DOOR5, 7), 'H 7: 6 段目まで しらべる').toBe(false);
    expect(siteOkH(w, 30, FLOOR, 30, 7, 7, DOOR5, 8), 'H 8').toBe(false);
    expect(siteOkH(w, 30, FLOOR, 30, 7, 7, DOOR5, 5), 'H 5: 4 段目まで').toBe(true);
    expect(siteOkH(w, 30, FLOOR, 30, 7, 7, DOOR5, 6), 'H 6: 5 段目まで').toBe(true);
    const w2 = world();
    w2.fillK(30, FLOOR, 30, 7, 7);
    w2.set(32, FLOOR + 7, 32, 'stone');
    expect(siteOkH(w2, 30, FLOOR, 30, 7, 7, DOOR5, 7), 'H 7: 7 段目は しらべない').toBe(true);
    expect(siteOkH(w2, 30, FLOOR, 30, 7, 7, DOOR5, 8), 'H 8: 7 段目まで しらべる').toBe(false);
    expect(siteOkH(w2, 30, FLOOR, 30, 7, 7, DOOR5, 4), 'H 4（やね なし）').toBe(true);
  });

  it('H を わたさない 呼び方は 今まで どおり（上 4 段）', () => {
    const w = world();
    w.fillK(30, FLOOR, 30, 7, 7);
    w.set(32, FLOOR + 5, 32, 'stone');
    expect(siteOk(w, 30, FLOOR, 30, 7, 7, DOOR5)).toBe(true);
    w.set(32, FLOOR + 4, 32, 'stone');
    expect(siteOk(w, 30, FLOOR, 30, 7, 7, DOOR5)).toBe(false);
  });

  it('消える 草花は H に よらず 場所に なる。H の 高さまで 草花を 消せる ように しらべる だけ（石は ふさぐ）', () => {
    const w = world();
    w.fillK(30, FLOOR, 30, 7, 7);
    w.set(31, FLOOR + 6, 31, 'kusa');
    expect(siteOkH(w, 30, FLOOR, 30, 7, 7, DOOR5, 7)).toBe(true);
  });

  it('findSites も H を うけとる（6 段目に 石 → H 7 は 0 か所・H 5 は 1 か所）', () => {
    const w = world();
    w.fillK(30, FLOOR, 30, 7, 7);
    w.set(32, FLOOR + 6, 32, 'stone');
    expect(findSitesH(w, 33, 10, 33, 7, 7, DOOR5, 7)).toEqual([]);
    expect(findSitesH(w, 33, 10, 33, 7, 7, DOOR5, 5)).toEqual([{ x: 30, y: FLOOR, z: 30 }]);
    expect(findSites(w, 33, 10, 33, 7, 7, DOOR5), 'H なしは 今まで どおり').toEqual([{ x: 30, y: FLOOR, z: 30 }]);
  });
});

describe('AC10: 建築中の 場所の 守り（locked）も 家の 箱の 高さまで', () => {
  const AT = { x: 40, y: 9, z: 40 };
  function lockedTop(over: object): { top: number; above: boolean } {
    const world2 = makeFakeWorld({ height: () => 9 });
    const b = new HouseBuilder({ world: world2, record: () => undefined as never, shape: () => undefined });
    const bp = { w: 5, d: 5, windows: 2, furniture: [], name: { front: 'もも', back: 'のいえ' }, ...over } as unknown as ActiveBuild['bp'];
    expect(b.start({ number: 1, bp, at: AT, architect: 'first', home: { x: 30, y: 10, z: 30 } }, 1000)).toBe(true);
    let top = -1;
    for (let dy = 0; dy < 12; dy++) if (b.locked(AT.x + 3, AT.y + dy, AT.z + 3)) top = dy;
    return { top, above: b.locked(AT.x + 3, AT.y + top + 1, AT.z + 3) };
  }
  it('たいら 5・たいら＋かざり 6・ななめ 7・ななめ＋かざり 8・やね なし 4（locked の いちばん 上の 段 ＝ H − 1）', () => {
    expect(lockedTop({ roof: 'flat' }).top, 'たいら').toBe(4);
    expect(lockedTop({ roof: 'flat', deco: ['shachi'] }).top, 'たいら ＋ しゃちほこ').toBe(5);
    expect(lockedTop({ roof: 'kawara_shiro' }).top, 'ななめ').toBe(6);
    expect(lockedTop({ roof: 'kawara_shiro', deco: ['shachi'] }).top, 'ななめ ＋ しゃちほこ').toBe(7);
    expect(lockedTop({ roof: 'none' }).top, 'やね なし').toBe(3);
    expect(lockedTop({ roof: 'kawara_shiro', deco: ['shachi'] }).above).toBe(false);
  });
  it('やね・かざりの ない せっけいず（今までの 形）は 今まで どおり 5', () => {
    expect(lockedTop({}).top).toBe(4);
  });
});
