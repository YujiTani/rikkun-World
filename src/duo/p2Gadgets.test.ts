import { describe, expect, it } from 'vitest';
import type { ItemId, LockStatus, SpawnPoint, Vec3 } from '../contracts';
import { GADGET_ID, GADGET_TUNING, jumpHeightWith } from '../content/items/gadgetTuning';
import { SEAT_TUNING } from '../house/seat';
import { ActionState } from '../input/actions';
import { KiteSystem } from '../player/kite';
import { SAVE_VERSION } from '../save/SaveManager';
import { PlayerController } from '../player/PlayerController';
import { createPlayerSettings } from '../player/config';
import { createTimeSettings } from '../time/config';
import { NOT_NIGHT_TEXT, SleepSystem } from '../time/sleep';
import { TimeOfDayImpl } from '../time/TimeOfDay';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { P2State } from './p2State';
import { blockInputWhileSleeping, createP2Gadgets, createSleepPort, createWaitWake, kiteInfo, seatInfo, sleepInfo, sleepNotice } from './p2Gadgets';
import type { DuoHook, DuoPlayHook } from './types';

/**
 * COOP-1 5e（docs/design/COOP-1.md 1.16 §3.7 (f)・§8 の 5e の 行・§9.12・§10・§12.0・AC143〜AC145・AC169・AC170・AC172・AC173）: 2P の たこ・わらじ・ふとんの 先行テスト（赤）。
 * ふとんの 「待ち」の 中身（`SleepSystem` の 変更）は src/time/sleepDuo.test.ts。ここは その まわりの まとめ（窓口・入力止め・起こす 入力・お知らせの 中身・口の 中身）。
 * 大もとは「1P と 2P は すべて 同じ」。2P の たこ（`KiteSystem`）・わらじ（`jumpHeightWith`）・ふとん（`SleepSystem`）は 1P と 同じ 部品を 2P の 体・2P の もちもので 使う。式の コピーは しない。
 * 数は 表（GADGET_TUNING・SEAT_TUNING・createTimeSettings）から 読む。時間では 待たず ステップの 数で 進める。すわる・おふろは src/house/seatDuo.test.ts。
 *
 * ---- 実装への 約束（developer が 作る 名前・形。置き場は src/duo/p2Gadgets.ts〈新しく〉。形の 細かい 所は 変えて よいが、変えたら 依頼文と 仕様に 書く）----
 *   createP2Gadgets(d: P2GadgetsDeps): P2Gadgets          2P が 参加する たびに 1 つ（やめる たびに clear() して すてる）
 *     P2GadgetsDeps = {
 *       body: { state: { position: Vec3; yawDeg: number }; settings: { jumpHeight: number }; setJumpHeight(h: number | null): void };   // 2P の 体（ctl2）
 *       held(): ItemId | null;                              // 2P が 手に 持つ 物（p2.inventory.held()?.item ?? null）
 *       legs(): ItemId | null;                              // 2P の あしの そうび（p2.armor.equipped('legs')）
 *       tick(): number;                                     // game.tick
 *       view?: { update(pos: Vec3 | null, player: Vec3, tick: number): void };   // 2P の たこの 絵（KiteView と 同じ 形。2 つ目）
 *     }
 *     P2Gadgets = {
 *       kite: KiteSystem;                                   // 1P と 同じ 部品の 2 つ目
 *       useKite(): 'up' | 'down';                           // m4.gadgets.kite（ZL）。2P の 場所・向き（body.state.position・yawDeg）から あがる
 *       step(): void;                                       // 毎ステップ: kite.onHeld(held())・kite.update(2P の 場所)・view.update(...)・body.setJumpHeight(jumpHeightWith(legs(), body.settings.jumpHeight))
 *       info(): { up: boolean; position: DuoVec3 | null };  // = kiteInfo(kite)
 *       clear(): void;                                      // 2P が やめた とき: たこを おろす（消える）
 *     }
 *   kiteInfo(kite: Pick<KiteSystem, 'up' | 'position'> | null): { up: boolean; position: DuoVec3 | null } | null
 *     `duo.kite(who)` の 中身。kite が null（2P が いない）なら null。position は コピー（中を 書きかえられても たこは かわらない）。1P も この 関数（今の `kite.get()` の up・position と 同じ 中身）。
 *   seatInfo(seat: Pick<SeatSystem, 'seat'> | null): { kind: 'sit' | 'bath'; block: DuoVec3 } | null
 *     `duo.seat(who)` の 中身（block は コピー。position は 出さない）。seat が null か すわって いなければ null。1P も この 関数。
 *   createSleepPort(d: SleepPortDeps): (who: 1 | 2) => 'start' | 'wait' | 'notNight' | 'busy'
 *     SleepPortDeps = { sleep: Pick<SleepSystem, 'use'>; showNote(who: 1 | 2, text: string): void }
 *     ふとんを 使う 窓口（`gadgets.port.sleep(who)`。1P も 2P も 同じ 1 つの SleepSystem の `use(who)`）。返り値は `sleep.use(who)` の 結果。
 *       'notNight' → showNote(who, NOT_NIGHT_TEXT)（使った 人の 半分）。'start'・'wait'・'busy' → 何も 出さない。（ねる 音は SleepSystem の onStart。窓口は 鳴らさない）
 *   blockInputWhileSleeping(lock: { playInputEnabled(): boolean }, sleep: { blocksInput(): boolean }): void
 *     ねむり中だけ lock.playInputEnabled() を false に する（元の 判定は のこす。待ち中は 止めない）。1P の lock（wireGadgets〈今の 行を これに かえる〉）と 2P の lock2（wire/duo.ts）の 両方に かける。
 *   createWaitWake(d: { who: 1 | 2; sleep: Pick<SleepSystem, 'waiting' | 'wake'>; actions: Pick<ActionState, 'isHeld' | 'wasPressed'>; combat: { flinching(): boolean; dead?(): boolean } }): { step(): void }
 *     その 人の 「待ちを 起こす 入力」を 見る（毎ステップ 1 回。1P も 2P も 同じ 部品）。待って いる のが who の あいだだけ 働く。歩く・ジャンプ（moveForward・moveBack・moveLeft・moveRight・jump）を 押す／ひるむ／倒れる（dead?.()）で `sleep.wake(who)`。
 *     待ちに 入った 時に すでに 押しっぱなしだった ボタンは いったん はなす まで 起こさない（SeatSystem と 同じ 決まり）。ZL（secondary）や もちもの画面では 起きない。やめる・パッドが ぬける は 配線が 直接 `sleep.wake(2)` を 呼ぶ。
 *   sleepNotice(s: { waiting: 1 | 2 | null; ready: number; night: boolean; sleeping: boolean }): { ask: Array<1 | 2>; dim: Array<{ who: 1 | 2; value: number }> }
 *     ask＝ 「おともだちが いっしょに ねたがっているよ」を 出す 人（半分の 持ち主）。待って いる 人が いて・ready が 2 以上・night（ゆうがた・よる）・ねむり中でない とき だけ、**待って いない 方の 人** 1 人。ほかは 空。
 *     dim＝ 待ち中の うすい 暗さ。待って いる 人が いて ねむり中でない とき { who: 待って いる 人, value: GADGET_TUNING.futon.sleepWaitDim }。ほかは 空（ねむり中は 画面ぜんたいの 暗さ #sleep-fade）。
 *   sleepInfo(d: { sleep: Pick<SleepSystem, 'waiting' | 'sleeping' | 'stepsLeft'>; ready(): number; night(): boolean }): { ready: number; waiting: 1 | 2 | null; sleeping: boolean; stepsLeft: number; ask: Array<1 | 2>; dim: Array<{ who: 1 | 2; value: number }> }
 *     `duo.sleep()` の 中身（`sleepNotice` を つかう）。
 *   表: GADGET_TUNING.futon.sleepWaitDim（0〜1。数は 仕様 §9.12 の 0.35。調整は 試作の スクショで）を 足す。
 *   型: `DuoPlayHook` に `seat(who: 1 | 2): { kind: 'sit' | 'bath'; block: DuoVec3 } | null`・`kite(who: 1 | 2): { up: boolean; position: DuoVec3 | null } | null`。`DuoHook` に `sleep(): { ready; waiting; sleeping; stepsLeft; ask; dim }`（上の sleepInfo と 同じ 形。§12.0）。
 *   **1P の wireGadgets も この 部品を 使う**（式の コピーを しない）: 1P の たこ・わらじは createP2Gadgets と 同じ 部品〈KiteSystem・jumpHeightWith〉を 使い、1P の kite 窓口（`gadgets.port.kite`）と hook（`__rikkun.kite.get()`・`sleep.get()`）の 形は 今の まま。
 *     1P の ふとんの 窓口・入力止め・起こす 入力も createSleepPort・blockInputWhileSleeping・createWaitWake を 通す。
 *   見た目（`duo-gadget-note-p2` が 2P の 半分の 中）は UI 検査（e2e/ui-gate.spec.ts の 'duo-gadget-note'。helper は e2e/helpers/duoGadget.ts）。
 */

