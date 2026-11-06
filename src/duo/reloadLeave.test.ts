import { describe, expect, it } from 'vitest';
import { ActionState } from '../input/actions';
import { AlwaysLook } from '../input/gamepad/reader';
import { DuoPadRouter } from '../input/gamepad/duoPads';
import { FakeStorage, fakePad } from '../input/gamepad/testPad';
import { runImport, type ImportFlow } from '../save/importFlow';
import { runTitleReturn, type TitleReturnFlow, type TitleReturnInput } from '../ui/menu/titleReturn';
import { P2State } from './p2State';
import { DuoSession } from './session';
import type { DuoLeaveReason, P2Save } from './types';

/**
 * COOP-1 作業 3d（#418。docs/design/COOP-1.md §2.6・§10・AC71・AC72）の 先行テスト（赤）。読みなおす（`location.reload()`）直前に 2P を やめさせる 流れ。
 *
 * ---- developer への つなぎ目の 約束（型は 置いてある スタブ）----
 *   src/ui/menu/titleReturn.ts  `runTitleReturn(flow: TitleReturnFlow): Promise<'reload' | 'stay'>`
 *     saveNow() → decideTitleReturn(その 数) → 'reload' の ときだけ leaveDuo('reload') → reload()。'stay' は 何も 呼ばない（2P は のこる）。
 *     配線: src/game/wire/save.ts の setTitleReturn が これを 呼ぶ（saveNow は 今の save.now() ＋ info()、leaveDuo は DuoSession.leave、reload は location.reload）。
 *     保存の p2 は saveNow の 中で 書かれる（参加中は 今の 2P の 持ち物・レベル）。leaveDuo の 中の 保存は もう 一度 同じ 物を 渡すだけ。
 *   src/save/importFlow.ts  `runImport(flow: ImportFlow): Promise<'reloaded' | 'declined' | 'failed'>`
 *     confirm() が false → 何も しない（'declined'）。true → suspendSave() → idle() → writeFile() → leaveDuo('import') → reload()（'reloaded'）。
 *     writeFile が 投げたら resumeSave() → alert(メッセージ。なければ 'よみこめませんでした') → 'failed'（leaveDuo も reload も 呼ばない。2P は のこる）。
 *     配線: src/game/wire/save.ts の mountAdult.importSave が これを 呼ぶ。
 *   src/duo/types.ts  DuoLeaveReason に 'import' を 足した（置いてある）。session.ts の `leave('import')` は 保存しない（session.test.ts）。
 *   注意: このテストの 偽の saveNow は 自分で db に 書いた 値を 自分で 確かめる（流れの 順番と 2P の 入力・joined を 見る ための もの）。
 *     「保存に 2P の 持ち物・レベルが 入る」本当の 保証は SaveManager の 既存テスト（src/save/p2Save.test.ts の AC10 と session.test.ts の AC17。wire/save.ts の p2.serialize は 参加中は 今の 中身を 書く）。
 *   「いいえ」（もどる 確認で）は goTitle を 呼ばないので 何も 起きない（このテストでは 見ない）。
 */

const STICK_UP = [0, -1, 0, 0];

/** 2P の 持ち物の 入った 世界。db = 「保存」（p2 の 分だけ）。SaveManager と 同じに、参加中は 今の 2P を 書き、いないときは 最後の 保存を 書く */
function world(initialDb: P2Save | null = null) {
  const log: string[] = [];
  const db = { p2: initialDb };
  const p2 = new P2State();
  const session: DuoSession = new DuoSession({
    p2,
    saveP2: (s) => {
      log.push('saveP2');
      db.p2 = s;
    },
    loadP2: () => db.p2,
    onLeft: (r: DuoLeaveReason) => {
      log.push(`left:${r}`);
      router.setJoined(false);
    },
  });
  const p1a = new ActionState();
  const p2a = new ActionState();
  const router = new DuoPadRouter({ p1: p1a, p2: p2a, look1: new AlwaysLook(), look2: new AlwaysLook(), storage: null, choiceStorage: new FakeStorage() });
  let pads: (Gamepad | null)[] = [];
  router.getPads = () => pads;
  let t = 0;
  const poll = () => router.poll((t += 16));
  /** 2P を 参加させて、左スティックを 倒したままに する（入力が はなれるか 見る） */
  function joinWalking(): void {
    pads = [fakePad(0), fakePad(1)];
    poll();
    session.join();
    router.setJoined(true);
    pads = [fakePad(0), fakePad(1, { axes: STICK_UP })];
    poll();
  }
  return { log, db, p2, session, router, p2a, joinWalking };
}

