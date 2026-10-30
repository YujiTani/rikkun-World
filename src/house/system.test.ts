import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { NOD_STEPS } from './architect';
import { makeFakeWorld } from './fakeWorld';
import { createHouseHook } from './hook';
import { HouseSystem, TALK_RANGE, type HouseSystemDeps } from './system';
import { GREET_STEPS, SAY } from './talk';

/** HOUSE-1A: 建築士さん・話す 流れ・くら・窓口の つなぎ。AC3・AC41 の 通し（ゲームの 時計を まねた 小さな ループで） */

const SPAWN = { x: 64.5, z: 64.5, yawDeg: 0 };

function make(over: Partial<HouseSystemDeps> = {}) {
  const bag = new InventoryImpl();
  const player = { x: SPAWN.x, y: 11, z: SPAWN.z };
  const calls: string[] = [];
  const world = makeFakeWorld();
  const sys = new HouseSystem({
    seed: 77,
    world,
    spawn: () => SPAWN,
    player: () => player,
    bag,
    voice: () => calls.push('voice'),
    gave: (i) => calls.push(`gave:${i}`),
    onOpen: () => calls.push('open'),
    onClose: () => calls.push('close'),
    isLand: () => true,
    ...over,
  });
  return { sys, bag, player, calls, world };
}

/** ゲームの 1 ステップ: メニューが 開いて いる 間は 世界を 進めない（Game の モーダルと 同じ） */
function stepper(sys: HouseSystem) {
  const w = { time: 0, yokai: 0, steps: 0 };
  return {
    w,
    step(n = 1): void {
      for (let i = 0; i < n; i++) {
        w.steps++;
        if (sys.frozen()) continue;
        w.time++;
        w.yokai++;
        sys.update();
      }
    },
  };
}

describe('話す 通し（右クリック 〜 メニュー）', () => {
  it('はじめて: うなずき 22 → あいさつ 2 行 → メニュー。声は 1 回。道具は メニューが 開く 前に わたす。open と 同時に ボタンも そろう', () => {
    const { sys, bag, calls } = make();
    const g = stepper(sys);
    g.step(1);
    const a = sys.architects().find((q) => q.first)!;
    expect(a).toBeTruthy();
    expect(sys.talkTo(a.id)).toBe(true);
    expect(calls).toEqual(['voice']);
    expect(sys.menu().bubble).toBe(SAY.hello);
    let atOpen: { buttons: string[]; m: number; d: number } | null = null;
    let steps = 0;
    while (!sys.menu().open && steps < 300) {
      g.step(1);
      steps++;
      if (sys.menu().open) atOpen = { buttons: sys.menu().buttons.map((b) => b.id), m: bag.count('mizumori' as ItemId), d: bag.count('dotsuki' as ItemId) };
    }
    expect(steps).toBe(NOD_STEPS + GREET_STEPS * 2);
    expect(atOpen).toEqual({ buttons: ['kura', 'editor', 'build', 'rename', 'close'], m: 1, d: 1 });
    expect(calls.filter((c) => c === 'voice')).toHaveLength(1);
    expect(calls).toEqual(['voice', 'gave:mizumori', 'gave:dotsuki', 'open']);
  });

  it('2 回目: うなずき 22 ステップで メニュー（21 ステップ目までは まだ）', () => {
    const { sys } = make();
    sys.state.record.toolsGiven = true;
    const g = stepper(sys);
    g.step(1);
    const a = sys.architects()[0]!;
    sys.talkTo(a.id);
    for (let i = 1; i <= 21; i++) {
      g.step(1);
      expect(sys.menu().open, `step ${i}`).toBe(false);
    }
    g.step(1);
    expect(sys.menu().open).toBe(true);
    expect(sys.menu().page).toBe('top');
  });

  it('AC41: メニューが 開いて いる 間は step(600) しても 時刻・妖怪が 動かない。とじると また 進む（くらの 画面でも）', () => {
    const { sys, calls } = make();
    sys.state.record.toolsGiven = true;
    const g = stepper(sys);
    g.step(1);
    sys.talkTo(sys.architects()[0]!.id);
    g.step(NOD_STEPS);
    expect(sys.menu().open).toBe(true);
    const t0 = { ...g.w };
    g.step(600);
    expect(g.w.time, 'メニューの 間 時刻').toBe(t0.time);
    expect(g.w.yokai, 'メニューの 間 妖怪').toBe(t0.yokai);
    sys.press('kura');
    g.step(600);
    expect(g.w.time, 'くらの 間 時刻').toBe(t0.time);
    expect(g.w.yokai, 'くらの 間 妖怪').toBe(t0.yokai);
    sys.press('close');
    expect(sys.frozen()).toBe(false);
    g.step(60);
    expect(g.w.time).toBe(t0.time + 60);
    expect(g.w.yokai).toBe(t0.yokai + 60);
    expect(calls.filter((c) => c === 'open')).toHaveLength(1);
    expect(calls.filter((c) => c === 'close')).toHaveLength(1);
  });

  it('うなずき・あいさつの 間は 時間が すすむ（止まるのは メニューが 開いてから）', () => {
    const { sys } = make();
    const g = stepper(sys);
    g.step(1);
    sys.talkTo(sys.architects()[0]!.id);
    const t0 = g.w.time;
    g.step(50);
    expect(sys.frozen()).toBe(false);
    expect(g.w.time).toBe(t0 + 50);
  });

  it('いない 人・話して いる 最中には 話しかけられない', () => {
    const { sys, calls } = make();
    const g = stepper(sys);
    g.step(1);
    expect(sys.talkTo('nobody')).toBe(false);
    expect(sys.talkTo(sys.architects()[0]!.id)).toBe(true);
    expect(sys.talkTo(sys.architects()[0]!.id)).toBe(false);
    expect(calls.filter((c) => c === 'voice')).toHaveLength(1);
  });
});