// ---------------------------------------------------------------- たこ（AC169）
const P1_POS: Vec3 = { x: 10.5, y: 9, z: 20.5 };
const P2_POS: Vec3 = { x: 40.5, y: 9, z: 8.5 };

/** 向きを 渡して あげた とき、たこが 前方へ ずれる 水平の きょり（マス。高さ ÷ tan 角度） */
const RUN = GADGET_TUNING.kite.height / Math.tan((GADGET_TUNING.kite.angleDeg * Math.PI) / 180);

function body(pos: Vec3, yawDeg = 0) {
  let jump: number | null = null;
  return {
    state: { position: { ...pos }, yawDeg },
    settings: { jumpHeight: createPlayerSettings().jumpHeight },
    setJumpHeight(h: number | null) {
      jump = h;
    },
    lastJump: () => jump,
  };
}

function gadgets(opts: { held?: ItemId | null; legs?: ItemId | null; yaw?: number } = {}) {
  const b = body(P2_POS, opts.yaw ?? 0);
  const views: Array<{ pos: Vec3 | null; player: Vec3; tick: number }> = [];
  let held: ItemId | null = opts.held ?? GADGET_ID.kite;
  let legs: ItemId | null = opts.legs ?? null;
  let tick = 0;
  const g = createP2Gadgets({
    body: b,
    held: () => held,
    legs: () => legs,
    tick: () => tick,
    view: { update: (pos, player, t) => void views.push({ pos: pos ? { ...pos } : null, player: { ...player }, tick: t }) },
  });
  return {
    g,
    b,
    views,
    setHeld: (i: ItemId | null) => (held = i),
    setLegs: (i: ItemId | null) => (legs = i),
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        tick++;
        g.step();
      }
    },
  };
}

