import { describe, expect, it } from 'vitest';
import { hitsTarget } from './rules';
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
 *     new P2Life({ maxHp: number; p1Down: () => boolean; onReturn?: () => void; returnSteps?: number })
 *       maxHp = 1P と 同じ（`createCombatConfig().playerMaxHp`）。returnSteps の 既定 = `DUO_TUNING.p2ReturnSteps`（180。3 秒。§9.5）。
 *     hp（読む）・maxHp・down（倒れているか）・returnLeft（戻るまでの のこり ステップ。倒れていないとき 0）
 *     damage(amount: number, from: HitSource): { applied: number; knock: boolean }
 *       HitSource = { type: 'yokai' } | { type: 'player'; who: 1 | 2 }。from が player なら hp は へらず { applied: 0, knock: false }（AC37）。
 *       倒れている あいだの damage は 何もしない（applied 0）。hp が 0 に なったら down = true・returnLeft = returnSteps。
 *     fill(): hp を maxHp に（レベルアップ時。倒れているときは 何もしない）
 *     step(): 倒れているとき returnLeft を 1 へらす。0 に なっても p1Down() が true の あいだは 待つ（AC44）。
 *       戻れる ステップで hp = maxHp・down = false・onReturn()（1P の 横に 置く配線は 呼ぶ側）。
 *       1P が 起きたら、すでに returnLeft が 0 なら 次の step() で 戻る。
 */

const MAX = 20; // 数は テストの ための 仮の 値（P2Life は 渡された maxHp を 使うだけ）

function make(p1Down = false, over: Partial<P2LifeDeps> = {}) {
  const st = { p1Down, returned: 0 };
  const life = new P2Life({ maxHp: MAX, p1Down: () => st.p1Down, onReturn: () => st.returned++, ...over });
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

describe('AC43: 2P の ハートが 0 → 3 秒（180 ステップ）後に 満タンで 戻る。1P は 倒れた 画面に ならない', () => {
  it('0 で 倒れ、179 ステップでは まだ 倒れたまま、180 ステップ目に 満タンで 戻る（onReturn は 1 回）', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    expect(life.hp).toBe(0);
    expect(life.down).toBe(true);
    expect(life.returnLeft).toBe(180);
    run(179);
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
    expect(life.returnLeft).toBe(80);
    run(80);
    expect(life.down).toBe(false);
  });
  it('倒れているあいだに fill()（レベルアップ）しても 起きない。戻ってからなら 満タンに できる', () => {
    const { life, run } = make();
    life.damage(MAX, { type: 'yokai' });
    life.fill();
    expect(life.down).toBe(true);
    expect(life.hp).toBe(0);
    run(180);
    life.damage(5, { type: 'yokai' });
    life.fill();
    expect(life.hp).toBe(MAX);
  });
  it('戻ったあと また 倒れたら また 180 ステップ', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    run(180);
    life.damage(MAX, { type: 'yokai' });
    expect(life.returnLeft).toBe(180);
    run(180);
    expect(st.returned).toBe(2);
  });
  it('倒れたのは 2P だけ: 1P の 状態（p1Down）には さわらない', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    run(180);
    expect(st.p1Down).toBe(false);
  });
});

describe('AC44: 1P が 倒れている あいだに 2P も 倒れたら、2P は 1P が 起きたあとに 1P の 横に 戻る', () => {
  it('1P が 倒れたまま 180 ステップを こえても 2P は 戻らない。1P が 起きたら すぐ（次の ステップで）戻る', () => {
    const { life, run, st } = make(true);
    life.damage(MAX, { type: 'yokai' });
    run(180 + 400);
    expect(life.down).toBe(true);
    expect(st.returned).toBe(0);
    expect(life.returnLeft).toBe(0);
    st.p1Down = false;
    run(1);
    expect(life.down).toBe(false);
    expect(life.hp).toBe(MAX);
    expect(st.returned).toBe(1);
  });
  it('1P が 180 ステップより 前に 起きたら ふつうに 180 ステップ目に 戻る', () => {
    const { life, run, st } = make(true);
    life.damage(MAX, { type: 'yokai' });
    run(50);
    st.p1Down = false;
    run(129);
    expect(life.down).toBe(true);
    run(1);
    expect(life.down).toBe(false);
    expect(st.returned).toBe(1);
  });
});