describe('話しが 中断される とき', () => {
  it('プレイヤーが TALK_RANGE より はなれたら やめる（メニューは 開かない・道具は まだ）', () => {
    const { sys, player, calls } = make();
    const g = stepper(sys);
    g.step(1);
    const a = sys.architects()[0]!;
    sys.talkTo(a.id);
    g.step(10);
    player.x = a.x + TALK_RANGE + 1;
    g.step(1);
    expect(sys.menu()).toEqual({ open: false, page: null, bubble: '', buttons: [] });
    expect(sys.state.record.toolsGiven).toBe(false);
    expect(calls).not.toContain('open');
    expect(sys.manager.get(a.id)!.state).not.toBe('talk');
  });

  it('interrupted() が true（やられた・ほかの 画面）なら やめる', () => {
    let stop = false;
    const { sys } = make({ interrupted: () => stop });
    const g = stepper(sys);
    g.step(1);
    sys.talkTo(sys.architects()[0]!.id);
    g.step(5);
    stop = true;
    g.step(1);
    expect(sys.menu().bubble).toBe('');
    expect(sys.talk.current()).toBeNull();
  });

  it('建築士さんが 一覧から きえたら（遠くへ テレポート）話しを やめる', () => {
    const { sys, player } = make();
    const g = stepper(sys);
    g.step(1);
    sys.talkTo(sys.architects()[0]!.id);
    g.step(5);
    player.x += 5000;
    player.z += 5000;
    g.step(1);
    expect(sys.talk.current()).toBeNull();
    expect(sys.menu().open).toBe(false);
  });
});

describe('画面への 合図（onChange）', () => {
  it('ふきだし・ページ・くらの 中身が かわる たびに 呼ばれる。何も かわらない ステップでは 呼ばれない', () => {
    const { sys, bag } = make();
    sys.state.record.toolsGiven = true;
    let n = 0;
    sys.setOnChange(() => n++);
    const g = stepper(sys);
    g.step(5);
    expect(n).toBe(0);
    sys.talkTo(sys.architects()[0]!.id);
    expect(n).toBe(1);
    g.step(NOD_STEPS - 1);
    expect(n).toBe(1);
    g.step(1); // メニューが 開く
    expect(n).toBe(2);
    sys.press('kura');
    expect(n).toBe(3);
    bag.add('log', 5);
    sys.deposit('log', 3);
    expect(n).toBe(4);
    sys.press('close');
    expect(n).toBe(5);
  });
});

describe('窓口 window.__rikkun.house', () => {
  it('architects・talk・menu・press・kura・deposit・withdraw が 仕様どおりの 形で 動く', () => {
    const { sys, bag } = make();
    const hook = createHouseHook(sys);
    const g = stepper(sys);
    g.step(1);
    const list = hook.architects();
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]!).sort()).toEqual(['busy', 'first', 'id', 'x', 'y', 'z']);
    expect(hook.menu()).toEqual({ open: false, page: null, bubble: '', buttons: [] });
    hook.talk(list[0]!.id);
    g.step(NOD_STEPS + GREET_STEPS * 2);
    expect(hook.menu().open).toBe(true);
    expect(hook.menu().buttons.map((b) => b.id)).toEqual(['kura', 'editor', 'build', 'rename', 'close']);
    hook.press('kura');
    expect(hook.menu().page).toBe('kura');
    bag.add('log', 20);
    expect(hook.deposit('log', 10)).toBe(10);
    expect(hook.kura()).toEqual({ log: 10 });
    expect(hook.withdraw('log', 4)).toBe(4);
    expect(hook.kura()).toEqual({ log: 6 });
    expect(bag.count('log')).toBe(14);
    hook.press('close', undefined);
    expect(hook.menu().open).toBe(false);
    // メニューが とじて いても 出し入れは 動く
    expect(hook.deposit('log', 14)).toBe(14);
    expect(hook.kura()).toEqual({ log: 20 });
    // JSON を 通しても 同じ（page.evaluate で 返せる）
    expect(JSON.parse(JSON.stringify(hook.menu()))).toEqual(hook.menu());
    expect(JSON.parse(JSON.stringify(hook.architects()))).toEqual(hook.architects());
  });

  it('talk は 数字の id でも 文字の id でも よい。いない id は 何も おきない', () => {
    const { sys } = make();
    const hook = createHouseHook(sys);
    stepper(sys).step(1);
    hook.talk('zzz');
    expect(sys.talk.current()).toBeNull();
    hook.talk(hook.architects()[0]!.id);
    expect(sys.talk.current()).toBe('first');
  });
});
