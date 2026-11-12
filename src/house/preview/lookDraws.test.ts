import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX, BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { MAX_BLOCK_KINDS } from '../../world/blocks/maxBlockKinds';
import { emptyState, windowMax, type EditorState } from '../editor/model';
import { SIZES } from '../editor/tuning';
import { ALL_KINDS, LIGHT_KINDS, PART_FORMS, PARTS, STYLES, kindsOfForm, splitKind } from '../recipes/kinds';
import { allKindsOf, kindBlocks, previewDrawCalls, type LookPart } from '../recipes/lookKit';

/**
 * HOUSE-2B AC13（仕様 3.3 版 §6.2・HOUSE-1 AC34 ③）: 見本を 描いた コマの 描画回数が いちばん 多い 形（9×9・窓 いっぱい・ななめの やね・かざり 4 つ）で 3 案 どれでも 24 以下。
 * ブロックの 番号が 256 を こえない（1 マス 1 バイト）。描画回数の 数え方は lookKit の previewDrawCalls（2B の 約束）。
 * 本物の レンダラーで 数える AC34 ③ は e2e/house1b.spec.ts〔いちばん 大きい 形〕。ここは 家の しゅるいを 全部 まぜた 形を GPU なしで 見る。
 */

const MAX_CALLS = 24; // HOUSE-1 AC34 ③ の 上限（見本 1 コマの 描画回数）
const BIG = SIZES[SIZES.length - 1]!;
const MODES = ['outside', 'inside'] as const;

const state = (over: Partial<EditorState>): EditorState => ({ ...emptyState(), w: BIG, d: BIG, windows: windowMax({ w: BIG, d: BIG }), ...over });
/** ななめの やね（なし・たいら いがいの 形） */
const slopedRoofs = (style: (typeof STYLES)[number]): string[] => ALL_KINDS.roof.filter((k) => k !== 'none' && k !== 'flat' && splitKind(k).style === style);
const decosOf = (style: (typeof STYLES)[number]): string[] => PART_FORMS.deco.map((f) => (f === 'shachi' ? 'shachi' : `${f}_${style}`));

describe('AC13: 見本の 描画回数（9×9・窓 いっぱい・ななめの やね・かざり 4 つ）', () => {
  for (const style of STYLES) {
    it(`案 ${style}: やね ぜんぶ × かべ・まど・と ぜんぶ（同じ 案）× ① そと・② なか で ${MAX_CALLS} 以下`, () => {
      const pickOf = (part: 'wall' | 'window' | 'door'): string[] => ALL_KINDS[part].filter((k) => splitKind(k).style === style);
      let tried = 0;
      for (const mode of MODES) {
        for (const roof of slopedRoofs(style)) {
          for (const wall of [...pickOf('wall'), 'none']) for (const win of [...pickOf('window'), 'none']) for (const door of pickOf('door')) {
            tried++;
            const n = previewDrawCalls(state({ roof: roof as never, wall: wall as never, windowKind: win as never, door: door as never, deco: decosOf(style) as never, light: LIGHT_KINDS[LIGHT_KINDS.length - 1] }), mode);
            expect(n, `${style} ${mode}: ${roof}・${wall}・${win}・${door}`).toBeLessThanOrEqual(MAX_CALLS);
            expect(n, '見本を 描いて いる（0 では ない）').toBeGreaterThan(0);
          }
        }
      }
      expect(tried, '回した').toBeGreaterThan(0);
    });
  }

  it('案を まぜた 形（やね・かべ・まど・と・かざり ばらばらの 案）も ' + MAX_CALLS + ' 以下', () => {
    for (const mode of MODES) {
      for (let shift = 0; shift < STYLES.length; shift++) {
        const kindOf = (part: 'roof' | 'wall' | 'window' | 'door', n: number): string => kindsOfForm(PART_FORMS[part][1] ?? PART_FORMS[part][0]!)[(shift + n) % STYLES.length]!;
        const deco = PART_FORMS.deco.map((f, i) => (f === 'shachi' ? 'shachi' : kindsOfForm(f)[(shift + i) % STYLES.length]!));
        const n = previewDrawCalls(state({ roof: kindOf('roof', 0) as never, wall: kindOf('wall', 1) as never, windowKind: kindOf('window', 2) as never, door: kindOf('door', 1) as never, deco: deco as never }), mode);
        expect(n, `まぜ ${shift} ${mode}`).toBeLessThanOrEqual(MAX_CALLS);
      }
    }
  });

  it('かざりを ふやしても 箱ごとには 描かない: かざり 0 → 4 で ふえる 回数は かざりの 数 まで（まとめて 描く）。窓を ふやしても ふえない', () => {
    for (const mode of MODES) {
      const roof = slopedRoofs('shiro')[0]!;
      const decos = decosOf('shiro');
      const none = previewDrawCalls(state({ roof: roof as never, deco: [] }), mode);
      const four = previewDrawCalls(state({ roof: roof as never, deco: decos as never }), mode);
      expect(four - none, `${mode}: かざり ${decos.length} つで ふえる 回数`).toBeLessThanOrEqual(decos.length);
      const win0 = previewDrawCalls(state({ roof: roof as never, windows: 0 }), mode);
      const winMax = previewDrawCalls(state({ roof: roof as never }), mode);
      expect(winMax, `${mode}: 窓 いっぱいでも 窓 0 と 同じ 回数 か 1 つ ふえる だけ`).toBeLessThanOrEqual(win0 + 1);
    }
  });
});

describe('AC13: ブロックの 番号は MAX_BLOCK_KINDS を こえない（BLOCK-ID16。家の 見本は 番号を 1 バイトで 持たない）', () => {
  it('登録表の ブロックの 数 ≦ MAX_BLOCK_KINDS・id は 1 回ずつ', () => {
    expect(BLOCK_TYPES.length, '番号は 0〜MAX_BLOCK_KINDS-1').toBeLessThanOrEqual(MAX_BLOCK_KINDS);
    expect(new Set(BLOCK_TYPES.map((t) => t.id)).size, 'id の 重なり').toBe(BLOCK_TYPES.length);
  });

  it('家の しゅるいが 使う ブロックは ぜんぶ 登録表に ある（番号が ついて いる・MAX_BLOCK_KINDS 未満）', () => {
    const parts: readonly LookPart[] = [...PARTS, 'light'];
    for (const part of parts) {
      for (const kind of allKindsOf(part)) {
        for (const b of kindBlocks(part, kind)) {
          const i = BLOCK_INDEX[b];
          expect(i, `${part}-${kind} の ${b}`).toBeGreaterThanOrEqual(0);
          expect(i, `${part}-${kind} の ${b} の 番号`).toBeLessThan(MAX_BLOCK_KINDS);
        }
      }
    }
  });
});