describe('AC169: 2P の たこ（1P と 同じ KiteSystem の 2 つ目）', () => {
  it('ZL（useKite）で 2P の 場所から あがる。のぼりきると 2P の 上空 表の 高さ（±sway）。1P の たこは かわらない', () => {
    const t = gadgets();
    const k1 = new KiteSystem();
    expect(t.g.info()).toEqual({ up: false, position: null });
    expect(t.g.useKite()).toBe('up');
    expect(t.g.info().up).toBe(true);
    t.step(GADGET_TUNING.kite.riseSteps * 6);
    const pos = t.g.info().position!;
    expect(Math.abs(pos.y - (P2_POS.y + GADGET_TUNING.kite.height))).toBeLessThanOrEqual(GADGET_TUNING.kite.sway + 1e-9);
    expect(Math.hypot(pos.x - P2_POS.x, pos.z - P2_POS.z), '2P の 前方（1P の 場所では ない）').toBeLessThanOrEqual(RUN + 2 * GADGET_TUNING.kite.sway + 0.01);
    const ref = new KiteSystem(); // 1P と 同じ 部品を 2P の 場所・向きで あげた とき と 同じ 動き
    ref.toggle(P2_POS, 0);
    for (let i = 0; i < GADGET_TUNING.kite.riseSteps * 6; i++) ref.update(P2_POS);
    expect(pos).toEqual(ref.position());
    expect(k1.up(), '1P の たこは かわらない').toBe(false);
    expect(k1.toggle(P1_POS)).toBe('up'); // 1P も 同時に あげられる（2 人で 2 つ）
    expect(t.g.info().up).toBe(true);
    for (let i = 0; i < 400; i++) k1.update(P1_POS);
    expect(k1.position()!.x, '2 つの たこは べつの 場所').not.toBeCloseTo(t.g.info().position!.x, 0);
  });

  it('向いている 前方へ ななめに あがる（2P の yawDeg。1P と 同じ KiteSystem.toggle の 向き）', () => {
    const t = gadgets({ yaw: 90 });
    const k = new KiteSystem();
    k.toggle(P2_POS, 90);
    t.g.useKite();
    t.step(GADGET_TUNING.kite.riseSteps * 6);
    for (let i = 0; i < GADGET_TUNING.kite.riseSteps * 6; i++) k.update(P2_POS);
    expect(Math.abs(t.g.info().position!.x - k.position()!.x)).toBeLessThanOrEqual(GADGET_TUNING.kite.sway * 2 + 0.01);
  });

  it('もう 1 回 ZL で おりる。たこ以外を 持ちかえても おりる（1P と 同じ）', () => {
    const t = gadgets();
    t.g.useKite();
    t.step(5);
    expect(t.g.useKite()).toBe('down');
    expect(t.g.info()).toEqual({ up: false, position: null });
    t.g.useKite();
    t.step(5);
    expect(t.g.info().up).toBe(true);
    t.setHeld('katana');
    t.step(1);
    expect(t.g.info(), '持ちかえると おりる').toEqual({ up: false, position: null });
    expect(t.g.kite.up()).toBe(false);
  });

  it('2P が ついて 歩くと たこも ついてくる。絵（view）には 2P の たこの 位置と 2P の 場所が わたる（1P の 場所では ない）', () => {
    const t = gadgets();
    t.g.useKite();
    t.step(400);
    t.b.state.position.x += 30;
    t.b.state.position.z -= 30;
    t.step(600);
    const pos = t.g.info().position!;
    expect(Math.hypot(pos.x - t.b.state.position.x, pos.z - t.b.state.position.z), '2P の 前方 RUN の あたりに ついてくる').toBeLessThanOrEqual(RUN + 2 * GADGET_TUNING.kite.sway + 0.5);
    const last = t.views[t.views.length - 1]!;
    expect(last.player).toEqual(t.b.state.position);
    expect(last.pos).toEqual(pos);
    expect(last.tick).toBe(1000);
    expect(t.views.length, '毎ステップ 1 回').toBe(1000);
  });

  it('clear()（2P が やめた）: たこが 消える', () => {
    const t = gadgets();
    t.g.useKite();
    t.step(10);
    t.g.clear();
    expect(t.g.info()).toEqual({ up: false, position: null });
  });
});

