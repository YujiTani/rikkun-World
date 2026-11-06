import { describe, expect, it } from 'vitest';
import { InventoryImpl } from '../inventory/Inventory';
import { P2State } from './p2State';
import { DuoSession, type DuoStepInput } from './session';
import { DUO_TUNING } from './tuning';
import type { DuoLeaveReason, P2Save } from './types';

/**
 * COOP-1 作業 1（#395）の 先行テスト（赤）。AC5（60 秒でやめる）・AC6・AC7・AC8・AC9・AC17。
 *
 * ---- developer への つなぎ目の 約束 ----
 *   src/duo/p2State.ts  `P2State`（2P の もちもの `inventory`（InventoryImpl と 同じ 物）・`level` {level, xp}。serialize / deserialize / clear）
 *   src/duo/session.ts  `DuoSession`（宣言は session.ts）。時間は 持たず、step() を 固定ステップごとに 1 回 呼ぶ。
 *     - join(): loadP2() が 返した セーブが あれば p2 に 戻し、なければ からっぽで 始める。もう 参加して いれば false。
 *     - leave(reason): 参加中なら saveP2(p2.serialize()) → p2 を からにする → joined = false → onLeft(reason)。いなければ 何もしない。
 *     - step({ padPresent, quitHeld }):
 *         quitHeld が 120 ステップ つづいたら leave('quit')。はなすと ゲージは すぐ 0（途中までは 何も 起きない）。
 *         padPresent = false に なった その step で padLost() = true。つづけて 3600 ステップ ぬけたままなら leave('padLost')。つながれば 数えなおし。
 *     - cameraDistance(): 参加で 1 人 4.0 → 2 人（2P が いる あいだ いつも）DUO_TUNING.cameraSplit = 5.0、やめて 5.0 → 4.0。30 ステップ（0.5 秒）で とどく なめらかな 変化。step() ごとに 進む。
 *       作業 3e（#422。1.8）: 6.0（1 画面・ルーペの 距離）は なくなった。2P が 近くても（2 マス）遠くても 同じ 5.0（距離は 見ない）。`DUO_TUNING.cameraDuo` を なくす。
 *   配線: 「さいしょから」「別の世界」「セーブ読み直し」は leave('newGame' | 'otherWorld' | 'reload') を 呼ぶ（AC17）。
 */

const idle: DuoStepInput = { padPresent: true, quitHeld: false };

function make(saved: P2Save | null = null) {
  const log: string[] = [];
  const store = { saved };
  const p2 = new P2State();
  let joinedAtSave: boolean | null = null;
  const session: DuoSession = new DuoSession({
    p2,
    saveP2: (s) => {
      log.push('save');
      joinedAtSave = session.joined;
      store.saved = s;
    },
    loadP2: () => store.saved,
    onLeft: (r: DuoLeaveReason) => log.push(`left:${r}`),
  });
  const run = (n: number, input: DuoStepInput = idle) => {
    for (let i = 0; i < n; i++) session.step(input);
  };
  return { session, p2, log, store, run, joinedAtSave: () => joinedAtSave };
}

describe('AC6: 「やめる」を 2 秒（120 ステップ）長押し', () => {
  it('120 ステップで 2P が いなくなる', () => {
    const { session, run, log } = make();
    session.join();
    run(119, { padPresent: true, quitHeld: true });
    expect(session.joined).toBe(true);
    run(1, { padPresent: true, quitHeld: true });
    expect(session.joined).toBe(false);
    expect(log).toEqual(['save', 'left:quit']);
  });

  it('ゲージは 120 ステップで 満タンに むかって たまる（60 ステップで 半分）', () => {
    const { session, run } = make();
    session.join();
    run(60, { padPresent: true, quitHeld: true });
    expect(session.quitGauge()).toBeCloseTo(0.5, 1);
    expect(session.quitGauge()).toBeGreaterThan(0);
  });

  it('119 ステップで はなすと ゲージは 0、2P は いるまま。つづけて 119 ステップ 押しても たまりなおし（足し算に ならない）', () => {
    const { session, run } = make();
    session.join();
    run(119, { padPresent: true, quitHeld: true });
    run(1);
    expect(session.quitGauge()).toBe(0);
    expect(session.joined).toBe(true);
    run(119, { padPresent: true, quitHeld: true });
    expect(session.joined).toBe(true);
  });

  it('やめると カメラの 距離が 1 人の 値（4.0）に 戻る（30 ステップ以内）', () => {
    const { session, run } = make();
    session.join();
    run(60);
    expect(session.cameraDistance()).toBeCloseTo(DUO_TUNING.cameraSplit, 1);
    run(120, { padPresent: true, quitHeld: true });
    expect(session.cameraDistanceTarget()).toBe(4.0);
    run(30);
    expect(session.cameraDistance()).toBeCloseTo(4.0, 1);
  });
});

