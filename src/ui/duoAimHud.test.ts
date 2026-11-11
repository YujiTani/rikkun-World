import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { LeftClickKind, RightClickPreview } from '../dig/rightClick';
import type { BindMap } from '../input/gamepad/binds';
import { assignFaceToAction } from '../input/gamepad/rebind';
import { DEFAULT_PLAY_BINDS } from '../input/gamepad/mapping';
import type { DuoPlayHook } from '../duo/types';
import { viewRects } from '../duo/viewRects';
import { actionHintLines, type ActionHintCtx } from './actionHintModel';
import { actionHintView, aimPartAt, crosshairSpots, hintFaceLabels, type AimPart, type DuoHintInput } from './duoAimHud';

/**
 * COOP-1 5f-1（docs/design/COOP-1.md 1.16 §3.7 (g) ①・§9.13・§12.0、AC174・AC175・AC176・AC179）のユニットテスト。実装の前に書いた赤のテスト。
 * 数は 設定の 表から 読み（画面の 大きさは UI 検査の 3 つ）、決め打ちしない。
 *
 * ---- 開発への つなぎ目の 約束（名前・形・置き場。かえたら 依頼文と 仕様に 書く）----
 *   新しい ファイル `src/ui/duoAimHud.ts`（import した だけでは document を さわらない。DOM の 部品は class に する）が 次を export する:
 *     type HintPad = 'mouse' | 'pad'
 *     type ActionHintView = ActionHintLines & { pad: HintPad }
 *     interface DuoHintInput {
 *       who: 1 | 2;
 *       duo: boolean;                       // 2 人で あそんで いるか。false の ときは who 2 は 出さず、pad は いつも 'mouse'（1 人の ときは 今の まま）
 *       hintOn: boolean;                    // 設定「ヒント」（1P の 設定と 共通）
 *       playing: boolean;                   // 遊びの 画面
 *       crosshairVisible: boolean;          // ＋マークが 見える（1P の 見下ろしでは 出ない）
 *       down: boolean;                      // その人が 倒れている
 *       open: { inventory: boolean; coopMenu: boolean; book: boolean };  // その人の もちもの画面・とりごやの メニュー・本が 開いている
 *       right: RightClickPreview | null;    // dig.previewRightClick() の 答え（その人の ほる係）
 *       left: LeftClickKind | null;         // dig.previewLeftClick() の 答え
 *       ctx: ActionHintCtx;                 // その人の もちもの・だっこ・ツルハシ／刀・わ（carryProgress）
 *       padIndex: number | null;            // duo.padIndex(who)
 *       lastInput: 'keyboard' | 'mouse' | 'gamepad';  // GamepadReader.getLastInput()（1P の パッドか マウスかを 決める のに 使う。2P は 見ない）
 *     }
 *     actionHintView(i: DuoHintInput): ActionHintView | null    … 条件が そろえば `actionHintLines(i.right, i.left, i.ctx)` の 答え ＋ pad。出す 物が 何も なければ null
 *     hintFaceLabels(binds: BindMap): { left: string | null; right: string | null }  … 左の 札＝ primary、右の 札＝ secondary の 最初の 面の 名前（facesForAction。ZR／ZL／L／R／A／B／X／Y ...）。ついて いなければ null
 *     type AimPart = 'cross' | 'hint' | 'notice' | 'stance' | 'techLock'
 *     crosshairSpots(rects: ViewRects): { who: 1 | 2; x: number; y: number }[]   … ＋マークの 中心（CSS px）。1 人の 全面なら 1 つ（画面の まん中）、左右なら 2 つ（各半分の まん中）
 *     aimPartAt(rects: ViewRects, by: 1 | 2 | undefined, part: AimPart): { x: number; y: number } | null  … その人（by なし＝1P）の 半分の ＋に 対する その 部品の 基準の 点。2P が いなくて by=2 なら null
 *   `src/duo/viewRects.ts` に `halfOf(rects: ViewRects, who: 1 | 2): Rect | null`（who 1＝ main、who 2＝ second。2P が いなければ null）。
 *   `DuoPlayHook` に `actionHint(who: 1 | 2): ActionHintView | null`（仕様 §12.0。2P が いなければ who 2 は null）。
 *   「同じ 部品」の 約束: 1P と 2P の 答えは `actionHintLines`（ui/actionHintModel.ts）だけから 作り、式を コピーしない（下の ソース見張りが 見る）。
 */

