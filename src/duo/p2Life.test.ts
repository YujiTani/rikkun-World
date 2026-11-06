import { describe, expect, it } from 'vitest';
import { createCombatConfig } from '../combat/config';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { hitsTarget } from './rules';
import { takeDropBag } from './p2Bag';
import { DUO_TUNING } from './tuning';
import { P2Life, type P2LifeDeps } from './p2Life';

/**
 * COOP-1 作業 3a（#416）の 先行テスト（赤）。AC37（仲間には 当たらない）・AC43（2P が 倒れて 戻る）・AC44（1P が 倒れている あいだに 2P も 倒れた）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/rules.ts  `hitsTarget(attacker: 1 | 2, target: HitTarget): boolean`
 *     HitTarget = { type: 'player'; who: 1 | 2 } | { type: 'yokai' } | { type: 'animal' }
 *     こうげき（刀・弓・パンチ・火の玉の はね返しの あたり）が その あいてに 当たるか。プレイヤー（自分も 仲間も）には いつも false、妖怪・動物は true。
 *     配線: 刀・弓・パンチの あたり判定の 前に これを 通す（仲間の 体は あたり判定に 入れない）。
 *   src/duo/p2Life.ts  `class P2Life`（2P の ハートと 倒れて 戻る係。DOM・Three.js なし。step() を 1/60 秒ごとに 1 回）
 *     new P2Life({ maxHp: number; p1Down: () => boolean; onReturn?: () => void; onDown?: () => void; returnSteps?: number })
 *       onDown = hp が 0 に なった ステップに 1 回（おとしもの袋を 出す 配線。下の takeDropBag）。
 *       maxHp = 1P と 同じ（`createCombatConfig().playerMaxHp`）。returnSteps の 既定 = `DUO_TUNING.p2ReturnSteps`（3 秒。§9.5。数は 表 tuning.ts に 足す）。
 *     hp（読む）・maxHp・down（倒れているか）・returnLeft（戻るまでの のこり ステップ。倒れていないとき 0）
 *     damage(amount: number, from: HitSource): { applied: number; knock: boolean }
 *       HitSource = { type: 'yokai' } | { type: 'player'; who: 1 | 2 }。from が player なら hp は へらず { applied: 0, knock: false }（AC37）。
 *       倒れている あいだの damage は 何もしない（applied 0）。hp が 0 に なったら down = true・returnLeft = returnSteps。
 *     fill(): hp を maxHp に（レベルアップ時。倒れているときは 何もしない）
 *     step(): 倒れているとき returnLeft を 1 へらす。0 に なっても p1Down() が true の あいだは 待つ（AC44）。
 *       戻れる ステップで hp = maxHp・down = false・onReturn()（1P の 横に 置く配線は 呼ぶ側）。
 *       1P が 起きたら、すでに returnLeft が 0 なら 次の step() で 戻る。
 *   src/duo/p2Bag.ts  `takeDropBag(inv: Inventory, rng: Rng, dropChance: number): ItemStack[]`（§2.6・M3 §2.10。おとしもの袋）
 *     選んでいる マス以外の マスごとに rng() < dropChance なら そのマスを からにして 返す（1P の `PlayerCombat.die` と 同じ きまり。dropChance は `createCombatConfig().dropChance`）。
 *     配線: P2Life の onDown で DropField.scatter(2P の 足もと, 返った stacks, { kind: 'death' })。
 *   配線の きまり（テストは 口の ある所だけ）: ① P2Life.down の あいだ 2P の 入力は ぜんぶ はなす（歩く・ほる・おく・こうげき・ホットバー）
 *     ② 2P が たおした ときの feedDefeat の with（なにで）・hp は 2P の もの（who=2 なら 2P の 持ち物の 手・2P の ハート）。
 *     ③ 妖怪の partner.targetable = !P2Life.down && パッドが ある。
 */

/** 戻るまでの ステップ数（仕様 §9.5。3 秒）。数は 表から 読む */
const RET = DUO_TUNING.p2ReturnSteps;
const MAX = 20; // 数は テストの ための 仮の 値（P2Life は 渡された maxHp を 使うだけ）

function make(p1Down = false, over: Partial<P2LifeDeps> = {}) {
  const st = { p1Down, returned: 0, downed: 0 };
  const life = new P2Life({ maxHp: MAX, p1Down: () => st.p1Down, onReturn: () => st.returned++, onDown: () => st.downed++, ...over });
  const run = (n: number) => {
    for (let i = 0; i < n; i++) life.step();
  };
  return { life, st, run };
}

describe('AC37: どちらの こうげきも 仲間には ダメージ 0・のけぞりなし', () => {
  it.each([1, 2] as const)('%iP の こうげきは プレイヤーに 当たらない（hitsTarget）', (who) => {
    expect(hitsTarget(who, { type: 'player', who: 1 })).toBe(false);
    expect(hitsTarget(who, { type: 'player', who: 2 })).toBe(false);
  });
  it('妖怪・動物には 当たる', () => {
    for (const who of [1, 2] as const) {
      expect(hitsTarget(who, { type: 'yokai' })).toBe(true);
      expect(hitsTarget(who, { type: 'animal' })).toBe(true);
    }
  });
  it('2P に 1P の こうげきが 来ても ハートは へらず のけぞらない', () => {
    const { life } = make();
    expect(life.hp).toBe(MAX);
    const r = life.damage(7, { type: 'player', who: 1 });
    expect(r).toEqual({ applied: 0, knock: false });
    expect(life.hp).toBe(MAX);
    expect(life.down).toBe(false);
  });
  it('2P 自身の こうげきも 自分には 当たらない。妖怪の こうげきは ふつうに 当たる（対照）', () => {
    const { life } = make();
    expect(life.damage(3, { type: 'player', who: 2 })).toEqual({ applied: 0, knock: false });
    const r = life.damage(3, { type: 'yokai' });
    expect(r.applied).toBe(3);
    expect(life.hp).toBe(MAX - 3);
  });
});