describe('§12.0: duo.kite(who)・duo.seat(who) の 中身（1P も 同じ 関数）', () => {
  it('型: DuoPlayHook に seat(who)・kite(who)、DuoHook に sleep() が ある（型の 検査。typecheck で 見る）', () => {
    const shape: Pick<DuoPlayHook, 'seat' | 'kite'> = { seat: (_who) => seatInfo(null), kite: (_who) => kiteInfo(null) };
    expect(shape.seat(2)).toBeNull();
    expect(shape.kite(2)).toBeNull();
    const sleepShape: Pick<DuoHook, 'sleep'> = { sleep: () => ({ ready: 1, waiting: null, sleeping: false, stepsLeft: 0, ask: [], dim: [] }) };
    expect(sleepShape.sleep().waiting).toBeNull();
  });

  it('kiteInfo: 上がって いなければ { up: false, position: null }、上がれば 位置の コピー。kite が null なら null', () => {
    expect(kiteInfo(null)).toBeNull();
    const k = new KiteSystem();
    expect(kiteInfo(k)).toEqual({ up: false, position: null });
    k.toggle(P1_POS);
    k.update(P1_POS);
    const info = kiteInfo(k)!;
    expect(info.up).toBe(true);
    expect(info.position).toEqual(k.position());
    info.position!.x = -999; // 書きかえても たこは かわらない
    expect(k.position()!.x).not.toBe(-999);
  });

  it('seatInfo: すわって いなければ null。すわれば { kind, block }（block は コピー・position は 出さない）', () => {
    const none = { seat: () => null };
    expect(seatInfo(null)).toBeNull();
    expect(seatInfo(none)).toBeNull();
    const block = { x: 3, y: 5, z: 7 };
    const sit = { seat: () => ({ kind: 'sit' as const, block, position: { x: 3.5, y: 5.5, z: 7.5 } }) };
    const info = seatInfo(sit)!;
    expect(info).toEqual({ kind: 'sit', block: { x: 3, y: 5, z: 7 } });
    expect(Object.keys(info).sort()).toEqual(['block', 'kind']);
    info.block.x = 99;
    expect(block.x).toBe(3);
    const bath = { seat: () => ({ kind: 'bath' as const, block, position: { x: 3.5, y: 5.5, z: 7.5 } }) };
    expect(seatInfo(bath)!.kind).toBe('bath');
  });
});

// ---------------------------------------------------------------- わらじ（AC169）
function jumpRig() {
  const world = new ArrayVoxelWorld({ x: 24, y: 40, z: 24 });
  world.fill(0, 0, 0, 23, 8, 23, 'stone');
  const actions = new ActionState();
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const spawn: SpawnPoint = { x: 6.5, y: 9, z: 6.5, yawDeg: 0, pitchDeg: 0 };
  const player = new PlayerController(world, actions, { consume: () => ({ dx: 0, dy: 0 }) }, lock, () => spawn);
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  step(3);
  const peak = (): number => {
    actions.press('jump');
    step(1);
    actions.release('jump');
    let top = player.state.position.y;
    for (let i = 0; i < 90; i++) {
      step(1);
      top = Math.max(top, player.state.position.y);
    }
    return top - 9;
  };
  return { player, peak, step };
}