const base: DuoHintInput = {
  who: 2,
  duo: true,
  hintOn: true,
  playing: true,
  crosshairVisible: true,
  down: false,
  open: { inventory: false, coopMenu: false, book: false },
  right: null,
  left: null,
  ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false },
  padIndex: 1,
  lastInput: 'keyboard',
};
const input = (o: Partial<DuoHintInput>): DuoHintInput => ({ ...base, ...o });

const dirtPlace: RightClickPreview = { kind: 'place', item: 'dirt' };
const CASES: { name: string; right: RightClickPreview | null; left: LeftClickKind | null; ctx: ActionHintCtx }[] = [
  { name: 'ブロックを ほる・置く', right: dirtPlace, left: 'dig', ctx: { held: 'dirt', heldIsPickaxe: false, heldIsBlade: false } },
  { name: 'ツルハシで ほる', right: null, left: 'dig', ctx: { held: 'wood_pickaxe', heldIsPickaxe: true, heldIsBlade: false } },
  { name: '畑を たがやす', right: { kind: 'till', item: null }, left: 'dig', ctx: { held: 'kuwa', heldIsPickaxe: false, heldIsBlade: false } },
  { name: 'たねを まく', right: { kind: 'plant', item: 'tomato_seed' as never }, left: null, ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false } },
  { name: '宝箱を あける', right: { kind: 'chest', item: null }, left: 'dig', ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false } },
  { name: 'かまどを ひらく', right: { kind: 'furnace', item: null }, left: 'dig', ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false } },
  { name: 'たんすを ひらく', right: { kind: 'storage', item: null }, left: 'dig', ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false } },
  { name: '刀で たたく', right: null, left: 'hit', ctx: { held: 'katana', heldIsPickaxe: false, heldIsBlade: true } },
  { name: 'だっこの わ（なかまを 押しつづける）', right: { kind: 'animalPet', item: null }, left: null, ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false, carryProgress: 0.5 } },
  { name: 'だっこ中は 右だけ', right: { kind: 'putDown', item: null }, left: 'dig', ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false, carrying: true } },
];

describe('AC174: 2P の ヒントは 1P と 同じ 部品の 同じ 答え（pad だけ ちがう）', () => {
  for (const c of CASES) {
    it(`${c.name}: 2P＝ actionHintLines の 答え ＋ pad、1P と 左右の 絵と 語が 同じ`, () => {
      const expected = actionHintLines(c.right, c.left, c.ctx);
      const v2 = actionHintView(input({ who: 2, right: c.right, left: c.left, ctx: c.ctx }));
      const v1 = actionHintView(input({ who: 1, padIndex: null, right: c.right, left: c.left, ctx: c.ctx }));
      expect(v2).toEqual({ ...expected, pad: 'pad' });
      expect(v1).toEqual({ ...expected, pad: 'mouse' });
      const { pad: _p2, ...lines2 } = v2!;
      const { pad: _p1, ...lines1 } = v1!;
      expect(lines2).toEqual(lines1);
    });
  }

  it('おく・ほるは 今の 語（1P の ヒントと 同じ 答えを 書き写して 固定）', () => {
    const v = actionHintView(input({ right: dirtPlace, left: 'dig', ctx: { held: 'dirt', heldIsPickaxe: false, heldIsBlade: false } }))!;
    expect(v.right).toEqual({ icon: 'dirt', word: 'おく' });
    expect(v.left?.word).toBe('ほる');
  });

  it('だっこの わ（progress）は 1 つだけ 渡る（右の 絵の まわり。5c の わと 二重に ならない）', () => {
    const c = CASES.find((x) => x.ctx.carryProgress)!;
    const v = actionHintView(input({ right: c.right, left: c.left, ctx: c.ctx }))!;
    expect(v.progress).toBeCloseTo(c.ctx.carryProgress!);
    expect(v.right).toEqual({ icon: 'carry', word: 'だっこ' });
  });

  it('人ごと: 2P の ねらいを かえても 1P の 答えは かわらない（入力に 2P の 物が 混ざらない）', () => {
    const a = input({ who: 1, padIndex: null, right: dirtPlace, left: 'dig', ctx: { held: 'dirt', heldIsPickaxe: false, heldIsBlade: false } });
    const before = actionHintView(a);
    actionHintView(input({ who: 2, right: { kind: 'till', item: null }, left: null }));
    expect(actionHintView(a)).toEqual(before);
  });

  const NULL_CASES: [string, Partial<DuoHintInput>][] = [
    ['設定「ヒント」が オフ', { hintOn: false }],
    ['遊びの 画面で ない', { playing: false }],
    ['＋マークが 見えない', { crosshairVisible: false }],
    ['倒れている', { down: true }],
    ['もちもの画面が 開いている', { open: { inventory: true, coopMenu: false, book: false } }],
    ['とりごやの メニューが 開いている', { open: { inventory: false, coopMenu: true, book: false } }],
    ['本が 開いている', { open: { inventory: false, coopMenu: false, book: true } }],
  ];
  for (const [name, o] of NULL_CASES) {
    for (const who of [1, 2] as const) {
      it(`${name} とき ${who}P は null`, () => {
        expect(actionHintView(input({ who, right: dirtPlace, left: 'dig', ...o }))).toBeNull();
      });
    }
  }

  it('出す 物が 何も なければ null（ねらいが 空）', () => {
    expect(actionHintView(input({ right: null, left: null }))).toBeNull();
  });

  it('2P が いない（duo=false）とき who 2 は null', () => {
    expect(actionHintView(input({ who: 2, duo: false, padIndex: null, right: dirtPlace, left: 'dig' }))).toBeNull();
  });

  it('口 duo.actionHint(who) の 型: ActionHintView | null（DuoPlayHook）', () => {
    expectTypeOf<DuoPlayHook['actionHint']>().parameter(0).toEqualTypeOf<1 | 2>();
    expectTypeOf<DuoPlayHook['actionHint']>().returns.toEqualTypeOf<ReturnType<typeof actionHintView>>();
  });
});

