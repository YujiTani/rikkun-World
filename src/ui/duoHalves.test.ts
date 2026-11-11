import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUO_TUNING } from '../duo/tuning';
import { aimPartAt } from './duoAimHud';
import { viewRects, type Rect } from '../duo/viewRects';
import {
  DUO_HALF_ID,
  HALF_OWNER,
  HALF_SLOT_RATIO,
  clampToHalf,
  clockBoxAt,
  halfId,
  halvesCoveredBy,
  halvesForKey,
  halvesOf,
  halvesOfAll,
  hudNoticeRight,
  hudNoticeShow,
  ndcToHalf,
  slotAt,
  slotMaxWidth,
  type HalfKey,
  type HalfSlot,
  type Owner,
} from './duoHalves';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.1 の きまり・§3.7 (g) の 洗い出し #13〜#22・#22a・#22b と「1.17 の きめ」・§9.13・§12.0、AC177・AC178）のユニットテスト。
 * 実装の前に書いた赤のテスト。「どの 要素を どの 半分に 置くか」を 純関数に 割って 確かめる（DOM・Three.js なし）。5f-1 の `crosshairSpots`・`aimPartAt` と 同じ 作り。
 * 数は 設定の 表（DUO_TUNING・HALF_SLOT_RATIO・tokens の sp-N）から 読み、画面の 大きさは UI 検査の 3 つ（1024×700・1280×800・1440×900）。1 人の ときの 位置は 今の css と 同じ（AC146）。
 *
 * ---- 開発への つなぎ目の 約束（名前・形・置き場。かえたら 依頼文と 仕様に 書く）----
 *   新しい ファイル `src/ui/duoHalves.ts`（純関数の 置き場。import しただけでは document を さわらない。DOM の 部品は class に して 参加した ときに 作る）が 次を export する:
 *     type Who = 1 | 2;   type Owner = Who | 'world'      … 1.17: 実績の 持ち主は `Owner | null`（null = 持ち主 なし・セーブから 戻した 物 → 両方の 半分）
 *     type HalfKey = 'titleAnnounce'(#13)|'homeNotice'(#14)|'damageEdge'(#15)|'death'(#16)|'clock'(#17)|'band'(#18)|'banner'(#19)|'hudNotice'(#20)
 *                  |'nameplate'(#21)|'buffPlate'(#22)|'noticeName'(#22a)|'inkDim'(#22b)
 *     HALF_OWNER: Record<HalfKey, 'world' | 'who' | 'owners'>       … だれの 半分に 出すか の 表（`satisfies Record<HalfKey, …>`。足し忘れは 型で 落ちる）
 *         'world' = 世界で 1 つの 物 → 両方の 半分に 同じ 物 / 'who' = 起こした 人・もちぬし・ねらった 人の 半分 / 'owners' = 持ち主の 列（実績の 帯）から きめる
 *     DUO_HALF_ID: Record<HalfKey, string>                          … data-testid の もと。`halfId(key, who)` = `${DUO_HALF_ID[key]}-p${who}`（例 duo-clock-p2）
 *     halvesOf(owner: Owner, joined: boolean): readonly Who[]      … joined=false（1 人）は いつも [1]（全面）。'world' は [1, 2]。who は [who]。毎回 新しい 配列を 作らない（定数を 返す）
 *     halvesOfAll(owners: readonly (Owner | null)[], joined: boolean): readonly Who[]   … 持ち主の 和（順番は 1, 2。空・null・'world' が まざれば 両方）
 *     halvesForKey(key: HalfKey, joined: boolean, who?: Who, owners?: readonly Owner[]): readonly Who[]   … HALF_OWNER で 振りわける
 *     HALF_SLOT_RATIO = { titleAnnounce: 0.14, homeNotice: 0.3, banner: 0.22 }  … その 半分の 高さに 対する 上はしの 割合（今の css の top と 同じ 数。css 側と そろって いるかは duoHalvesCss.test.ts が 見はる）
 *     type HalfSlot = 'titleAnnounce' | 'homeNotice' | 'clock' | 'band' | 'banner' | 'noticeName'
 *     slotAt(rects: ViewRects, who: Who, slot: HalfSlot): { x: number; y: number | null } | null   … その 半分の 中の 基準の 点（CSS px）。2P が いなくて who=2 は null
 *         titleAnnounce／homeNotice／banner: x = 半分の まん中、y = 半分の 上 + 割合 × 半分の 高さ。
 *         clock（1.17: 各半分の 外がわの 上すみ）: 2 人の とき 1P は x = 画面の 左はし + sp-5（箱の 左はし）、2P は x = 画面の 右はし − sp-5（箱の 右はし）、y = 上 + sp-5。
 *               1 人の ときは 今の まま（x = 画面の 右はし − sp-5〈箱の 右はし〉、y = sp-5）。
 *         band／noticeName: x = 半分の まん中だけ（y は css〔--duo-band-top・bottom〕で 決まる ので null）
 *     slotMaxWidth(rects: ViewRects, who: Who, slot: HalfSlot): number | null   … 中央に そろえる 部品の いちばん 広い はば。2 人の とき 半分の はば × DUO_TUNING.hotbarFit（titleAnnounce・homeNotice・band・banner）。それ以外・1 人の ときは null（今の css の まま）
 *     hudNoticeRight(rects: ViewRects, who: Who, hotbarW: number, duoScale: number): number | null   … つくれる マーク（#hud-notice）の 右はし x = 半分の まん中 + ホットバーの はば × 縮め倍 / 2
 *     ndcToHalf(half: Rect, ndcX: number, ndcY: number): { x: number; y: number }   … NDC（-1〜1。右 +x・上 +y）→ その 半分の 中の 画面の 位置。半分が 全面なら 今の `(ndc × 0.5 + 0.5) × 画面の 大きさ` と 同じ
 *     clampToHalf(half: Rect, ax: number, ay: number, w: number, h: number, pad: number, bottomPad: number): { x: number; y: number }
 *         … 下はしの まん中が (ax, ay) の 箱（w×h）を 半分の 中に おさめた 点。x ∈ [半分の 左 + w/2 + pad, 半分の 右 − w/2 − pad]、y ∈ [半分の 上 + h + pad, 半分の 下 − bottomPad]
 *         （妖怪の 名札は bottomPad = h + pad〔今の 式〕、マッチョの「！」・顔は bottomPad = pad〔今の 式〕）
 *     clockBoxAt(rects: ViewRects, who: Who, size: { w: number; h: number }): Rect | null   … 時計の 箱（CSS px。size = DOM の 実測）。2 人の 1P = 左上（x = sp-5）、2P = 右上（右はしが 画面の 右はし − sp-5）、1 人 = 右上。2P が いなくて who=2 は null。矢印が よける 四角に 使う
 *     halvesCoveredBy(who: Who, joined: boolean): readonly Who[]   … 1.17: もちもの画面・家の 画面・にわとりの メニューを 開いた とき、2 つに なった 時計・おしらせの 印・つくれる マークなどを 消す 半分 = 開いた 人の 半分だけ（2 人の とき）。1 人の ときは 今の まま ぜんぶ 消す（[1]）。毎回 新しい 配列を 作らない
 *     hudNoticeShow(who: Who, joined: boolean, craftable: boolean, medals: number): { craft: boolean; medal: number }   … 1.17: つくれる マークは 各自の 半分（craftable は その人の もちもので）、メダルの 印（実績の 保留数）は 世界で 1 つ → 2 人の とき 1P の 半分だけ（2P は medal 0）。1 人の ときは 今の まま。2P が いなくて who=2 は { craft: false, medal: 0 }
 *   「同じ 部品」: tokens の sp-N の 式は 5f-1 の `duoAimHud.ts` の `tokenPx`（export に する）を 使い、`duoHalves.ts` に 式を コピーしない（下の ソース見張り）。
 */

const SIZES: [number, number][] = [
  [1024, 700],
  [1280, 800],
  [1440, 900],
];
const WHOS = [1, 2] as const;

describe('AC178: だれの 半分に 出すか（HALF_OWNER の 表）', () => {
  // 仕様 §3.7 (g) の 洗い出しの 「決まり」の 列（#13〜#22・#22a・#22b）から 書き写した 期待
  const WANT: Record<HalfKey, 'world' | 'who' | 'owners'> = {
    titleAnnounce: 'world', // #13 世界で 1 つ → 両方の 半分の 上に 同じ 物
    homeNotice: 'who', // #14 復活した 人の 半分
    damageEdge: 'who', // #15 当たった 人の 半分の ふち
    death: 'who', // #16 倒れた 人の 半分だけ
    clock: 'world', // #17 各半分の 外がわの 上すみに 同じ 物 2 つ（1.17: 1P 左上・2P 右上）
    band: 'owners', // #18 達成した 人の 半分（世界が 達成した 物は 両方）
    banner: 'who', // #19 横断幕・紙ふぶき: 2 人の とき 1P の 半分だけ（who は いつも 1。2P の つくるは 別 issue）
    hudNotice: 'who', // #20 つくれる マーク（2P の 分は 2P の ホットバーの 右上）。メダルの 印は 1P だけ（hudNoticeShow）
    nameplate: 'who', // #21 半分ごとに その 半分の カメラ
    buffPlate: 'who', // #22 その人の ホットバーの 札
    noticeName: 'who', // #22a えらんだ 人の 半分
    inkDim: 'who', // #22b すみを かぶった 人の 半分だけ
  };

  it('表は 洗い出しの 12 キーを ぜんぶ（足し忘れが ない）。HALF_OWNER・DUO_HALF_ID が 同じ キー', () => {
    expect(Object.keys(HALF_OWNER).sort()).toEqual(Object.keys(WANT).sort());
    expect(Object.keys(DUO_HALF_ID).sort()).toEqual(Object.keys(WANT).sort());
  });

  for (const key of Object.keys(WANT) as HalfKey[]) {
    it(`${key}: ${WANT[key]}`, () => {
      expect(HALF_OWNER[key]).toBe(WANT[key]);
    });
  }

  it('1.17: DUO_HALF_ID の 12 キーの 値を ぜんぶ 固定（UI 検査 e2e/helpers/duoHalves.ts の 直書きと そろえる）', () => {
    expect(DUO_HALF_ID).toEqual({
      titleAnnounce: 'duo-title-announce',
      homeNotice: 'duo-home-notice',
      damageEdge: 'duo-damage-edge',
      death: 'duo-death',
      clock: 'duo-clock',
      band: 'duo-cel-band',
      banner: 'duo-cel-banner',
      hudNotice: 'duo-hud-notice',
      nameplate: 'duo-yokai-plate',
      buffPlate: 'duo-buff-plate',
      noticeName: 'duo-notice-name',
      inkDim: 'duo-ink-dim',
    });
  });

  it('目印（data-testid）は 半分ごとに ちがい、名前は duo- で はじまる', () => {
    const seen = new Set<string>();
    for (const key of Object.keys(WANT) as HalfKey[]) {
      for (const who of WHOS) {
        const id = halfId(key, who);
        expect(id).toBe(`${DUO_HALF_ID[key]}-p${who}`);
        expect(id.startsWith('duo-')).toBe(true);
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
    // 仕様 §12.0 の 目印の 名前
    expect(halfId('clock', 1)).toBe('duo-clock-p1');
    expect(halfId('clock', 2)).toBe('duo-clock-p2');
    expect(halfId('hudNotice', 2)).toBe('duo-hud-notice-p2');
  });
});

describe('halvesOf・halvesOfAll・halvesForKey', () => {
  it('2 人の とき: 世界は 両方・人は その人の 半分だけ', () => {
    expect(halvesOf('world', true)).toEqual([1, 2]);
    expect(halvesOf(1, true)).toEqual([1]);
    expect(halvesOf(2, true)).toEqual([2]);
  });
  it('1 人の とき（joined=false）は いつも 1P の 全面だけ（2P の 持ち主でも 1 つ）', () => {
    for (const o of ['world', 1, 2] as Owner[]) expect(halvesOf(o, false)).toEqual([1]);
    expect(halvesOfAll([2, 'world'], false)).toEqual([1]);
  });
  it('毎ステップ 呼んでも 新しい 配列を 作らない（同じ 入力は 同じ 物）', () => {
    expect(halvesOf('world', true)).toBe(halvesOf('world', true));
    expect(halvesOf(2, true)).toBe(halvesOf(2, true));
    expect(halvesOf(1, false)).toBe(halvesOf('world', false));
  });
  it('持ち主の 列: 同じ 人だけ → その 半分・ちがう 人が まざる／世界が ある／空 → 両方（順番は 1, 2）', () => {
    expect(halvesOfAll([1, 1], true)).toEqual([1]);
    expect(halvesOfAll([2], true)).toEqual([2]);
    expect(halvesOfAll([2, 1], true)).toEqual([1, 2]);
    expect(halvesOfAll([1, 'world'], true)).toEqual([1, 2]);
    expect(halvesOfAll(['world'], true)).toEqual([1, 2]);
    expect(halvesOfAll([], true)).toEqual([1, 2]);
  });
  it('1.17: 持ち主 なし（null。セーブから 戻した 物）は 両方の 半分。ほかの 持ち主が まざっても 両方', () => {
    expect(halvesOfAll([null], true)).toEqual([1, 2]);
    expect(halvesOfAll([1, null], true)).toEqual([1, 2]);
    expect(halvesOfAll([2, null], true)).toEqual([1, 2]);
    expect(halvesOfAll([null], false)).toEqual([1]);
  });
  it('halvesForKey: HALF_OWNER で 振りわける（#13 は 両方・#14 は 復活した 人・#18 は 持ち主の 列）', () => {
    expect(halvesForKey('titleAnnounce', true)).toEqual([1, 2]);
    expect(halvesForKey('clock', true)).toEqual([1, 2]);
    expect(halvesForKey('homeNotice', true, 2)).toEqual([2]);
    expect(halvesForKey('damageEdge', true, 1)).toEqual([1]);
    expect(halvesForKey('inkDim', true, 2)).toEqual([2]);
    expect(halvesForKey('noticeName', true, 2)).toEqual([2]);
    expect(halvesForKey('band', true, undefined, [2])).toEqual([2]);
    expect(halvesForKey('band', true, undefined, [1, 2])).toEqual([1, 2]);
    expect(halvesForKey('band', true, undefined, ['world'])).toEqual([1, 2]);
    expect(halvesForKey('titleAnnounce', false)).toEqual([1]);
    expect(halvesForKey('damageEdge', false, 1)).toEqual([1]);
  });
});

describe('AC177: 置き場所（その 半分の 中・まん中の 線に またがらない）', () => {
  const MID: HalfSlot[] = ['titleAnnounce', 'homeNotice', 'band', 'banner', 'noticeName'];
  const CENTERED_W: HalfSlot[] = ['titleAnnounce', 'homeNotice', 'band', 'banner'];

  for (const [w, h] of SIZES) {
    describe(`${w}×${h}`, () => {
      const split = viewRects('split', 'split', 1, w, h);
      const one = viewRects('one', 'one', 1, w, h);
      /** tokens の sp-5（24 の 段）。5f-1 の aimPartAt の ヒントの ずれ（＋の すぐ 下 = sp-5）から 逆に 読む（式を 写さない） */
      const sp5 = aimPartAt(one, 1, 'hint')!.y - aimPartAt(one, 1, 'cross')!.y;

      it('2 人の とき: 中央合わせの 部品の x は その 半分の まん中', () => {
        for (const who of WHOS) {
          const r = who === 1 ? split.main : split.second!;
          for (const slot of MID) expect(slotAt(split, who, slot)!.x, `${who}P ${slot}`).toBeCloseTo(r.x + r.w / 2, 5);
        }
      });

      it('2 人の とき: 高さは その 半分の 上 + 割合 × 高さ（割合は 表から）', () => {
        for (const who of WHOS) {
          const r = who === 1 ? split.main : split.second!;
          for (const slot of ['titleAnnounce', 'homeNotice', 'banner'] as const) {
            expect(slotAt(split, who, slot)!.y, `${who}P ${slot}`).toBeCloseTo(r.y + HALF_SLOT_RATIO[slot] * r.h, 5);
          }
          expect(slotAt(split, who, 'band')!.y).toBeNull();
          expect(slotAt(split, who, 'noticeName')!.y).toBeNull();
        }
      });

      it('時計（1.17）: 各半分の 外がわの 上すみ。1P = 画面の 左上（左 sp-5・上 sp-5）、2P = 画面の 右上（右 sp-5・上 sp-5）', () => {
        const a = slotAt(split, 1, 'clock')!;
        const b = slotAt(split, 2, 'clock')!;
        expect(a.x).toBeCloseTo(split.main.x + sp5, 5);
        expect(b.x).toBeCloseTo(split.second!.x + split.second!.w - sp5, 5);
        expect(a.y).toBeCloseTo(sp5, 5);
        expect(b.y).toBeCloseTo(sp5, 5);
        // どちらも その 半分の 中。1P は 左の はし・2P は 右の はし（まん中の 線には よらない）
        expect(a.x).toBeLessThan(split.main.x + split.main.w / 2);
        expect(b.x).toBeGreaterThan(split.second!.x + split.second!.w / 2);
      });

      it('時計の 箱: 1P = 左上・2P = 右上。その 半分の 中に おさまり、まん中の 距離メーターに かからない（メーターの はば = 画面の meterWidthRatio）', () => {
        const size = { w: 120, h: 160 }; // 実測の 時計は 横 100px・縦 150px ほど。少し 大きめに とる
        const m0 = w / 2 - (w * DUO_TUNING.meterWidthRatio) / 2;
        const m1 = w / 2 + (w * DUO_TUNING.meterWidthRatio) / 2;
        const a = clockBoxAt(split, 1, size)!;
        const b = clockBoxAt(split, 2, size)!;
        expect(a.x).toBeCloseTo(slotAt(split, 1, 'clock')!.x, 5);
        expect(a.y).toBeCloseTo(sp5, 5);
        expect([a.w, a.h, b.w, b.h]).toEqual([size.w, size.h, size.w, size.h]);
        expect(b.x + b.w).toBeCloseTo(w - sp5, 5);
        expect(b.y).toBeCloseTo(sp5, 5);
        expect(a.x).toBeGreaterThanOrEqual(split.main.x);
        expect(a.x + a.w).toBeLessThanOrEqual(split.main.x + split.main.w);
        expect(b.x).toBeGreaterThanOrEqual(split.second!.x);
        expect(b.x + b.w).toBeLessThanOrEqual(split.second!.x + split.second!.w);
        expect(a.x + a.w, '1P の 時計 < メーターの 左').toBeLessThan(m0);
        expect(b.x, '2P の 時計 > メーターの 右').toBeGreaterThan(m1);
      });

      it('1 人の とき（今まで どおり）: 時計の 箱は 画面の 右上（右 sp-5・上 sp-5）。2P が いなくて who=2 は null', () => {
        const size = { w: 120, h: 160 };
        const c = clockBoxAt(one, 1, size)!;
        expect(c.x + c.w).toBeCloseTo(w - sp5, 5);
        expect(c.y).toBeCloseTo(sp5, 5);
        expect(clockBoxAt(one, 2, size)).toBeNull();
      });

      it('中央合わせの 部品は はば ± まん中の 半分が その 半分の 中に おさまる（半分の はば × hotbarFit）', () => {
        for (const who of WHOS) {
          const r = who === 1 ? split.main : split.second!;
          for (const slot of CENTERED_W) {
            const mw = slotMaxWidth(split, who, slot)!;
            expect(mw, `${who}P ${slot}`).toBeCloseTo(r.w * DUO_TUNING.hotbarFit, 5);
            const x = slotAt(split, who, slot)!.x;
            expect(x - mw / 2).toBeGreaterThanOrEqual(r.x);
            expect(x + mw / 2).toBeLessThanOrEqual(r.x + r.w);
            // まん中の 線（半分の はし）に 近づきすぎない
            expect(Math.abs(x - (who === 1 ? r.x + r.w : r.x)) - mw / 2).toBeGreaterThan(0);
          }
          for (const slot of ['clock', 'noticeName'] as const) expect(slotMaxWidth(split, who, slot)).toBeNull();
        }
      });

      it('1 人の とき: 今の css と 同じ（まん中・上から 14% / 30% / 22%・時計は 右上 sp-5）。はばは 触らない（null）', () => {
        expect(slotAt(one, 1, 'titleAnnounce')).toEqual({ x: w / 2, y: 0.14 * h });
        expect(slotAt(one, 1, 'homeNotice')).toEqual({ x: w / 2, y: 0.3 * h });
        expect(slotAt(one, 1, 'banner')).toEqual({ x: w / 2, y: 0.22 * h });
        expect(slotAt(one, 1, 'band')).toEqual({ x: w / 2, y: null });
        expect(slotAt(one, 1, 'noticeName')).toEqual({ x: w / 2, y: null });
        const c = slotAt(one, 1, 'clock')!;
        expect(c.x).toBeCloseTo(w - sp5, 5);
        expect(c.y).toBeCloseTo(sp5, 5);
        for (const slot of ['titleAnnounce', 'homeNotice', 'band', 'banner', 'clock', 'noticeName'] as const) expect(slotMaxWidth(one, 1, slot)).toBeNull();
      });

      it('2P が いなくて who=2 は null', () => {
        for (const slot of [...MID, 'clock'] as const) {
          expect(slotAt(one, 2, slot)).toBeNull();
          expect(slotMaxWidth(one, 2, slot)).toBeNull();
        }
        expect(hudNoticeRight(one, 2, 400, 1)).toBeNull();
      });

      it('1P の 時計と 2P の 時計は 左右 対称（1P の 左 sp-5 と 2P の 右 sp-5。上は 同じ）', () => {
        const a = slotAt(split, 1, 'clock')!;
        const b = slotAt(split, 2, 'clock')!;
        expect(a.x - split.main.x).toBeCloseTo(split.second!.x + split.second!.w - b.x, 5);
        expect(a.y).toBeCloseTo(b.y!, 5);
      });

      it('つくれる マーク: 右はし = 半分の まん中 + ホットバーの はば × 縮め倍 / 2（2 つとも その 半分の 中）。1 人の ときは 今の css（右はし = 50% + はば / 2）', () => {
        const hb = 420; // ホットバーの はば（px）。DOM の 実測を 渡す
        const s = DUO_TUNING.hotbarFit;
        for (const who of WHOS) {
          const r = who === 1 ? split.main : split.second!;
          const x = hudNoticeRight(split, who, hb, s)!;
          expect(x).toBeCloseTo(r.x + r.w / 2 + (hb * s) / 2, 5);
          expect(x).toBeLessThan(r.x + r.w);
        }
        expect(hudNoticeRight(one, 1, hb, 1)).toBeCloseTo(w / 2 + hb / 2, 5);
      });
    });
  }
});

describe('1.17: 画面を 開いた とき 消すのは 開いた 人の 半分の 分だけ（AC178 ⑥）', () => {
  it('2 人の とき: 1P が 開けば 1P の 半分の 分だけ・2P が 開けば 2P の 半分の 分だけ（もう 1 人の 分は のこる）', () => {
    expect(halvesCoveredBy(1, true)).toEqual([1]);
    expect(halvesCoveredBy(2, true)).toEqual([2]);
  });
  it('1 人の ときは 今の まま ぜんぶ 消す（1P の 全面の 分だけ）', () => {
    expect(halvesCoveredBy(1, false)).toEqual([1]);
  });
  it('毎ステップ 呼んでも 新しい 配列を 作らない', () => {
    expect(halvesCoveredBy(2, true)).toBe(halvesCoveredBy(2, true));
    expect(halvesCoveredBy(1, true)).toBe(halvesCoveredBy(1, false));
  });
});

describe('1.17: つくれる マークと メダルの 印（#20・AC178 ④）', () => {
  it('2 人の とき: つくれる マークは 各自の 半分（その人の craftable）。メダルの 印は 1P の 半分だけ', () => {
    expect(hudNoticeShow(1, true, true, 3)).toEqual({ craft: true, medal: 3 });
    expect(hudNoticeShow(2, true, true, 3)).toEqual({ craft: true, medal: 0 });
    expect(hudNoticeShow(1, true, false, 3)).toEqual({ craft: false, medal: 3 });
    expect(hudNoticeShow(2, true, false, 3)).toEqual({ craft: false, medal: 0 });
    expect(hudNoticeShow(2, true, true, 0)).toEqual({ craft: true, medal: 0 });
  });
  it('1 人の ときは 今の まま（1P に つくれる マークも メダルの 印も）', () => {
    expect(hudNoticeShow(1, false, true, 2)).toEqual({ craft: true, medal: 2 });
    expect(hudNoticeShow(1, false, false, 0)).toEqual({ craft: false, medal: 0 });
  });
  it('2P が いなくて who=2 は 何も 出さない', () => {
    expect(hudNoticeShow(2, false, true, 5)).toEqual({ craft: false, medal: 0 });
  });
});

describe('AC178: 妖怪の 名札・しるしの 投影は 半分ごと（#21）', () => {
  const full: Rect = { x: 0, y: 0, w: 1280, h: 800 };
  const left: Rect = { x: 0, y: 0, w: 640, h: 800 };
  const right: Rect = { x: 640, y: 0, w: 640, h: 800 };

  it('NDC の まん中 (0, 0) は その 半分の まん中（1P の 半分でも 2P の 半分でも）', () => {
    expect(ndcToHalf(left, 0, 0)).toEqual({ x: 320, y: 400 });
    expect(ndcToHalf(right, 0, 0)).toEqual({ x: 960, y: 400 });
  });
  it('NDC の はし (±1) は その 半分の はし。2P の 半分は 右へ ずれ、まん中の 線を こえない', () => {
    expect(ndcToHalf(left, -1, 1)).toEqual({ x: 0, y: 0 });
    expect(ndcToHalf(left, 1, -1)).toEqual({ x: 640, y: 800 });
    expect(ndcToHalf(right, -1, 1)).toEqual({ x: 640, y: 0 });
    expect(ndcToHalf(right, 1, -1)).toEqual({ x: 1280, y: 800 });
  });
  it('1 人の 全面なら 今の 式（(ndc × 0.5 + 0.5) × 画面。y は 上下 逆）と 同じ', () => {
    for (const [nx, ny] of [[0.3, -0.4], [-0.9, 0.2], [0, 0], [1, 1]] as const) {
      const p = ndcToHalf(full, nx, ny);
      expect(p.x).toBeCloseTo((nx * 0.5 + 0.5) * 1280, 9);
      expect(p.y).toBeCloseTo((-ny * 0.5 + 0.5) * 800, 9);
    }
  });
  it('1P の 半分は 画面ぜんたいの 幅に 写さない（半分の 幅に 写す）: NDC x=0.5 は 480、全面なら 800', () => {
    expect(ndcToHalf(left, 0.5, 0).x).toBe(480);
    expect(ndcToHalf(full, 0.5, 0).x).toBe(960);
  });
  it('入れものを 渡さなくても 毎回 同じ 形の 答え（x・y）', () => {
    const p = ndcToHalf(right, 0.1, 0.1);
    expect(Object.keys(p).sort()).toEqual(['x', 'y']);
  });

  describe('clampToHalf: 名札の おさめ方（今の 式を 半分に）', () => {
    it('1 人の 全面なら 今の 式: px = clamp(x, hw+4, w−hw−4)・py = clamp(y, h+4, H−h−4)（名札 = 下はし まん中）', () => {
      const w = 1280;
      const H = 800;
      const bw = 120;
      const bh = 32;
      const old = (x: number, y: number) => ({
        x: Math.min(Math.max(x, bw / 2 + 4), w - bw / 2 - 4),
        y: Math.min(Math.max(y, bh + 4), H - bh - 4),
      });
      for (const [x, y] of [[-50, -20], [10, 5], [640, 400], [1270, 790], [2000, 2000], [300, 900]] as const) {
        expect(clampToHalf(full, x, y, bw, bh, 4, bh + 4)).toEqual(old(x, y));
      }
    });
    it('2P の 半分: 右はしの 外へ はみ出す 名札は 2P の 半分の 右はしの 内へ。左はしでも まん中の 線を こえない', () => {
      const bw = 120;
      const bh = 32;
      const a = clampToHalf(right, 5000, 400, bw, bh, 4, bh + 4);
      expect(a.x + bw / 2).toBeLessThanOrEqual(right.x + right.w - 4);
      const b = clampToHalf(right, -5000, 400, bw, bh, 4, bh + 4);
      expect(b.x - bw / 2).toBeGreaterThanOrEqual(right.x + 4);
      const c = clampToHalf(left, 5000, 400, bw, bh, 4, bh + 4);
      expect(c.x + bw / 2).toBeLessThanOrEqual(left.x + left.w - 4);
    });
    it('マッチョの「！」・顔（下に 余白を とらない）: bottomPad = pad なら 下はしまで 行ける', () => {
      const bh = 44;
      expect(clampToHalf(full, 640, 5000, 36, bh, 4, 4).y).toBe(800 - 4);
      expect(clampToHalf(full, 640, -5000, 36, bh, 4, 4).y).toBe(bh + 4);
    });
    it('まん中は そのまま', () => {
      expect(clampToHalf(left, 320, 400, 100, 30, 4, 34)).toEqual({ x: 320, y: 400 });
      expect(clampToHalf(right, 960, 400, 100, 30, 4, 34)).toEqual({ x: 960, y: 400 });
    });
  });
});

describe('AC174 と 同じ きまり: 式の コピーなし（ソース見張り）', () => {
  const src = (p: string): string => readFileSync(p, 'utf8');

  it('duoHalves.ts は tokens の 式（0.85・1.5・1280）を コピーせず、duoAimHud.ts の tokenPx を 使う', () => {
    const s = src('src/ui/duoHalves.ts');
    expect(s).not.toMatch(/0\.85|TOKEN_MIN|TOKEN_MAX|TOKEN_DESIGN_W/);
    expect(s).toMatch(/import\s*\{[^}]*\btokenPx\b[^}]*\}\s*from\s*'\.\/duoAimHud'/);
    expect(src('src/ui/duoAimHud.ts')).toMatch(/export function tokenPx\b/);
  });
  it('duoHalves.ts は 半分の 矩形を duo/viewRects.ts の halfOf で 引く（自分で main/second を 選ばない）', () => {
    const s = src('src/ui/duoHalves.ts');
    expect(s).toMatch(/import\s*\{[^}]*\bhalfOf\b[^}]*\}\s*from\s*'\.\.\/duo\/viewRects'/);
    expect(s).not.toMatch(/rects\.(main|second)\b/);
  });
  it('import しただけでは document・window を さわらない（部品は 参加した ときに 作る）', () => {
    // 上の import が node で 通っている ことが 証明。さらに トップレベルで document を 呼ばない
    const s = src('src/ui/duoHalves.ts');
    expect(s.split('\n').filter((l) => /^(const|let|var)\b.*\b(document|window)\./.test(l))).toEqual([]);
  });
});
