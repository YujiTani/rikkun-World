import { describe, expect, it } from 'vitest';
import { InventoryImpl } from '../inventory/Inventory';
import { createSelectLock } from '../legend/selectLock';
import { invMayOpen } from './invRules';
import { chargeAndRelease, chargeTicksOf, itemByCharge } from './p2LegendKit';
import { makeP2 } from './p2LegendRig';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)「もちもの画面」・AC105・AC113）の 先行テスト（赤）。
 * シャイニング中は **その人の** もちもの画面が 開かず、手の 物を かえられない。もう 1 人は 開ける・かえられる。
 *
 * ---- 実装への 約束 ----
 *   src/legend/selectLock.ts   createSelectLock(): { step(locked: boolean, inv: { selected(): number; select(i: number): void }): void }
 *     1P の step.ts に 直接 書いて ある `nijiLockSel`（「シャイニング中は ホットバーの えらびを かえさせない」）を 1 つの 部品に した もの。1P も 2P も これを 使う（式の コピーなし）。
 *     locked が false→true に なった ステップに その ときの `inv.selected()` を おぼえ、true の あいだ 毎ステップ えらびが ちがえば `inv.select(おぼえた 番号)` で もどす。
 *     locked が false に なったら わすれる（その ステップから えらびを かえてよい）。locked が false の ときは inv に さわらない。
 *     2P の 配線: `selLock.step(p2legend.locked(), p2.inventory)` を 2P の ホットバー操作の あと（duo.ts の step 内）に 1 回。
 *     **順番**: 2P の ホットバー操作（数字キー・ホイール・持ちかえ）が えらびを かえる → そのあとで selLock.step。先に 呼ぶと その ステップの かえが 1 ステップ だけ 通る。
 *     入力の ふりわけ（ZR だけ → ため・run＋ZR → パリィ）は 1P と 同じ DigSystemImpl/digInput.ts（routeAttackInput）を 使う ので 新しく 書かない。
 *     後から マージする 方（4d-1 か 4d-2）が src/duo/p2Dig.test.ts に 1 本 足す（p2Legend.test.ts の 頭 参照）。
 *   src/duo/invRules.ts        invMayOpen(i: { down: boolean; legendLocked: boolean }): boolean
 *     2P の もちもの画面を 開いて よいか。倒れて いる（down）か シャイニング中（legendLocked）なら false。
 *     2P の 開き口 3 つ（Y のもちもの・かまどを ねらった ZL・たんすを ねらった Y／ZL）が ぜんぶ これを 通る（1P の `screen.canOpen = !legend.locked()` と 同じ 考え方）。
 *     legendLocked には `createP2Legend().locked()` を わたす。
 */

describe('invMayOpen: 2P の もちもの画面を 開いて よいか', () => {
  it('ふだんは 開ける。倒れて いる・シャイニング中は 開けない（どちらでも）', () => {
    expect(invMayOpen({ down: false, legendLocked: false })).toBe(true);
    expect(invMayOpen({ down: true, legendLocked: false })).toBe(false);
    expect(invMayOpen({ down: false, legendLocked: true })).toBe(false);
    expect(invMayOpen({ down: true, legendLocked: true })).toBe(false);
  });

  it('2P の シャイニングの あいだ だけ 開けず、おわると 開ける（locked() を そのまま わたす）', () => {
    const item = itemByCharge('shining');
    const t = makeP2({ item });
    const log: boolean[] = [];
    chargeAndRelease(
      (c) => {
        t.step(c);
        log.push(invMayOpen({ down: false, legendLocked: t.p2.locked() }));
      },
      chargeTicksOf(item),
      330,
    );
    const ticks = chargeTicksOf(item);
    expect(log.slice(0, ticks), 'ためている あいだは 開ける').toEqual(Array(ticks).fill(true));
    expect(log.slice(ticks, ticks + 50).every((v) => v === false), 'シャイニング中は 開けない').toBe(true);
    expect(log.at(-1)).toBe(true);
    expect(log.filter((v) => !v).length, 'とじて いる のは 上がる+とどまる+おりる の あいだ だけ').toBeGreaterThan(200);
  });

  it('もう 1 人は 関係ない: 1P の 状態（locked false）なら 2P の シャイニング中でも 1P は 開ける', () => {
    expect(invMayOpen({ down: false, legendLocked: false })).toBe(true);
  });
});

describe('createSelectLock: 手の 物を かえられない（1P も 2P も 同じ 部品）', () => {
  function inv() {
    const i = new InventoryImpl();
    i.setSlot(0, { item: 'dirt', count: 3 });
    i.setSlot(1, { item: 'stone', count: 3 });
    i.setSlot(2, { item: 'torch', count: 3 });
    i.select(1);
    return i;
  }

  it('locked に なった ときの えらびを おぼえ、locked の あいだ かえられても もどす', () => {
    const i = inv();
    const l = createSelectLock();
    l.step(false, i);
    i.select(2);
    l.step(false, i);
    expect(i.selected(), 'locked でない ときは 触らない').toBe(2);
    l.step(true, i);
    expect(i.selected()).toBe(2);
    i.select(0);
    l.step(true, i);
    expect(i.selected(), 'もどした').toBe(2);
    i.selectNext(1);
    l.step(true, i);
    expect(i.selected()).toBe(2);
  });

  it('locked が おわると わすれる: そこから かえて よい。次の locked は その ときの えらびを おぼえる', () => {
    const i = inv();
    const l = createSelectLock();
    l.step(true, i);
    i.select(0);
    l.step(true, i);
    expect(i.selected()).toBe(1);
    l.step(false, i);
    i.select(0);
    l.step(false, i);
    expect(i.selected()).toBe(0);
    l.step(true, i);
    i.select(2);
    l.step(true, i);
    expect(i.selected()).toBe(0);
  });

  it('2 つの 部品（1P 用・2P 用）は おたがいに かかわらない', () => {
    const a = inv();
    const b = inv();
    const la = createSelectLock();
    const lb = createSelectLock();
    la.step(true, a);
    lb.step(false, b);
    a.select(0);
    b.select(0);
    la.step(true, a);
    lb.step(false, b);
    expect(a.selected()).toBe(1);
    expect(b.selected()).toBe(0);
  });

  it('2P の わざ（locked()）に つなぐと、シャイニング中は えらびが かわらず おわると かわる', () => {
    const item = itemByCharge('shining');
    const t = makeP2({ item });
    const i = inv();
    const l = createSelectLock();
    const ticks = chargeTicksOf(item);
    let during = true;
    let after = false;
    chargeAndRelease(
      (c) => {
        t.step(c);
        l.step(t.p2.locked(), i);
        if (t.p2.locked()) {
          i.select((i.selected() + 1) % 3); // ボタンを おして かえようと する
          l.step(t.p2.locked(), i);
          during = during && i.selected() === 1;
        } else if (t.tick() > ticks + 280 && !after) {
          i.select(2);
          l.step(false, i);
          after = i.selected() === 2;
        }
      },
      ticks,
      330,
    );
    expect(during).toBe(true);
    expect(after).toBe(true);
  });
});