describe('AC175: ボタンの 絵（pad の 種類・面の 名前）', () => {
  const R = dirtPlace;
  it('2P は 2 人の とき いつも パッドの 絵（最後の 入力・パッドの 番号に よらない）', () => {
    for (const lastInput of ['keyboard', 'mouse', 'gamepad'] as const) {
      expect(actionHintView(input({ who: 2, lastInput, right: R, left: 'dig' }))!.pad).toBe('pad');
    }
  });
  it('1 人の ときの 1P: パッドが あり 最後が パッド → パッドの 絵。それいがいは マウス', () => {
    expect(actionHintView(input({ who: 1, duo: false, padIndex: 0, lastInput: 'gamepad', right: R, left: 'dig' }))!.pad).toBe('pad');
    for (const lastInput of ['keyboard', 'mouse'] as const) {
      expect(actionHintView(input({ who: 1, duo: false, padIndex: 0, lastInput, right: R, left: 'dig' }))!.pad).toBe('mouse');
    }
  });
  it('2 人の とき 1P: パッドが ない → マウス', () => {
    expect(actionHintView(input({ who: 1, padIndex: null, lastInput: 'gamepad', right: R, left: 'dig' }))!.pad).toBe('mouse');
  });
  it('2 人の とき 1P: パッドが あり 最後に 動いた 入力が パッド → パッドの 絵', () => {
    expect(actionHintView(input({ who: 1, padIndex: 0, lastInput: 'gamepad', right: R, left: 'dig' }))!.pad).toBe('pad');
  });
  it('2 人の とき 1P: パッドが あっても 最後が キーボード／マウス → マウスの 絵', () => {
    for (const lastInput of ['keyboard', 'mouse'] as const) {
      expect(actionHintView(input({ who: 1, padIndex: 0, lastInput, right: R, left: 'dig' }))!.pad).toBe('mouse');
    }
  });

  it('はじめの 割り当て: 左の 札＝ ZR（primary）・右の 札＝ ZL（secondary）。札は 入れかえない', () => {
    expect(hintFaceLabels({ ...DEFAULT_PLAY_BINDS })).toEqual({ left: 'ZR', right: 'ZL' });
  });
  it('付けかえた あとは 付けかえた 面（固定で 書かない）', () => {
    // faceBottom（B）を primary に、r1（R）を secondary に。r2・l2 にも のこるので、PAD_FACES の 先に ある 面が 最初の 1 つ
    let b: BindMap = { ...DEFAULT_PLAY_BINDS };
    b = assignFaceToAction(b, 'faceBottom', 'primary').next;
    b = assignFaceToAction(b, 'r1', 'secondary').next;
    expect(hintFaceLabels(b)).toEqual({ left: 'B', right: 'R' });
  });
  it('ついて いない 札は null（絵だけ 出して 面の 名前は 空）', () => {
    expect(hintFaceLabels({ ...DEFAULT_PLAY_BINDS, r2: null })).toEqual({ left: null, right: 'ZL' });
    expect(hintFaceLabels({ ...DEFAULT_PLAY_BINDS, l2: null })).toEqual({ left: 'ZR', right: null });
  });
});