describe('AC169: 2P の わらじ（2P の あしの そうびで 2P の ジャンプが 高い）', () => {
  it('step() が jumpHeightWith(legs, 2P の ふだんの 高さ) を 2P の 体に かける。わらじ → 表の 高さ、ぬぐと もとの 高さ', () => {
    const t = gadgets({ held: null });
    const base = t.b.settings.jumpHeight;
    t.step();
    expect(t.b.lastJump(), 'わらじなし').toBe(base);
    t.setLegs(GADGET_ID.waraji);
    t.step();
    expect(t.b.lastJump()).toBe(GADGET_TUNING.waraji.jumpHeight);
    expect(t.b.lastJump()).toBe(jumpHeightWith(GADGET_ID.waraji, base));
    t.setLegs('suneate');
    t.step();
    expect(t.b.lastJump(), 'すねあてに はきかえ').toBe(base);
  });

  it('本物の 体で: 2P が わらじを はくと、2P の ジャンプの てっぺんが 1P が わらじを はいた ときと 同じ（ふだんより 高い）', () => {
    const base = createPlayerSettings().jumpHeight;
    const plain = jumpRig().peak();
    expect(plain).toBeCloseTo(base, 1);
    // 1P: 今の wireGadgets と 同じ 式で かける
    const one = jumpRig();
    one.player.setJumpHeight(jumpHeightWith(GADGET_ID.waraji, base));
    // 2P: p2Gadgets を 通して かける
    const two = jumpRig();
    const g = createP2Gadgets({ body: two.player, held: () => null, legs: () => GADGET_ID.waraji, tick: () => 0 });
    g.step();
    const onePeak = one.peak();
    expect(two.peak()).toBeCloseTo(onePeak, 6);
    expect(onePeak - plain, 'わらじは ふだんより 高い').toBeGreaterThan(GADGET_TUNING.waraji.jumpHeight - base - 0.05);
  });

  it('2P の 着た わらじは p2 の セーブで もどる（5e は p2 に 新しい キーを 足さない）', () => {
    const p2 = new P2State();
    p2.inventory.setSlot(0, { item: GADGET_ID.waraji, count: 1 });
    p2.inventory.select(0);
    expect(p2.armor.tryEquip(GADGET_ID.waraji)).toBe(true);
    const saved = JSON.parse(JSON.stringify(p2.serialize())) as unknown;
    const back = new P2State();
    back.deserialize(saved);
    expect(back.armor.equipped('legs')).toBe(GADGET_ID.waraji);
    expect(jumpHeightWith(back.armor.equipped('legs'), 1.25)).toBe(GADGET_TUNING.waraji.jumpHeight);
  });
});

describe('AC145: セーブ（5e は p2 に 新しい キーを 足さない）', () => {
  it('p2.serialize() の キーは 今の 3 つ（inventory・level・armor）のまま。すわって いる こと・たこ・ねむりは 入らない', () => {
    const p2 = new P2State();
    p2.inventory.setSlot(0, { item: GADGET_ID.kite, count: 1 });
    p2.inventory.select(0);
    expect(Object.keys(p2.serialize()).sort()).toEqual(['armor', 'inventory', 'level']);
  });
  it('SAVE_VERSION は 上げない', () => {
    expect(SAVE_VERSION).toBe(1);
  });
  it('キーの ない 古い セーブ（armor なし）・p2 が まるごと ない セーブも 読める（わらじは はだか・からっぽ）', () => {
    const p2 = new P2State();
    expect(() => p2.deserialize({ inventory: new P2State().inventory.serialize(), level: { level: 3, xp: 4 } })).not.toThrow();
    expect(p2.armor.equipped('legs')).toBeNull();
    expect(p2.level).toEqual({ level: 3, xp: 4 });
    expect(() => p2.deserialize(undefined)).not.toThrow();
    expect(p2.level).toEqual({ level: 1, xp: 0 });
  });
});

// ---------------------------------------------------------------- ふとん（AC170・AC172・AC173）
const S = createTimeSettings();
const NIGHT = S.dayTicks + S.duskTicks + 500;
const DAY = 100;

