import { describe, expect, it } from 'vitest';
import { CoopMenuModel, type CoopMenuDeps } from './coopMenuModel';
import { coopPadBack, coopPadFocus, coopPadNames, coopPadPress } from './coopMenuPad';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)「とりごやの メニュー」、AC138）の 先行テスト（赤）。
 * 2P の とりごやの メニューは パッドの 十字で えらび・A で 押し・B で もどる／とじる。DOM を 使わない 核。
 * 十字の うごき（どの 名前の 次が どれか）は 4a と 同じ `InvFocus`＋`pickNext`（画面の 位置から。src/duo/invFocus.ts）なので ここでは 見ない。
 * ここでは「いま えらべる 名前の 一覧」「名前を 押した ときの 動き」「B の 動き」を 見る。
 *
 * ---- 実装への 約束（新しい ファイル src/ui/coopMenuPad.ts。`CoopMenuModel` は 1 人に 1 つ 作る〈1P 用・2P 用〉）----
 *   coopPadNames(info: CoopMenuInfo): string[]   … 画面に 出る じゅんに。えらべない（disabled）物は 入れない。ひらいて いなければ []。
 *       top:     'collect'（たまごが 1 こ以上）・'meat'（演出中でない）・'close'
 *       pick:    'back'・'card:<子の id>'（子ごと）・'close'
 *       confirm: 'cancel'・'ok'・'close'
 *     data-pad-focus を 付ける 名前も これ（`[data-pad="<名前>"]` を 画面の 要素に 付ける）。
 *   coopPadPress(m: CoopMenuModel, name: string): void   … A。名前の ボタンを 押したのと 同じ（'card:<id>' は press('card', id)）。知らない 名前・今の ページに ない 名前は 何も しない。
 *   coopPadFocus(m: CoopMenuModel, name: string | null): void   … えらびが うごいた とき。'card:<id>' なら press('hover', id)（頭の ▼）、ほかは hover を はずす。
 *   coopPadBack(m: CoopMenuModel): void          … B。pick → top（'back'）。top・confirm は とじる（'close'）。
 */

function make(o: { kids?: number[]; eggs?: number; busy?: number | null } = {}) {
  const st = { kids: o.kids ?? [11, 12, 13], eggs: o.eggs ?? 3, busy: o.busy ?? null };
  const log: string[] = [];
  const deps: CoopMenuDeps = {
    meatList: () => st.kids.slice(),
    eggs: () => st.eggs,
    busy: () => st.busy,
    exists: () => true,
    inReach: () => true,
    collect: (c) => {
      log.push(`collect:${c}`);
      st.eggs = 0;
    },
    startMeat: (c, id) => {
      log.push(`meat:${c}:${id}`);
      return st.kids.includes(id) && st.busy === null;
    },
    onOpen: () => log.push('open'),
    onClose: () => log.push('close'),
  };
  const m = new CoopMenuModel(deps);
  return { m, st, log };
}

describe('えらべる 名前の 一覧', () => {
  it('ひらいて いない → 空', () => {
    expect(coopPadNames(make().m.info())).toEqual([]);
  });
  it('top: collect・meat・close。たまごが 0 なら collect は 入らない・演出中なら meat は 入らない', () => {
    const a = make();
    a.m.open(5);
    expect(coopPadNames(a.m.info())).toEqual(['collect', 'meat', 'close']);
    const b = make({ eggs: 0 });
    b.m.open(5);
    expect(coopPadNames(b.m.info())).toEqual(['meat', 'close']);
    const c = make({ busy: 12 });
    c.m.open(5);
    expect(coopPadNames(c.m.info())).toEqual(['collect', 'close']);
  });
  it('pick: back・子ごとの card:<id>・close。confirm: cancel・ok・close', () => {
    const { m } = make();
    m.open(5);
    m.press('meat');
    expect(coopPadNames(m.info())).toEqual(['back', 'card:11', 'card:12', 'card:13', 'close']);
    m.press('card', 12);
    expect(coopPadNames(m.info())).toEqual(['cancel', 'ok', 'close']);
  });
});

describe('A（名前を 押す）', () => {
  it('top → pick → confirm → ok で いただきます。メニューは とじる', () => {
    const { m, log } = make();
    m.open(5);
    coopPadPress(m, 'meat');
    expect(m.info().page).toBe('pick');
    coopPadPress(m, 'card:12');
    expect(m.info()).toMatchObject({ page: 'confirm', selected: 12 });
    coopPadPress(m, 'ok');
    expect(log).toContain('meat:5:12');
    expect(m.info().open).toBe(false);
  });
  it('collect は たまごを あつめる（ひらいた まま）', () => {
    const { m, log } = make();
    m.open(5);
    coopPadPress(m, 'collect');
    expect(log).toContain('collect:5');
    expect(m.info()).toMatchObject({ open: true, eggs: 0 });
  });
  it('cancel は ページ 2 へ。close は とじる。今の ページに ない 名前・知らない 名前は 何も しない', () => {
    const { m } = make();
    m.open(5);
    coopPadPress(m, 'ok');
    coopPadPress(m, 'card:11');
    coopPadPress(m, 'nanika');
    expect(m.info()).toMatchObject({ open: true, page: 'top', selected: null });
    coopPadPress(m, 'meat');
    coopPadPress(m, 'card:11');
    coopPadPress(m, 'cancel');
    expect(m.info().page).toBe('pick');
    coopPadPress(m, 'close');
    expect(m.info().open).toBe(false);
  });
});

describe('えらびが うごく（頭の ▼）', () => {
  it('card:<id> に えらびが 乗ると その子に ▼（pick()）。ほかの 名前では 消える', () => {
    const { m } = make();
    m.open(5);
    coopPadPress(m, 'meat');
    coopPadFocus(m, 'card:13');
    expect(m.pick()).toBe(13);
    coopPadFocus(m, 'back');
    expect(m.pick()).toBeNull();
    coopPadFocus(m, 'card:11');
    coopPadFocus(m, null);
    expect(m.pick()).toBeNull();
  });
});

describe('B（もどる／とじる）', () => {
  it('pick → top。top → とじる。confirm → とじる', () => {
    const { m } = make();
    m.open(5);
    coopPadPress(m, 'meat');
    coopPadBack(m);
    expect(m.info()).toMatchObject({ open: true, page: 'top' });
    coopPadBack(m);
    expect(m.info().open).toBe(false);
    m.open(5);
    coopPadPress(m, 'meat');
    coopPadPress(m, 'card:11');
    coopPadBack(m);
    expect(m.info().open).toBe(false);
  });
  it('ひらいて いない とき の B は 何も しない', () => {
    const { m, log } = make();
    coopPadBack(m);
    expect(log).toEqual([]);
  });
});