describe('AC176: ＋マークと 照準まわりの 置き場所（半分ごと）', () => {
  const SIZES: [number, number][] = [
    [1024, 700],
    [1280, 800],
    [1440, 900],
  ];
  const PARTS: AimPart[] = ['cross', 'hint', 'notice', 'stance', 'techLock'];

  for (const [w, h] of SIZES) {
    describe(`${w}×${h}`, () => {
      const split = viewRects('split', 'split', 1, w, h);
      const one = viewRects('one', 'one', 1, w, h);
      const half = Math.floor(w / 2);

      it('1 人の とき: ＋は 画面の まん中に 1 つ', () => {
        expect(crosshairSpots(one)).toEqual([{ who: 1, x: w / 2, y: h / 2 }]);
      });

      it('2 人の とき: ＋は 各半分の まん中に 1 つずつ（分割の 線の 上には ない）', () => {
        const s = crosshairSpots(split);
        expect(s.map((x) => x.who)).toEqual([1, 2]);
        expect(s[0]).toEqual({ who: 1, x: half / 2, y: h / 2 });
        expect(s[1]).toEqual({ who: 2, x: half + (w - half) / 2, y: h / 2 });
        for (const p of s) expect(Math.abs(p.x - half)).toBeGreaterThan(24);
      });

      it('どの 部品も その人の 半分の 中に ある（2 人の とき）', () => {
        for (const who of [1, 2] as const) {
          const r = split[who === 1 ? 'main' : 'second']!;
          for (const part of PARTS) {
            const p = aimPartAt(split, who, part)!;
            expect(p, `${who}P ${part}`).not.toBeNull();
            expect(p.x).toBeGreaterThan(r.x);
            expect(p.x).toBeLessThan(r.x + r.w);
            expect(p.y).toBeGreaterThan(r.y);
            expect(p.y).toBeLessThan(r.y + r.h);
          }
        }
      });

      it('部品の 関係: ヒントは ＋の すぐ下・おしらせは ＋の 右下・構えは ＋の 右・技の ロックは ＋に 重なる', () => {
        for (const who of [1, 2] as const) {
          const c = aimPartAt(split, who, 'cross')!;
          const hint = aimPartAt(split, who, 'hint')!;
          const notice = aimPartAt(split, who, 'notice')!;
          const stance = aimPartAt(split, who, 'stance')!;
          const lock = aimPartAt(split, who, 'techLock')!;
          expect(hint.x).toBe(c.x);
          expect(hint.y).toBeGreaterThan(c.y);
          expect(notice.x).toBeGreaterThan(c.x);
          expect(notice.y).toBeGreaterThan(c.y);
          expect(stance.x).toBeGreaterThan(c.x);
          expect(Math.abs(stance.y - c.y)).toBeLessThanOrEqual(2);
          expect(lock).toEqual(c);
        }
      });

      it('起こした 人（by）: なし＝ 1P、2 は 2P の 半分', () => {
        expect(aimPartAt(split, undefined, 'notice')).toEqual(aimPartAt(split, 1, 'notice'));
        expect(aimPartAt(split, 2, 'notice')!.x).toBeGreaterThan(half);
        expect(aimPartAt(split, 1, 'notice')!.x).toBeLessThan(half);
      });

      it('1 人の とき: 部品は 今と 同じ（＋は まん中）。2P が いなくて by=2 は null', () => {
        expect(aimPartAt(one, 1, 'cross')).toEqual({ x: w / 2, y: h / 2 });
        expect(aimPartAt(one, undefined, 'techLock')).toEqual({ x: w / 2, y: h / 2 });
        expect(aimPartAt(one, 2, 'cross')).toBeNull();
      });
    });
  }
});

describe('AC174: 1P と 2P で 同じ 部品（式の コピーなし）', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(p) && !/\.(test|spec)\.ts$/.test(p) ? [p] : [];
    });

  it('duoAimHud.ts は actionHintModel の actionHintLines を 使う', () => {
    const src = readFileSync('src/ui/duoAimHud.ts', 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*\bactionHintLines\b[^}]*\}\s*from\s*'\.\/actionHintModel'/);
    expect(src).toMatch(/\bactionHintLines\(/);
  });

  it('ヒントの 語の 表（case 〜 word: 〜）は actionHintModel.ts の 1 か所だけ', () => {
    const copies = files('src').filter((f) => /word:\s*'たがやす'/.test(readFileSync(f, 'utf8')));
    expect(copies.map((f) => f.replaceAll('\\', '/'))).toEqual(['src/ui/actionHintModel.ts']);
  });
});