const okInput: TitleReturnInput = { enabled: true, nosave: false, failuresBefore: 0, failuresAfter: 0, held: false, dirty: false };

describe('AC71: タイトルへ もどる（「もどる」）', () => {
  function titleFlow(w: ReturnType<typeof world>, input: TitleReturnInput = okInput) {
    const seen: { joinedAtSave: boolean; joinedAtReload: boolean | null; dbAtReload: P2Save | null; heldAtReload: boolean | null } = {
      joinedAtSave: false,
      joinedAtReload: null,
      dbAtReload: null,
      heldAtReload: null,
    };
    const flow: TitleReturnFlow = {
      saveNow: async () => {
        w.log.push('saveNow');
        seen.joinedAtSave = w.session.joined;
        if (input.failuresAfter <= input.failuresBefore) w.db.p2 = w.session.joined ? w.p2.serialize() : w.db.p2; // 保存できた とき だけ 書く
        return input;
      },
      leaveDuo: (reason) => w.session.leave(reason),
      reload: () => {
        w.log.push('reload');
        seen.joinedAtReload = w.session.joined;
        seen.dbAtReload = w.db.p2;
        seen.heldAtReload = w.p2a.isHeld('moveForward');
      },
    };
    return { flow, seen };
  }

  it('保存できて 読みなおす: 保存の p2 は その時の 2P の 持ち物・レベル。2P を やめさせるのは reload の 直前（その時 joined は false、入力は ぜんぶ はなれる）', async () => {
    const w = world();
    w.joinWalking();
    w.p2.inventory.add('dirt', 7);
    w.p2.level = { level: 3, xp: 12 };
    const want = w.p2.serialize();
    expect(w.p2a.isHeld('moveForward'), '歩いている').toBe(true);
    const { flow, seen } = titleFlow(w);
    expect(await runTitleReturn(flow)).toBe('reload');
    expect(seen.joinedAtSave, '保存の ときは まだ 参加中').toBe(true);
    expect(seen.joinedAtReload, 'reload の とき 2P は もういない').toBe(false);
    expect(seen.heldAtReload, '2P の 入力は ぜんぶ はなれている').toBe(false);
    expect(seen.dbAtReload).toEqual(want);
    const iSave = w.log.indexOf('saveNow');
    const iLeft = w.log.indexOf('left:reload');
    const iReload = w.log.indexOf('reload');
    expect(iSave).toBeGreaterThanOrEqual(0);
    expect(iLeft).toBeGreaterThan(iSave);
    expect(iReload).toBeGreaterThan(iLeft);
    expect(w.log.slice(0, iLeft).includes('left:reload'), 'やめるのは 保存の あと').toBe(false);
  });

  it('?nosave=1 でも 読みなおす（2P も やめる）', async () => {
    const w = world();
    w.joinWalking();
    const { flow, seen } = titleFlow(w, { ...okInput, enabled: false, nosave: true });
    expect(await runTitleReturn(flow)).toBe('reload');
    expect(seen.joinedAtReload).toBe(false);
    expect(w.log).toContain('left:reload');
  });

  it('保存が できず「ほぞん できなかったよ」(stay): 2P は いるまま。読みなおさない・やめさせない・入力も そのまま', async () => {
    const w = world();
    w.joinWalking();
    w.p2.inventory.add('dirt', 7);
    const { flow, seen } = titleFlow(w, { ...okInput, failuresAfter: 1 });
    expect(await runTitleReturn(flow)).toBe('stay');
    expect(w.session.joined).toBe(true);
    expect(w.log).toEqual(['saveNow']);
    expect(seen.joinedAtReload).toBeNull();
    expect(w.p2.inventory.count('dirt'), '遊びつづけられる').toBe(7);
    expect(w.p2a.isHeld('moveForward')).toBe(true);
  });

  it('保存を 止めていて 変更が あるときも stay（decideTitleReturn と 同じ）', async () => {
    const w = world();
    w.joinWalking();
    const { flow } = titleFlow(w, { ...okInput, held: true, dirty: true });
    expect(await runTitleReturn(flow)).toBe('stay');
    expect(w.session.joined).toBe(true);
  });

  it('2P が いない: 何も やめさせず 読みなおす', async () => {
    const w = world();
    const { flow } = titleFlow(w);
    expect(await runTitleReturn(flow)).toBe('reload');
    expect(w.log).toEqual(['saveNow', 'reload']);
  });
});