describe('AC5: パッドが ぬけて 60 秒（3600 ステップ）で やめる', () => {
  it('ぬけた その step で padLost。3599 ステップは いるまま、3600 で いなくなる', () => {
    const { session, run, log } = make();
    session.join();
    run(1, { padPresent: false, quitHeld: false });
    expect(session.padLost()).toBe(true);
    run(3598, { padPresent: false, quitHeld: false });
    expect(session.joined).toBe(true);
    run(1, { padPresent: false, quitHeld: false });
    expect(session.joined).toBe(false);
    expect(log).toEqual(['save', 'left:padLost']);
  });

  it('つなぎ直すと padLost が false。数えなおし（100 ステップ ぬけて 戻って、また 3599 ステップ ぬけても いるまま）', () => {
    const { session, run } = make();
    session.join();
    run(100, { padPresent: false, quitHeld: false });
    run(1);
    expect(session.padLost()).toBe(false);
    run(3599, { padPresent: false, quitHeld: false });
    expect(session.joined).toBe(true);
  });
});

describe('AC8: 2P が いる あいだ カメラの 距離は 分割の 値（5.0。0.5 秒以内）', () => {
  it('1 人は 4.0、参加で 5.0 に むかい、30 ステップで とどく。行き過ぎない', () => {
    const { session, run } = make();
    expect(session.cameraDistance()).toBe(4.0);
    session.join();
    expect(session.cameraDistanceTarget()).toBe(DUO_TUNING.cameraSplit);
    expect(DUO_TUNING.cameraSplit).toBe(5.0);
    let prev = session.cameraDistance();
    for (let i = 0; i < 30; i++) {
      run(1);
      const d = session.cameraDistance();
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(d).toBeLessThanOrEqual(DUO_TUNING.cameraSplit + 1e-9);
      prev = d;
    }
    expect(session.cameraDistance()).toBeCloseTo(DUO_TUNING.cameraSplit, 1);
  });
  it('参加 した 次の step では まだ 途中（いきなり とばない）', () => {
    const { session, run } = make();
    session.join();
    run(1);
    expect(session.cameraDistance()).toBeGreaterThan(4.0);
    expect(session.cameraDistance()).toBeLessThan(DUO_TUNING.cameraSplit);
  });
});

describe('AC7: やめたあと ＋ で また 参加すると 同じ もちもので 始まる', () => {
  it('やめる前の 持ち物・レベルで 戻る', () => {
    const { session, p2, run } = make();
    const before = p2.inventory;
    session.join();
    p2.inventory.add('dirt', 7);
    p2.level = { level: 3, xp: 12 };
    run(120, { padPresent: true, quitHeld: true });
    expect(session.joined).toBe(false);
    expect(session.join()).toBe(true);
    expect(p2.inventory, '差しかえない（参照が 同じ）').toBe(before);
    expect(p2.inventory.count('dirt')).toBe(7);
    expect(p2.level).toEqual({ level: 3, xp: 12 });
  });
  it('はじめて 参加する 世界では からっぽ（レベル 1）', () => {
    const { session, p2 } = make(null);
    session.join();
    expect(p2.inventory.count('dirt')).toBe(0);
    expect(p2.level).toEqual({ level: 1, xp: 0 });
  });
  it('セーブから 来た 持ち物で 始まる（次に 世界を 開いた とき）', () => {
    const src = new P2State();
    src.inventory.add('stone', 5);
    const { session, p2 } = make(src.serialize());
    session.join();
    expect(p2.inventory.count('stone')).toBe(5);
  });
});

describe('AC9: 2P の 持ち物は 1P と 別', () => {
  it('2P が ひろった 物は 1P に 入らない', () => {
    const p1 = new InventoryImpl();
    const { session, p2 } = make();
    session.join();
    p2.inventory.add('dirt', 3);
    expect(p2.inventory.count('dirt')).toBe(3);
    expect(p1.count('dirt')).toBe(0);
    expect(p2.inventory).not.toBe(p1);
  });
  it('serialize は 2P の 持ち物だけ（コピー。あとで 変えても 保存した 値は 変わらない）', () => {
    const { p2 } = make();
    p2.inventory.add('dirt', 3);
    const saved = p2.serialize();
    p2.inventory.add('dirt', 4);
    const back = new P2State();
    back.deserialize(saved);
    expect(back.inventory.count('dirt')).toBe(3);
  });
  it('形が おかしい セーブ・null は からっぽで 読む（こわれない）', () => {
    const p = new P2State();
    for (const bad of [null, undefined, 5, 'x', { level: 'a' }]) {
      expect(() => p.deserialize(bad)).not.toThrow();
      expect(p.level).toEqual({ level: 1, xp: 0 });
    }
  });
});

describe('AC17: 「さいしょから」・別の世界・読み直しで 2P の 持ち物を 保存してから いなくなる', () => {
  it.each(['newGame', 'otherWorld', 'reload'] as const)('%s: 保存 → いなくなる の 順', (reason) => {
    const { session, p2, log, store, joinedAtSave } = make();
    session.join();
    p2.inventory.add('dirt', 9);
    session.leave(reason);
    expect(log).toEqual(['save', `left:${reason}`]);
    expect(joinedAtSave()).toBe(true); // 保存の ときは まだ 参加中
    expect(session.joined).toBe(false);
    const back = new P2State();
    back.deserialize(store.saved);
    expect(back.inventory.count('dirt')).toBe(9);
  });
  it('2P が いなければ 何も 保存しない・呼ばない', () => {
    const { session, log } = make();
    session.leave('newGame');
    expect(log).toEqual([]);
  });
});