function sleepRig(tick: number, ready = 2) {
  const time = new TimeOfDayImpl();
  time.set(tick);
  const state = { ready };
  const starts: number[] = [];
  const sleep = new SleepSystem(time, { ready: () => state.ready, onStart: () => void starts.push(1) });
  const notes: Array<{ who: 1 | 2; text: string }> = [];
  const port = createSleepPort({ sleep, showNote: (who, text) => void notes.push({ who, text }) });
  return { time, sleep, state, port, notes, starts };
}

describe('AC170: ふとんの 窓口（gadgets.port.sleep(who)）', () => {
  it('ひる・あさに 使うと「よる に ねようね」が 使った 人の 半分に だけ 出る。待ちにも ねむりにも ならない', () => {
    for (const tick of [DAY, S.dayTicks + S.duskTicks + S.nightTicks + 10]) {
      for (const who of [1, 2] as const) {
        const r = sleepRig(tick);
        expect(r.port(who)).toBe('notNight');
        expect(r.notes).toEqual([{ who, text: NOT_NIGHT_TEXT }]);
        expect(r.sleep.sleeping()).toBe(false);
        expect(r.sleep.waiting()).toBeNull();
        expect(r.starts).toHaveLength(0);
      }
    }
  });

  it('よるの 1 人目は \'wait\'・2 人目は \'start\'。どちらも 文は 出さない。ねる 音は そろった ときに 1 回', () => {
    for (const [first, second] of [[1, 2], [2, 1]] as const) {
      const r = sleepRig(NIGHT);
      expect(r.port(first)).toBe('wait');
      expect(r.starts).toHaveLength(0);
      expect(r.port(second)).toBe('start');
      expect(r.starts).toHaveLength(1);
      expect(r.port(first), 'ねむり中は busy').toBe('busy');
      expect(r.notes).toEqual([]);
      expect(r.starts).toHaveLength(1);
    }
  });

  it('1 人の とき（ready=1）は 今の まま すぐ \'start\'', () => {
    const r = sleepRig(NIGHT, 1);
    expect(r.port(1)).toBe('start');
    expect(r.starts).toHaveLength(1);
    expect(r.notes).toEqual([]);
  });
});

describe('AC170: ねむりの あいだ 1P も 2P も 歩けない・押せない。待ち中は 止めない（世界も 2 人も 動く）', () => {
  function twoBodies() {
    const world = new ArrayVoxelWorld({ x: 40, y: 16, z: 40 });
    world.fill(0, 0, 0, 39, 4, 39, 'stone');
    const make = (x: number) => {
      const actions = new ActionState();
      const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
      const spawn: SpawnPoint = { x, y: 5, z: 20.5, yawDeg: 0, pitchDeg: 0 };
      const player = new PlayerController(world, actions, { consume: () => ({ dx: 0, dy: 0 }) }, lock, () => spawn);
      return { actions, lock, player };
    };
    return { a: make(10.5), b: make(25.5) };
  }
  const stepAll = (bs: ReturnType<typeof twoBodies>, n: number): void => {
    for (let i = 0; i < n; i++) {
      for (const p of [bs.a, bs.b]) {
        p.player.update(1 / 60);
        p.actions.endFrame();
      }
    }
  };

  for (const first of [1, 2] as const) {
    it(`${first}P が 先に ねて まつ → 入力は 止まらない。もう 1 人が ねて そろうと 2 人とも ねむりが おわる まで 前へ 進めない。おわれば また 歩ける`, () => {
      const r = sleepRig(NIGHT);
      const bs = twoBodies();
      blockInputWhileSleeping(bs.a.lock, r.sleep); // 1P の lock
      blockInputWhileSleeping(bs.b.lock, r.sleep); // 2P の lock2
      stepAll(bs, 3);
      expect(r.port(first)).toBe('wait');
      expect(bs.a.lock.playInputEnabled(), '待ち中は 1P の 入力は 止まらない').toBe(true);
      expect(bs.b.lock.playInputEnabled(), '待ち中は 2P の 入力は 止まらない').toBe(true);
      expect(r.port(first === 1 ? 2 : 1)).toBe('start');
      const z0 = [bs.a.player.state.position.z, bs.b.player.state.position.z];
      bs.a.actions.press('moveForward');
      bs.b.actions.press('moveForward');
      for (let i = 0; i < 30; i++) {
        r.sleep.update();
        stepAll(bs, 1);
      }
      expect(bs.a.lock.playInputEnabled(), '1P の 入力は 止まる').toBe(false);
      expect(bs.b.lock.playInputEnabled(), '2P の 入力も 止まる').toBe(false);
      expect(bs.a.player.state.position.z).toBeCloseTo(z0[0]!, 6);
      expect(bs.b.player.state.position.z).toBeCloseTo(z0[1]!, 6);
      for (let i = 0; i < GADGET_TUNING.futon.sleepSteps + 5 && r.sleep.sleeping(); i++) r.sleep.update();
      expect(r.sleep.sleeping()).toBe(false);
      expect(bs.a.lock.playInputEnabled()).toBe(true);
      expect(bs.b.lock.playInputEnabled()).toBe(true);
      stepAll(bs, 30);
      expect(bs.a.player.state.position.z, '1P は また 歩ける').toBeLessThan(z0[0]! - 0.5);
      expect(bs.b.player.state.position.z, '2P も また 歩ける').toBeLessThan(z0[1]! - 0.5);
    });
  }

  it('元の 判定は のこる: もちもの画面などで もともと false の lock は ねむりが おわっても false のまま', () => {
    const r = sleepRig(NIGHT, 1);
    let panel = true;
    const lock = { playInputEnabled: () => !panel };
    blockInputWhileSleeping(lock, r.sleep);
    expect(lock.playInputEnabled()).toBe(false);
    panel = false;
    expect(lock.playInputEnabled()).toBe(true);
    r.sleep.use(1);
    expect(lock.playInputEnabled()).toBe(false);
    for (let i = 0; i < GADGET_TUNING.futon.sleepSteps + 5; i++) r.sleep.update();
    expect(lock.playInputEnabled()).toBe(true);
    panel = true;
    expect(lock.playInputEnabled()).toBe(false);
  });
});