describe('AC72: おとなの「よみこむ」', () => {
  const fileP2 = (): P2Save => {
    const f = new P2State();
    f.inventory.add('stone', 5);
    f.level = { level: 4, xp: 7 };
    return f.serialize();
  };

  function importFlow(w: ReturnType<typeof world>, o: { confirm?: boolean; file?: P2Save | null; fail?: Error | null } = {}) {
    const seen: { joinedAtReload: boolean | null; dbAtReload: P2Save | null; heldAtReload: boolean | null; alerts: string[] } = {
      joinedAtReload: null,
      dbAtReload: null,
      heldAtReload: null,
      alerts: [],
    };
    const file = o.file === undefined ? fileP2() : o.file;
    const flow: ImportFlow = {
      confirm: () => {
        w.log.push('confirm');
        return o.confirm ?? true;
      },
      suspendSave: () => w.log.push('suspend'),
      resumeSave: () => w.log.push('resume'),
      idle: async () => {
        w.log.push('idle');
      },
      writeFile: async () => {
        w.log.push('writeFile');
        if (o.fail) throw o.fail;
        w.db.p2 = file; // ファイルの 中身が 保存に なる
      },
      leaveDuo: (reason) => w.session.leave(reason),
      reload: () => {
        w.log.push('reload');
        seen.joinedAtReload = w.session.joined;
        seen.dbAtReload = w.db.p2;
        seen.heldAtReload = w.p2a.isHeld('moveForward');
      },
      alert: (m) => seen.alerts.push(m),
    };
    return { flow, seen, file };
  }

  it('読み直す: 2P を やめさせるのは reload の 直前。今の 2P の 持ち物は 保存に 書かない（ファイルの p2 が のこる）', async () => {
    const w = world();
    w.joinWalking();
    w.p2.inventory.add('dirt', 9); // 今の 2P の 持ち物
    const { flow, seen, file } = importFlow(w);
    expect(await runImport(flow)).toBe('reloaded');
    expect(w.log).toEqual(['confirm', 'suspend', 'idle', 'writeFile', 'left:import', 'reload']);
    expect(w.log).not.toContain('saveP2');
    expect(seen.joinedAtReload).toBe(false);
    expect(seen.heldAtReload, '2P の 入力は ぜんぶ はなれている').toBe(false);
    expect(seen.dbAtReload).toBe(file);
  });

  it('ファイルに p2 が ない: 保存の p2 も なしの まま（今の 2P の 持ち物を 書かない）', async () => {
    const w = world(fileP2());
    w.joinWalking();
    w.p2.inventory.add('dirt', 9);
    const { flow, seen } = importFlow(w, { file: null });
    expect(await runImport(flow)).toBe('reloaded');
    expect(seen.dbAtReload).toBeNull();
  });

  it('たしかめで「いいえ」: 何も かわらない。2P は のこる', async () => {
    const w = world();
    w.joinWalking();
    const { flow, seen } = importFlow(w, { confirm: false });
    expect(await runImport(flow)).toBe('declined');
    expect(w.log).toEqual(['confirm']);
    expect(w.session.joined).toBe(true);
    expect(seen.joinedAtReload).toBeNull();
  });

  it('importSave の 失敗: 保存を もどし、文を 出し、2P は のこる。読みなおさない', async () => {
    const w = world();
    w.joinWalking();
    w.p2.inventory.add('dirt', 9);
    const { flow, seen } = importFlow(w, { fail: new Error('ファイルが こわれています') });
    expect(await runImport(flow)).toBe('failed');
    expect(w.log).toEqual(['confirm', 'suspend', 'idle', 'writeFile', 'resume']);
    expect(seen.alerts).toEqual(['ファイルが こわれています']);
    expect(w.session.joined).toBe(true);
    expect(w.p2.inventory.count('dirt')).toBe(9);
    expect(w.p2a.isHeld('moveForward')).toBe(true);
  });

  it('Error で ない 失敗は「よみこめませんでした」', async () => {
    const w = world();
    const { flow, seen } = importFlow(w, { fail: 'x' as unknown as Error });
    expect(await runImport(flow)).toBe('failed');
    expect(seen.alerts).toEqual(['よみこめませんでした']);
  });

  it('読み直した あとは 2P が いない。＋ で 参加すると ファイルの p2 の 持ち物で 始まる（p2 が なければ からっぽ）', async () => {
    const w = world();
    w.joinWalking();
    const { flow } = importFlow(w);
    await runImport(flow);
    // 読みなおし = 新しい 世界。保存（db）の p2 だけが 引きつがれる
    const after = world(w.db.p2);
    expect(after.session.joined).toBe(false);
    after.session.join();
    expect(after.p2.inventory.count('stone')).toBe(5);
    expect(after.p2.level).toEqual({ level: 4, xp: 7 });
    const none = world(null);
    none.session.join();
    expect(none.p2.inventory.count('stone')).toBe(0);
  });
});