describe('AC43: 2P の ハートが 0 → 3 秒（DUO_TUNING.p2ReturnSteps）後に 満タンで 戻る。1P は 倒れた 画面に ならない', () => {
  it('0 で 倒れ、RET - 1 ステップでは まだ 倒れたまま、RET ステップ目に 満タンで 戻る（onReturn は 1 回）', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    expect(life.hp).toBe(0);
    expect(life.down).toBe(true);
    expect(life.returnLeft).toBe(RET);
    run(RET - 1);
    expect(life.down).toBe(true);
    expect(st.returned).toBe(0);
    expect(life.hp).toBe(0);
    run(1);
    expect(life.down).toBe(false);
    expect(life.hp).toBe(MAX);
    expect(life.returnLeft).toBe(0);
    expect(st.returned).toBe(1);
    run(300);
    expect(st.returned).toBe(1);
  });
  it('倒れている あいだに 追いうちを 受けても のびない・ふえない（hp は 0 のまま、戻る時間は そのまま）', () => {
    const { life, run } = make();
    life.damage(MAX + 5, { type: 'yokai' });
    run(100);
    expect(life.damage(4, { type: 'yokai' }).applied).toBe(0);
    expect(life.returnLeft).toBe(RET - 100);
    run(RET - 100);
    expect(life.down).toBe(false);
  });
  it('倒れているあいだに fill()（レベルアップ）しても 起きない。戻ってからなら 満タンに できる', () => {
    const { life, run } = make();
    life.damage(MAX, { type: 'yokai' });
    life.fill();
    expect(life.down).toBe(true);
    expect(life.hp).toBe(0);
    run(RET);
    life.damage(5, { type: 'yokai' });
    life.fill();
    expect(life.hp).toBe(MAX);
  });
  it('戻ったあと また 倒れたら また RET ステップ', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    run(RET);
    life.damage(MAX, { type: 'yokai' });
    expect(life.returnLeft).toBe(RET);
    run(RET);
    expect(st.returned).toBe(2);
  });
  it('倒れたのは 2P だけ: 1P の 状態（p1Down）には さわらない', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    run(RET);
    expect(st.p1Down).toBe(false);
  });
});

describe('AC44: 1P が 倒れている あいだに 2P も 倒れたら、2P は 1P が 起きたあとに 1P の 横に 戻る', () => {
  it('1P が 倒れたまま RET ステップを こえても 2P は 戻らない。1P が 起きたら すぐ（次の ステップで）戻る', () => {
    const { life, run, st } = make(true);
    life.damage(MAX, { type: 'yokai' });
    run(RET + 400);
    expect(life.down).toBe(true);
    expect(st.returned).toBe(0);
    expect(life.returnLeft).toBe(0);
    st.p1Down = false;
    run(1);
    expect(life.down).toBe(false);
    expect(life.hp).toBe(MAX);
    expect(st.returned).toBe(1);
  });
  it('1P が RET ステップより 前に 起きたら ふつうに RET ステップ目に 戻る', () => {
    const { life, run, st } = make(true);
    life.damage(MAX, { type: 'yokai' });
    run(50);
    st.p1Down = false;
    run(RET - 51);
    expect(life.down).toBe(true);
    run(1);
    expect(life.down).toBe(false);
    expect(st.returned).toBe(1);
  });
});

describe('§2.6 おとしもの袋: 2P が 倒れたら 2P の 持ち物の 決まった 割合が 袋に（1P と 同じ きまり）', () => {
  function inv() {
    const i = new InventoryImpl();
    i.setSlot(0, { item: 'dirt', count: 3 });
    i.setSlot(1, { item: 'stone', count: 4 });
    i.setSlot(2, { item: 'torch', count: 5 });
    i.select(0);
    return i;
  }
  it('dropChance 1: 選んでいる マス以外が ぜんぶ 袋に 入り、持ち物から 消える。選んでいる マスは のこる', () => {
    const i = inv();
    const bag = takeDropBag(i, createRng(1), 1);
    expect(bag.map((s: { item: string }) => s.item).sort()).toEqual(['stone', 'torch']);
    expect(i.count('stone') + i.count('torch')).toBe(0);
    expect(i.count('dirt')).toBe(3);
  });
  it('dropChance 0: 何も 落とさない', () => {
    const i = inv();
    expect(takeDropBag(i, createRng(1), 0)).toEqual([]);
    expect(i.count('stone')).toBe(4);
  });
  it('今の 決まり（createCombatConfig().dropChance）で 同じ シードなら 同じ マスが 落ちる', () => {
    const p = createCombatConfig().dropChance;
    const a = takeDropBag(inv(), createRng(9), p);
    const b = takeDropBag(inv(), createRng(9), p);
    expect(a).toEqual(b);
  });
  it('P2Life: 倒れた ステップに onDown が 1 回だけ（追いうち・戻る ときは 呼ばない）', () => {
    const { life, st, run } = make();
    life.damage(MAX, { type: 'yokai' });
    life.damage(3, { type: 'yokai' });
    expect(st.downed).toBe(1);
    run(RET);
    expect(st.downed).toBe(1);
  });
});