describe('AC172 ①: 待っている 人を 起こす 入力（createWaitWake。1P も 2P も 同じ 部品）', () => {
  function waitRig(who: 1 | 2) {
    const r = sleepRig(NIGHT);
    const actions = new ActionState();
    const flags = { flinch: false, dead: false };
    const wake = createWaitWake({ who, sleep: r.sleep, actions, combat: { flinching: () => flags.flinch, dead: () => flags.dead } });
    const tick = (n = 1): void => {
      for (let i = 0; i < n; i++) {
        wake.step();
        actions.endFrame();
      }
    };
    const tap = (a: 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight' | 'jump'): void => {
      actions.press(a);
      tick();
      actions.release(a);
    };
    return { ...r, actions, flags, tick, tap };
  }

  for (const who of [1, 2] as const) {
    for (const key of ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump'] as const) {
      it(`${who}P が まち中に ${key} を 押すと その ステップで 起きる（夜は そのまま・暗さの もとの 待ちが 消える）`, () => {
        const r = waitRig(who);
        r.sleep.use(who);
        r.tick(30);
        expect(r.sleep.waiting(), '押さない 間は まち').toBe(who);
        r.tap(key);
        expect(r.sleep.waiting()).toBeNull();
        expect(r.sleep.sleeping()).toBe(false);
        expect(r.time.phase()).toBe('night');
      });
    }
  }

  it('ZL（secondary）を もう 一度 押しても 起きない。見回し・ほかの キーでも 起きない', () => {
    const r = waitRig(2);
    r.sleep.use(2);
    r.actions.press('secondary');
    r.tick(3);
    r.actions.release('secondary');
    r.tick(3);
    expect(r.sleep.waiting()).toBe(2);
  });

  it('ひるむ・倒れる（dead）で 起きる', () => {
    for (const k of ['flinch', 'dead'] as const) {
      const r = waitRig(1);
      r.sleep.use(1);
      r.tick(5);
      expect(r.sleep.waiting()).toBe(1);
      r.flags[k] = true;
      r.tick();
      expect(r.sleep.waiting(), k).toBeNull();
    }
  });

  it('ねる ときに 押しっぱなしだった ボタンは いったん はなす まで 起こさない。はなして 押しなおせば 起きる', () => {
    const r = waitRig(2);
    r.actions.press('moveForward');
    r.tick(2); // 押した ステップ（wasPressed）は すぎた あと
    r.sleep.use(2);
    r.tick(20);
    expect(r.sleep.waiting(), '押しつづけて いる あいだは まち').toBe(2);
    r.actions.release('moveForward');
    r.tick(2);
    r.tap('moveForward');
    expect(r.sleep.waiting()).toBeNull();
  });

  it('待って いない 人の 入力では 何も おきない（1P が まち中、2P が 歩いても 1P の まちは そのまま）', () => {
    const r2 = waitRig(2);
    r2.sleep.use(1);
    r2.tap('moveForward');
    r2.flags.flinch = true;
    r2.tick(3);
    expect(r2.sleep.waiting()).toBe(1);
  });
});

