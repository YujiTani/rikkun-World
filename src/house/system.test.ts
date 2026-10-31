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
    let atOpen: { buttons: string[]; m: number; d: number; f: number } | null = null;
    let steps = 0;
    while (!sys.menu().open && steps < 300) {
      g.step(1);
      steps++;
      if (sys.menu().open) atOpen = { buttons: sys.menu().buttons.map((b) => b.id), m: bag.count('mizumori' as ItemId), d: bag.count('dotsuki' as ItemId), f: bag.count('fude' as ItemId) };
    }
    expect(steps).toBe(NOD_STEPS + GREET_STEPS * 2);
    expect(atOpen).toEqual({ buttons: ['kura', 'editor', 'build', 'rename', 'close'], m: 1, d: 1, f: 1 });
    expect(calls.filter((c) => c === 'voice')).toHaveLength(1);
    expect(calls).toEqual(['voice', 'gave:mizumori', 'gave:dotsuki', 'gave:fude', 'open']);
  });

  it('2 回目: うなずき 22 ステップで メニュー（21 ステップ目までは まだ）', () => {
    const { sys } = make();
    sys.state.record.toolsGiven = true;
    sys.state.record.fudeGiven = true;
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
    sys.state.record.fudeGiven = true;
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

  it('talking(): 話しかけてから とじるまで true（うなずき・あいさつ・メニュー・くら）。frozen() は メニューが 開いて いる 間だけ', () => {
    const { sys } = make();
    const g = stepper(sys);
    g.step(1);
    expect(sys.talking()).toBe(false);
    sys.talkTo(sys.architects()[0]!.id);
    expect(sys.talking()).toBe(true);
    expect(sys.frozen()).toBe(false);
    g.step(NOD_STEPS + GREET_STEPS * 2);
    expect(sys.frozen()).toBe(true);
    expect(sys.talking()).toBe(true);
    sys.press('kura');
    expect(sys.talking()).toBe(true);
    sys.close();
    expect(sys.talking()).toBe(false);
    expect(sys.frozen()).toBe(false);
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
    sys.state.record.fudeGiven = true;
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

describe('1B 窓口: editor()・edit(op)・need()・blueprints()・Esc', () => {
  function opened() {
    const rig = make();
    rig.sys.state.record.toolsGiven = true;
    rig.sys.state.record.fudeGiven = true;
    const g = stepper(rig.sys);
    g.step(1);
    rig.sys.talkTo(rig.sys.architects()[0]!.id);
    g.step(NOD_STEPS);
    return { ...rig, g, hook: createHouseHook(rig.sys) };
  }

  it('エディターが 開いて いない とき editor() は null・edit() は false・menu の page は top', () => {
    const { sys, hook } = opened();
    expect(hook.editor()).toBeNull();
    expect(hook.edit({ op: 'windows', delta: 1 })).toBe(false);
    sys.press('editor');
    expect(sys.menu().page).toBe('editor');
    expect(hook.editor()).toMatchObject({ step: 'soto', size: { w: 5, d: 5 }, windows: 0, windowMax: 9, windowKind: 'shoji', roof: 'flat', light: 'lantern', canUndo: false, confirm: null, selected: null, preview: null });
    expect(hook.edit({ op: 'windows', delta: 1 })).toBe(true);
    expect(hook.editor()).toMatchObject({ windows: 1, windowCells: [{ wall: 'back', i: 2 }], canUndo: true });
  });

  it('保存から 読みこむ（load）と、作りかけは 保存の とおりに なり、もどす・すすむ の 記録は すてられる', () => {
    const { sys, hook } = opened();
    sys.press('editor');
    for (const op of [{ op: 'windows', delta: 1 }, { op: 'size', w: 7 }, { op: 'windows', delta: 1 }]) expect(hook.edit(op)).toBe(true);
    const saved = sys.state.serialize();
    expect(hook.edit({ op: 'undo' })).toBe(true);
    expect(hook.editor()).toMatchObject({ canUndo: true, canRedo: true });
    sys.load(saved);
    expect(hook.editor(), '読みこんだ 作りかけ（もどす の 記録は ない）').toMatchObject({ size: { w: 7, d: 5 }, windows: 2, canUndo: false, canRedo: false });
    sys.load(null);
    expect(hook.editor(), '保存が 空なら はじめの 形').toMatchObject({ size: { w: 5, d: 5 }, windows: 0, canUndo: false, canRedo: false });
  });

  /** つないだ つもりの 見本（呼ばれた 順を 記録）。向き・見おろす 角度は ドラッグで かわる */
  function fakePreview(sys: HouseSystem) {
    const log: string[] = [];
    const v = { outside: { yaw: 28, elev: 26 }, inside: { yaw: 40, elev: 50 } };
    const touched = { outside: false, inside: false };
    sys.preview = {
      info: (mode) => ({ yaw: v[mode].yaw, elev: v[mode].elev, touched: touched[mode], wait: touched[mode] ? 600 : null, builds: 3, glow: null }),
      drag: (dx, dy) => {
        const m = sys.previewMode()!;
        v[m].yaw -= dx / 2;
        v[m].elev += dy / 2;
        touched[m] = true;
        log.push(`drag ${dx},${dy}`);
        return true;
      },
      wheel: (dx, dy) => {
        const m = sys.previewMode()!;
        v[m].yaw -= (dx + dy) / 2;
        touched[m] = true;
        log.push(`wheel ${dx},${dy}`);
        return true;
      },
      hover: (on) => void log.push(`hover ${on}`),
    };
    return log;
  }

  it('見本の 情報（preview）は ① ② だけ（③ は null）。つないだ 見本から angle・pitch・touched・wait・builds・glow を もらう', () => {
    const { sys, hook } = opened();
    fakePreview(sys);
    sys.press('editor');
    expect(hook.editor()?.preview).toEqual({ mode: 'outside', roof: true, angle: 28, pitch: 26, touched: false, wait: null, builds: 3, glow: null });
    sys.press('next');
    expect(hook.editor()?.preview).toMatchObject({ mode: 'inside', roof: false, angle: 40, pitch: 50 });
    sys.press('next');
    expect(hook.editor()?.step).toBe('namae');
    expect(hook.editor()?.preview).toBeNull();
  });

  it('previewDrag・previewWheel: 今の { angle, pitch } を 返す。エディターが 開いて いない・③ は null で 何も かえない', () => {
    const { sys, hook } = opened();
    const log = fakePreview(sys);
    expect(hook.previewDrag(10, 10), 'エディターが 開いて いない').toBeNull();
    sys.press('editor');
    expect(hook.previewDrag(100, 40)).toEqual({ angle: -22, pitch: 46 });
    expect(hook.previewWheel(40, 60)).toEqual({ angle: -72, pitch: 46 });
    expect(hook.editor()?.preview).toMatchObject({ angle: -72, pitch: 46, touched: true, wait: 600 });
    sys.press('next');
    sys.press('next');
    expect(sys.editor.s.step).toBe('namae');
    expect(hook.previewDrag(10, 10), '③ では 見本が ない').toBeNull();
    expect(log).toEqual(['drag 100,40', 'wheel 40,60']);
  });

  it('ひつような もの・確かめの まどが 出て いる 間は まわせない（今の 値は 返す）', () => {
    const { sys, hook } = opened();
    const log = fakePreview(sys);
    sys.press('editor');
    sys.press('need');
    expect(sys.editor.needOpen).toBe(true);
    expect(hook.previewDrag(100, 40)).toEqual({ angle: 28, pitch: 26 });
    sys.press('needClose');
    sys.press('new');
    expect(sys.editor.confirm).toBe('reset');
    expect(hook.previewWheel(100, 0)).toEqual({ angle: 28, pitch: 26 });
    expect(log).toEqual([]);
  });

  it('見本を まわすと 置いた 家具の えらびは はずれる（AC57）。家具は のこる・もどす の 記録は ふえない', () => {
    const { sys, hook } = opened();
    fakePreview(sys);
    sys.press('editor');
    sys.press('next');
    expect(hook.edit({ op: 'place', kind: 'futon', x: 1, z: 1 })).toBe(true);
    expect(hook.edit({ op: 'select', x: 1, z: 1 })).toBe(true);
    expect(hook.editor()?.selected).toEqual({ x: 1, z: 1 });
    const undo = sys.editor.canUndo();
    hook.previewDrag(10, 0);
    expect(hook.editor()?.selected).toBeNull();
    expect(hook.editor()?.furniture).toHaveLength(1);
    expect(sys.editor.canUndo()).toBe(undo);
  });

  it('hover: まどの かず・しゅるいの ボタン だけ 光る（① で）。ほかの ボタン・null・② は 消す', () => {
    const { sys, hook } = opened();
    const log = fakePreview(sys);
    sys.press('editor');
    for (const id of ['windowsUp', 'windowsDown', 'windowKind', 'windowKind-shoji']) hook.hover(id);
    for (const id of ['next', 'width-7', 'depth-9', 'roof-flat', 'undo', null]) hook.hover(id);
    expect(log).toEqual(['hover true', 'hover true', 'hover true', 'hover true', 'hover false', 'hover false', 'hover false', 'hover false', 'hover false', 'hover false']);
    log.length = 0;
    sys.press('next');
    hook.hover('windowsUp');
    expect(log, '② には 窓の ボタンが ない').toEqual(['hover false']);
  });

  it('メニューが ひらいた まま 時間は 止まる（エディターの 間も）。Esc は エディターの 順、最後に 全部 とじる', () => {
    const { sys, g, calls } = opened();
    sys.press('editor');
    const t = g.w.time;
    g.step(600);
    expect(g.w.time).toBe(t);
    sys.press('need');
    expect(sys.menu().page).toBe('need');
    sys.escape();
    expect(sys.menu().page).toBe('editor');
    sys.escape();
    expect(sys.menu().open).toBe(false);
    expect(sys.editing()).toBe(false);
    expect(calls.at(-1)).toBe('close');
  });

  it('できた！ → せっけいずが 持ち物に（番号つき）・blueprints()・need(source)・メニューは top に もどる・もう 1 まいで 番号 2', () => {
    const { sys, bag, hook } = opened();
    bag.add('paper', 3);
    bag.add('fude', 1);
    sys.press('editor');
    for (const op of [{ op: 'size', w: 7 }, { op: 'windows', delta: 1 }, { op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'chair', x: 3, z: 0 }]) expect(hook.edit(op)).toBe(true);
    sys.press('next');
    sys.press('next');
    for (const ch of 'ひみつ') expect(hook.edit({ op: 'char', ch })).toBe(true);
    sys.press('done');
    expect(sys.menu()).toMatchObject({ open: true, page: 'top', bubble: 'せっけいずが できたよ！' });
    expect(bag.count('paper')).toBe(2);
    const bps = hook.blueprints();
    expect(bps).toHaveLength(1);
    expect(bps[0]).toMatchObject({ number: 1, name: { front: 'ひみつ', back: 'のいえ' }, w: 7, d: 5, windows: 1, windowKind: 'shoji', roof: 'flat', light: 'lantern' });
    expect(bps[0]!.furniture).toEqual([{ kind: 'futon', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 3, z: 0, rot: 0 }]);
    expect(sys.planName(1)).toBe('ひみつのいえの せっけいず');
    // 作りかけは のこる。持ち物の せっけいずの 必要な 材料を 聞ける
    expect(hook.need(bps[0]!.slot).find((r) => r.item === 'log')).toMatchObject({ need: 2 * (7 + 5) + 4 + 2, have: 0, bonus: 0 });
    sys.press('editor');
    expect(hook.editor()).toMatchObject({ step: 'namae', name: { front: 'ひみつ', back: 'のいえ' } });
    sys.press('done');
    expect(bag.count('sekkeizu')).toBe(2);
    expect(hook.blueprints().map((b) => b.number)).toEqual([1, 2]);
    expect(hook.need(999), '知らない マス').toEqual([]);
  });

  it('くらの 材料は へらない。くらの 数が need の have', () => {
    const { sys, hook } = opened();
    sys.state.kura.restore({ log: 30 });
    sys.press('editor');
    expect(hook.need().find((r) => r.item === 'log')).toMatchObject({ need: 24, have: 30, short: 0 });
  });
});