describe('AC172・AC173: 「おともだちが いっしょに ねたがっているよ」と 待ち中の 暗さ（sleepNotice・sleepInfo）', () => {
  const base = { waiting: 1 as 1 | 2 | null, ready: 2, night: true, sleeping: false };
  it('待っているのが 1P → 2P の 半分に 札。待っているのが 2P → 1P の 半分に 札。待っている 人の 半分には 出ない', () => {
    expect(sleepNotice({ ...base, waiting: 1 }).ask).toEqual([2]);
    expect(sleepNotice({ ...base, waiting: 2 }).ask).toEqual([1]);
  });
  it('待ち中の うすい 暗さは 待っている 人の 半分だけ。表（sleepWaitDim）の 値で、ねむりの 暗さ（1）より ずっと うすい', () => {
    const dim = GADGET_TUNING.futon.sleepWaitDim;
    expect(dim).toBeGreaterThan(0);
    expect(dim).toBeLessThan(0.6);
    expect(sleepNotice({ ...base, waiting: 2 }).dim).toEqual([{ who: 2, value: dim }]);
  });
  it('出ない 条件: 待ちなし／1 人（ready 1）／ひる・あさ／ねむり中', () => {
    expect(sleepNotice({ ...base, waiting: null })).toEqual({ ask: [], dim: [] });
    expect(sleepNotice({ ...base, ready: 1 }).ask).toEqual([]);
    expect(sleepNotice({ ...base, night: false }).ask).toEqual([]);
    expect(sleepNotice({ ...base, sleeping: true })).toEqual({ ask: [], dim: [] });
  });
  it('1 人の とき（ready=1・待ちは いつも なし）は 一度も 出ない', () => {
    const r = sleepRig(NIGHT, 1);
    const info = () => sleepInfo({ sleep: r.sleep, ready: () => r.state.ready, night: () => r.time.phase() === 'night' || r.time.phase() === 'dusk' });
    r.port(1);
    for (let i = 0; i < 10; i++) {
      r.sleep.update();
      expect(info().ask).toEqual([]);
      expect(info().waiting).toBeNull();
    }
  });
  it('sleepInfo: 本物の SleepSystem の ようすを duo.sleep() の 形に（まち → そろう → ねむり → おわり）', () => {
    const r = sleepRig(NIGHT);
    const info = () => sleepInfo({ sleep: r.sleep, ready: () => r.state.ready, night: () => r.time.phase() === 'night' || r.time.phase() === 'dusk' });
    expect(info()).toEqual({ ready: 2, waiting: null, sleeping: false, stepsLeft: 0, ask: [], dim: [] });
    r.port(1);
    expect(info()).toEqual({ ready: 2, waiting: 1, sleeping: false, stepsLeft: 0, ask: [2], dim: [{ who: 1, value: GADGET_TUNING.futon.sleepWaitDim }] });
    r.port(2);
    expect(info()).toEqual({ ready: 2, waiting: null, sleeping: true, stepsLeft: GADGET_TUNING.futon.sleepSteps, ask: [], dim: [] });
    for (let i = 0; i < GADGET_TUNING.futon.sleepSteps + 5; i++) r.sleep.update();
    expect(info().sleeping).toBe(false);
    expect(info().ask).toEqual([]);
  });
  it('起きた・そろった と 次の frame で 消える（待ちが 消えれば ask・dim も 消える）', () => {
    const r = sleepRig(NIGHT);
    const info = () => sleepInfo({ sleep: r.sleep, ready: () => r.state.ready, night: () => r.time.phase() === 'night' || r.time.phase() === 'dusk' });
    r.port(2);
    expect(info().ask).toEqual([1]);
    r.sleep.wake(2);
    expect(info().ask).toEqual([]);
    expect(info().dim).toEqual([]);
  });
});

describe('AC143・AC170: 数は 表から（直書きしない）', () => {
  it('すわる 目の さがり・ねむりの 長さ・待ち中の 暗さは 表の 値（2P だけの 新しい 数は ない。§9.12）', () => {
    expect(SEAT_TUNING.eyeDrop).toBeGreaterThan(0);
    expect(GADGET_TUNING.futon.sleepSteps).toBeGreaterThan(2);
    expect(GADGET_TUNING.futon.sleepWaitDim).toBeGreaterThan(0);
  });
});
