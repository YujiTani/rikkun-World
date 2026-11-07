import { describe, expect, it } from 'vitest';
import type { ArmorSlot, ItemId, LockStatus } from '../contracts';
import { createW2Settings } from '../contracts';
import { createParry, halfDamage, type ParryEvent, type ParryHit, type ParryInput } from '../combat/parry';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { NINJA_GEAR, SAMURAI_GEAR } from '../craft/config';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { DigSystemImpl } from '../dig/DigSystem';
import { ActionState, type Action } from '../input/actions';
import { settingsW3, FakeYokaiWorld } from '../combat/attackTestKit';
import { PlayerController } from '../player/PlayerController';
import { createBladeSystem } from '../tools/blade/BladeSystem';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { bindWho } from './credit';
import { createP2Dig } from './p2Dig';
import { createP2Parry, createParryEventSink, createParryPort } from './p2Parry';
import { P2State } from './p2State';

/**
 * COOP-1 作業 4d-1（docs/design/COOP-1.md 1.13 §3.6 (a)・§8 の 4d-1・§9.10・§12.0、AC99・AC100・AC102）の 先行テスト（赤）。
 * 2P の パリィ。部品は **1P と 同じ `createParry`**（src/combat/parry.ts）で、2P 用に 式を コピーしない。
 * 数（コマ・ゆっくり・半分・陣笠）は 調整表 `createW2Settings()`・`NINJA_TUNING` から 読む（直書きしない）。
 * 1 人の ときの 遊びは かわらない（AC113）: 1P の `createParry`・`wire/creatures.ts` の 1P の 道は この 子で 作りかえない（口を 足すだけ）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Parry.ts   （新しく。中身は ここに 書く。duoPlay.ts は つなぐ 行だけ）
 *     createP2Parry(d: P2ParryDeps): P2Parry
 *       P2ParryDeps = {
 *         settings: Parameters<typeof createParry>[0];                 // w2（1P と 同じ 調整表。createParry に そのまま わたす）
 *         reducedMotion?: () => boolean;                               // 「動きを へらす」（せっていは この 機械に 1 つ。1P と 同じ 物を わたす）
 *         armor: { equipped(slot: ArmorSlot): ItemId | null };         // p2.armor（陣笠の 判定。1P の そうびは 見ない）
 *         yawDeg: () => number;                                        // 2P の 向き（判定の 向き。読むたびに いまの 値）
 *         onSpark?: () => void;                                        // はじめの 成功の 1 回だけ（2P の 位置・向きで 火花を 出す 合図）
 *       }
 *       P2Parry = {
 *         readonly parry: Parry;                                       // 中の `createParry(settings, { reducedMotion })` 1 つ。2P の DigSystemImpl の `m4.parry` に わたす
 *         update(input: ParryInput): void;                             // 1P の step.ts と 同じ: `input.jingasa = armor.equipped('head') === SAMURAI_GEAR.head` を 入れてから `parry.update(input)`
 *         hit(h: Omit<ParryHit, 'yawDeg'>): YokaiParryVerdict;         // `parry.hit({ ...h, yawDeg: d.yawDeg() })` の { result, amount }。r.first なら onSpark()
 *         state(): ParryStateView;                                     // `parry.state()` と 同じ
 *       }
 *     createParryPort(side: (who: 1 | 2) => { hit(h: Omit<ParryHit, 'yawDeg'>): YokaiParryVerdict } | null): YokaiParryPort
 *       … 妖怪の 口。`hit(h, who)` は `side(who)?.hit(h)` を 返す。`side(who)` が null（その 人が いない）なら `{ result: 'none', amount: h.amount }`。
 *       配線: wire/creatures.ts の `parry: { hit }` を これに（1P の 側は 今の 中身〔1P の parry・controller.state.yawDeg・parryFx.spark〕を そのまま 包む。2P の 側は `shared.parryFor(2)`）。
 *       P2Parry に 足す（下の 「体の 止め」「やられ・持ちかえ」「ひるみの 出来事」の テスト）:
 *         motion(): { speedMul: number; jumpLocked: boolean }         … 1P の step.ts と 同じ 決まり: idle は { 1, false }。パリィを 始めた ステップは speedMul 1（まだ 走れる）・jumpLocked は true。そのあと パリィの あいだ speedMul 0・jumpLocked true（`parry.motion()` と `parry.startedNow()` から）。
 *                                                                        配線: 2P の ctl2.motion.speedMul・jumpLocked に 入れる（刀・弓・ため の motion と かけ合わせる〔speedMul〕／or する〔jumpLocked〕。1P の step.ts と 同じ 式）。
 *         cancel(tick: number): void                                  … `parry.cancel(tick)`。2P が 倒れた（life.down）・参加が おわる とき 配線が 呼ぶ。持ちかえ（刀でない 物）・入力が 通らない ときは `update` が 自分で 取り消す（1P と 同じ）。
 *         note(e: Omit<ParryEvent, 'tick'>): void                     … `parry.note(e)`（妖怪がわの よろけ・2 倍・はね返しの 出来事を その人の パリィの 出来事の 列へ）。
 *     createParryEventSink(side: (who: 1 | 2) => { note(e): void } | null): (e: { type: 'stagger' | 'staggerDouble' | 'reflectHit'; yokaiId: number; by?: StaggerBy; damage?: number }, who: 1 | 2) => void
 *         … 妖怪の `onParryEvent(e, who)` の 行き先。**ねらわれた 人（e の 原因の 人）の パリィ**の note に だけ 入れる（1P の events に 2P の ひるみを まぜない）。中身は 今の creatures.ts の `parry.note({ type, yokaiId, by?, damage? })` と 同じ 組み立て。
 *         `side(who)` が null なら 何も しない。配線: creatures.ts の `onParryEvent: (e, who) => …`（stagger の 音・アイコンは 今の まま）。
 *   【つなぎ目の 順番】2P の パリィの 入力 `p2Parry.update(dig.parryInput(tick))` は **妖怪の 更新（step.ts の yokaiM.update）より 前** に 入れる（1P の `parry.update` の すぐ あと）。
 *     wireDuo の `game.onUpdate(step)` は createStep の **あとに** 動く ので、`duoPlay.step` の 中に 書くと 2P だけ 1 コマ おそく なり、受けの はじめの F で 当たった とき おしい（半分）に なる。
 *     その 場所の 口は `shared.preYokai`（1 行。`createStep` が yokaiM.update の 前に `shared.preYokai?.()` を 呼ぶ。duoPlay が 2P の 入力・p2Parry.update・ctl2.motion を 入れる）。
 *   【見せ方の 配線】`createParryViews`（p2ParryView.ts。p2ParryView.test.ts）を **2 人が 参加している あいだ だけ** 動かし、**1P と 2P の 両方**に つなぐ（1P の パリィでも `duo-parry-edge-p1`・`duo.camDistance(1)` の よせが 出る。1 人の ときは ふちも よせも 出さない〔AC113〕）。
 *   【createParryPort の side】毎回 新しい 物を 作らず、作り置きの 物を 返す（妖怪の 当たりの たびに 呼ばれる）。
 *   src/yokai/ai/managerTypes.ts   `YokaiParryPort.hit(h, who: 1 | 2): YokaiParryVerdict`（2 つ目の 引数を 足す。今の `(h) => …` の 実装は そのまま 通る）。askParry の 側と `onParryEvent(e, who)` は parryWho.test.ts。
 *   src/dig/DigSystem.ts / digPorts.ts は かえない（`m4.parry` は もう ある。2P の m4 に `parry: p2Parry.parry` を わたすだけで、Shift＋ZR の ふりわけ〔routeAttackInput〕は 1P と 同じ 道に 乗る）。
 */

const S = createW2Settings();
const T = S.parryTicks;
const HIT = { by: 'attack' as const, yokaiId: 7, dirDeg: 0, amount: 8 };
const wearing = (head: ItemId | null) => ({ equipped: (slot: ArmorSlot): ItemId | null => (slot === 'head' ? head : null) });

function rig(o: { head?: ItemId | null; reduced?: boolean; yaw?: number } = {}) {
  const sparks = { n: 0 };
  const yaw = { v: o.yaw ?? 0 };
  const p2 = createP2Parry({
    settings: S,
    reducedMotion: () => o.reduced ?? false,
    armor: wearing(o.head ?? null),
    yawDeg: () => yaw.v,
    onSpark: () => void sparks.n++,
  });
  let tick = 0;
  const input = (pressed: boolean): ParryInput => ({ tick, item: 'katana', run: true, pressed, held: true, active: true });
  const step = (pressed = false): void => {
    tick++;
    p2.update(input(pressed));
  };
  /** F1 まで（押した ステップが F1） */
  const goTo = (F: number): void => {
    step(true);
    for (let f = 2; f <= F; f++) step();
  };
  return { p2, sparks, yaw, step, goTo, tick: () => tick };
}

/** 1P と 同じ 入力を 同じ 順で 食べさせる 1P の 部品（くらべる もと） */
function ref1P(jingasa = false) {
  const p = createParry(S);
  let tick = 0;
  return {
    p,
    step(pressed = false): void {
      tick++;
      p.update({ tick, item: 'katana', run: true, pressed, held: true, active: true, jingasa });
    },
  };
}

describe('AC99 2P の パリィは 1P と 同じ 流れ・同じ コマ数（同じ 部品）', () => {
  it('同じ 入力を 食べさせると、毎ステップの state() と 出来事が 1P の createParry と ぴったり 同じ（はじめ〜おわり・先行入力の つづけ押し まで）', () => {
    const a = rig();
    const b = ref1P();
    const total = T.ready + T.guard + T.recover;
    // 押す → 何も 来ない まま おわる → すぐ また 押す（先行入力）→ 途中で もう 1 回
    const script: boolean[] = [true, ...Array(total - 5).fill(false), true, ...Array(total + 10).fill(false), true, false, false, true];
    script.forEach((pressed, i) => {
      a.step(pressed);
      b.step(pressed);
      expect(a.p2.state(), `ステップ ${i + 1}`).toEqual(b.p.state());
    });
    expect(a.p2.parry.events()).toEqual(b.p.events());
    expect(a.p2.parry.sounds()).toEqual(b.p.sounds());
  });

  it('F ごとの 判定（成功・おしい・失敗）も 1P と 同じ（F1〜おわりの 少し あと まで）', () => {
    const total = T.ready + T.guard + T.recover;
    for (let F = 1; F <= total + 2; F++) {
      const a = rig();
      const b = ref1P();
      a.goTo(F);
      b.step(true);
      for (let f = 2; f <= F; f++) b.step();
      const mine = a.p2.hit(HIT);
      const theirs = b.p.hit({ ...HIT, yawDeg: 0 });
      expect({ result: mine.result, amount: mine.amount }, `F${F}`).toEqual({ result: theirs.result, amount: theirs.amount });
    }
  });

  it('成功の F は 受けの 窓（ready の つぎ 〜 guard の おわり）。受けの 外は おしい（半分）か 失敗', () => {
    const inGuard = rig();
    inGuard.goTo(T.ready + 1);
    expect(inGuard.p2.hit(HIT).result).toBe('success');
    const ready = rig();
    ready.goTo(T.ready);
    expect(ready.p2.hit(HIT).result, '構えの F は おしい').toBe('early');
    const late = rig();
    late.goTo(T.ready + T.guard + 1);
    expect(['early', 'fail']).toContain(late.p2.hit(HIT).result);
    const idle = rig();
    idle.step();
    expect(idle.p2.hit(HIT).result, '押していない').toBe('none');
  });
});

describe('AC99 判定の 向きは 2P の 向き（yawDeg）', () => {
  it('来た 向きが 2P の 前 ±parryArcDeg の 中なら 成功、うしろなら 失敗（behind）', () => {
    const front = rig({ yaw: 90 });
    front.goTo(T.ready + 1);
    expect(front.p2.hit({ ...HIT, dirDeg: 90 }).result).toBe('success');
    const back = rig({ yaw: 90 });
    back.goTo(T.ready + 1);
    expect(back.p2.hit({ ...HIT, dirDeg: 270 }).result).toBe('fail');
    expect(back.p2.parry.events().filter((e: ParryEvent) => e.type === 'parryFail')).toMatchObject([{ behind: true }]);
  });

  it('向きは 読むたびに いまの 値（yawDeg を あとから かえると 判定が かわる）', () => {
    const r = rig({ yaw: 0 });
    r.goTo(T.ready + 1);
    r.yaw.v = 180;
    expect(r.p2.hit({ ...HIT, dirDeg: 0 }).result).toBe('fail');
    r.yaw.v = 0;
    // 失敗は 受けを つぶさない（1P と 同じ）: 向きを 直せば 同じ パリィで 成功できる
    expect(r.p2.hit({ ...HIT, dirDeg: 0 }).result).toBe('success');
  });
});

describe('AC99 成功 → 次の ステップから ゆっくり（世界ぜんたい。倍率は 調整表 parrySlow）', () => {
  it('成功の 次の ステップから slowLeft = parrySlow.ticks・timeScale = parrySlow.scale。ticks ステップ つづいて 1 に もどる', () => {
    const r = rig();
    r.goTo(T.ready + 1);
    expect(r.p2.hit(HIT).result).toBe('success');
    expect(r.p2.state().slowLeft, '成功した ステップは まだ').toBe(0);
    expect(r.p2.state().timeScale).toBe(1);
    const scales: number[] = [];
    for (let i = 0; i < S.parrySlow.ticks + 4; i++) {
      r.step();
      scales.push(r.p2.state().timeScale);
    }
    expect(scales.slice(0, S.parrySlow.ticks)).toEqual(Array(S.parrySlow.ticks).fill(S.parrySlow.scale));
    expect(scales.slice(S.parrySlow.ticks)).toEqual([1, 1, 1, 1]);
  });

  it('同じ パリィで 2 回目の 成功は ゆっくりを 入れなおさない（はじめの 成功だけ。1P の 今の 決まり）', () => {
    const r = rig();
    r.goTo(T.ready + 1);
    r.p2.hit(HIT);
    r.step();
    const left = r.p2.state().slowLeft;
    expect(left).toBe(S.parrySlow.ticks);
    r.p2.hit(HIT);
    r.step();
    expect(r.p2.state().slowLeft).toBe(left - 1);
  });

  it('「動きを へらす」なら timeScale は 1 の まま（slowLeft は 数える。ふちも よせも 出さない もとに なる）', () => {
    const r = rig({ reduced: true });
    r.goTo(T.ready + 1);
    r.p2.hit(HIT);
    r.step();
    expect(r.p2.state().slowLeft).toBe(S.parrySlow.ticks);
    expect(r.p2.state().timeScale).toBe(1);
  });
});

describe('AC99 おしい は 半分・失敗は ふつう・光と 音（1P と 同じ 数・同じ 音）', () => {
  it('おしい（構えの F）: amount = halfDamage(元, parryEarlyMul)。失敗: 元の まま', () => {
    const r = rig();
    r.goTo(T.ready);
    const e = r.p2.hit(HIT);
    expect(e).toEqual({ result: 'early', amount: halfDamage(HIT.amount, S.parryEarlyMul) });
    const f = rig();
    f.goTo(T.ready + T.guard + S.parryEarlyTicks + 1);
    expect(f.p2.hit(HIT)).toEqual({ result: 'fail', amount: HIT.amount });
  });

  it('光（onSpark）は はじめの 成功の 1 回だけ。おしい・失敗・2 回目の 成功では 出ない', () => {
    const early = rig();
    early.goTo(T.ready);
    early.p2.hit(HIT);
    expect(early.sparks.n).toBe(0);
    const r = rig();
    r.goTo(T.ready + 1);
    r.p2.hit(HIT);
    expect(r.sparks.n).toBe(1);
    r.p2.hit(HIT);
    expect(r.sparks.n).toBe(1);
  });

  it('音: はじめの 成功で "parry"、おしいで "parryEarly"（1P と 同じ 名前）。読むと 空になる', () => {
    const r = rig();
    r.goTo(T.ready + 1);
    r.p2.parry.sounds();
    r.p2.hit(HIT);
    expect(r.p2.parry.sounds()).toContain('parry');
    expect(r.p2.parry.sounds()).toEqual([]);
    const e = rig();
    e.goTo(T.ready);
    e.p2.parry.sounds();
    e.p2.hit(HIT);
    expect(e.p2.parry.sounds()).toContain('parryEarly');
  });

  it('青白い 光の のこり（glowLeft）は 成功の 次の ステップから parryGlowTicks', () => {
    const r = rig();
    r.goTo(T.ready + 1);
    r.p2.hit(HIT);
    r.step();
    expect(r.p2.state().glowLeft).toBe(S.parryGlowTicks);
  });
});

describe('AC99 陣笠: 2P の そうびの 陣笠で 受けが のびる（1P と 同じ だけ）', () => {
  it('陣笠を 着て 始めた パリィは state().jingasa = true・受けの 成功が jingasaGuardTicks。着ていない ときは ふつう', () => {
    const hat = rig({ head: SAMURAI_GEAR.head });
    hat.goTo(T.ready + T.guard + 1); // ふつうなら 受けの 外
    expect(hat.p2.state().jingasa).toBe(true);
    expect(hat.p2.hit(HIT).result, 'のびた 分は まだ 成功').toBe('success');
    const hatEnd = rig({ head: SAMURAI_GEAR.head });
    hatEnd.goTo(T.ready + NINJA_TUNING.jingasaGuardTicks);
    expect(hatEnd.p2.hit(HIT).result).toBe('success');
    const hatOver = rig({ head: SAMURAI_GEAR.head });
    hatOver.goTo(T.ready + NINJA_TUNING.jingasaGuardTicks + 1);
    expect(hatOver.p2.hit(HIT).result).not.toBe('success');
    const bare = rig();
    bare.goTo(T.ready + T.guard + 1);
    expect(bare.p2.state().jingasa).toBe(false);
    expect(bare.p2.hit(HIT).result, 'ふつうは 受けが おわって いる').not.toBe('success');
  });

  it('陣笠いがいの 頭の そうび（忍びの 頭巾 など）では のびない。1P の 陣笠 つきの createParry と 同じ 流れ', () => {
    const other = rig({ head: NINJA_GEAR.head });
    other.goTo(T.ready + 1);
    expect(other.p2.state().jingasa).toBe(false);
    const a = rig({ head: SAMURAI_GEAR.head });
    const b = ref1P(true);
    for (let i = 0; i < 90; i++) {
      const pressed = i === 0;
      a.step(pressed);
      b.step(pressed);
      expect(a.p2.state(), `ステップ ${i + 1}`).toEqual(b.p.state());
    }
  });
});

// ------------------------------------------------------------------ 2P の 入力が パリィに 届く（Shift＋ZR）

const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
const EYE = 1.62;

/** 2P の 入れ物: 刀を 持った 2P の DigSystemImpl（m4.parry に 2P の パリィを わたす）。p2Dig.test.ts の punchRig と 同じ 作り方 */
function digRig(o: { enabled?: () => boolean } = {}) {
  const world = new ArrayVoxelWorld({ x: 32, y: 24, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, 'dirt');
  const actions = new ActionState();
  const p2 = new P2State();
  p2.inventory.setSlot(0, { item: 'katana', count: 1 });
  p2.inventory.select(0);
  const lk: LockStatus = o.enabled ? { ...lock, playInputEnabled: o.enabled } : lock;
  const controller = new PlayerController(world, actions, { consume: () => ({ dx: 0, dy: 0 }) }, lk, () => ({ x: 16.5, y: 9, z: 16.5, yawDeg: 0, pitchDeg: 0 }));
  const yokai = bindWho(new FakeYokaiWorld(), 2);
  const tools = { current: () => ({ item: null, kind: 'hand' as const, power: 1, level: 0, damage: 1, reach: 3.5, ticks: 30 }), step() {}, pushSwing() {}, swingWhiff() {}, onPunchStart() {}, punchParams: () => ({ damage: 1, reach: 3.5, ticks: 30 }) };
  const settings = settingsW3();
  const combat = new PlayerCombatImpl({
    world, player: { get: () => controller.state, set: (v) => controller.set(v) }, inventory: p2.inventory, yokai: () => yokai,
    spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }), tool: tools, settings,
  });
  let tick = 0;
  const blade = createBladeSystem({ world, yokai: () => yokai, settings, weaponDamage: () => 4, onHit: () => {}, lunge: (dx, dz) => controller.lunge(dx, dz), tick: () => tick });
  const parry = createP2Parry({ settings: S, armor: p2.armor, yawDeg: () => controller.state.yawDeg });
  const m4 = { tools, blade, w2: settings, yokai: () => yokai, parry: parry.parry };
  const dig: DigSystemImpl = createP2Dig({ world, p2, actions, position: () => controller.state, lock: lk, eyeHeight: () => EYE, partner: () => null, gate: combat, m4 });
  /** step.ts と 同じ 順: parryInput → parry.update → dig.update */
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      tick++;
      parry.update(dig.parryInput(tick));
      dig.update();
      combat.update();
      actions.endFrame();
    }
  };
  step(2);
  return { actions, step, parry, blade };
}

describe('AC99 2P の パッド（Shift＋ZR = run＋primary）で パリィが 出る（1P と 同じ ふりわけ）', () => {
  it('刀を 持って run を 押しながら primary → 2P の パリィが ready・F1。刀の ふり（blade）は 始まらない', () => {
    const r = digRig();
    expect(r.parry.state().phase).toBe('idle');
    r.actions.press('run' as Action);
    r.actions.press('primary' as Action);
    r.step();
    expect(r.parry.state()).toMatchObject({ phase: 'ready', frame: 1 });
    r.actions.release('primary' as Action);
    r.step(3);
    expect(r.parry.state().phase).not.toBe('idle');
    expect(r.blade.state().phase, '刀の ふりは 出ない').toBe('idle');
  });

  it('run を 押して いない primary は ふつうの こうげき（刀の ふり）。パリィは 出ない', () => {
    const r = digRig();
    r.actions.press('primary' as Action);
    r.step();
    expect(r.parry.state().phase).toBe('idle');
    expect(r.blade.state().phase).not.toBe('idle');
  });

  it('もちもの画面などで 2P の 入力が 通らない（playInputEnabled が false）ときは パリィは 出ない', () => {
    let on = false;
    const r = digRig({ enabled: () => on });
    r.actions.press('run' as Action);
    r.actions.press('primary' as Action);
    r.step();
    expect(r.parry.state().phase).toBe('idle');
    on = true;
    r.actions.release('primary' as Action);
    r.actions.press('primary' as Action);
    r.step();
    expect(r.parry.state().phase).toBe('ready');
  });
});

// ------------------------------------------------------------------ AC102 どの パリィに 聞くか

/** 1P の 側（今の creatures.ts の 中身と 同じ: 1P の createParry・1P の 向き） */
function side1(p: ReturnType<typeof createParry>, yaw = 0) {
  return {
    hit: (h: Omit<ParryHit, 'yawDeg'>) => {
      const r = p.hit({ ...h, yawDeg: yaw });
      return { result: r.result, amount: r.amount };
    },
  };
}

describe('AC102 妖怪の こうげきは ねらっている 人の パリィに 聞く（createParryPort）', () => {
  it('2P を ねらう こうげきの とき 1P だけが パリィ していても 成功に ならない。2P は ふつうの ダメージ（amount そのまま）', () => {
    const one = ref1P();
    one.step(true);
    for (let f = 2; f <= T.ready + 1; f++) one.step(); // 1P は 受けの 中
    const two = rig(); // 2P は 何も していない
    two.step();
    const port = createParryPort((who) => (who === 1 ? side1(one.p) : who === 2 ? two.p2 : null));
    const v = port.hit(HIT, 2);
    expect(v).toEqual({ result: 'none', amount: HIT.amount });
    expect(one.p.events().filter((e) => e.type === 'parrySuccess'), '1P の パリィは 使われない').toHaveLength(0);
  });

  it('逆: 1P を ねらう こうげきの とき 2P だけが パリィ していても 成功に ならない', () => {
    const one = ref1P();
    one.step();
    const two = rig();
    two.goTo(T.ready + 1);
    const port = createParryPort((who) => (who === 1 ? side1(one.p) : two.p2));
    expect(port.hit(HIT, 1)).toEqual({ result: 'none', amount: HIT.amount });
    expect(two.p2.parry.events().filter((e) => e.type === 'parrySuccess')).toHaveLength(0);
  });

  it('ねらわれた 人が パリィ していれば その人の 判定で 成功（2P ねらい → 2P の 向きで）。ほかの 人の パリィの 状態は かわらない', () => {
    const one = ref1P();
    one.step();
    const before = one.p.state();
    const two = rig({ yaw: 90 });
    two.goTo(T.ready + 1);
    const port = createParryPort((who) => (who === 1 ? side1(one.p, 0) : two.p2));
    expect(port.hit({ ...HIT, dirDeg: 90 }, 2).result, '2P の 前').toBe('success');
    expect(port.hit({ ...HIT, dirDeg: 90 }, 1).result, '1P は 構えて いない').toBe('none');
    expect(one.p.state()).toEqual(before);
    expect(one.p.events()).toHaveLength(0);
  });

  it('その 人が いない（side が null。2P が 参加して いない）なら 何も 受けない: result none・amount そのまま', () => {
    const one = ref1P();
    one.step(true);
    const port = createParryPort((who) => (who === 1 ? side1(one.p) : null));
    expect(port.hit(HIT, 2)).toEqual({ result: 'none', amount: HIT.amount });
  });

  it('1 人の とき（who は いつも 1）は 1P の 側の 答えを そのまま 返す（今の 動きと 同じ）', () => {
    const one = ref1P();
    one.step(true);
    for (let f = 2; f <= T.ready + 1; f++) one.step();
    const port = createParryPort((who) => (who === 1 ? side1(one.p) : null));
    expect(port.hit(HIT, 1)).toEqual({ result: 'success', amount: 0 });
  });
});

// ------------------------------------------------------------------ 体の 止め・取り消し・ひるみの 出来事

describe('AC99 パリィの あいだの 体の 止め（1P の step.ts と 同じ 決まり）', () => {
  it('idle は { speedMul 1, jumpLocked false }。始めた ステップは まだ 走れる（speedMul 1）けど ジャンプは 止まる。そのあと パリィの あいだ speedMul 0・jumpLocked true。おわると もどる', () => {
    const r = rig();
    r.step();
    expect(r.p2.motion()).toEqual({ speedMul: 1, jumpLocked: false });
    r.step(true);
    expect(r.p2.motion(), '始めた ステップ').toEqual({ speedMul: 1, jumpLocked: true });
    const total = T.ready + T.guard + T.recover;
    for (let f = 2; f <= total; f++) {
      r.step();
      expect(r.p2.motion(), `F${f}`).toEqual({ speedMul: 0, jumpLocked: true });
    }
    r.step();
    expect(r.p2.motion()).toEqual({ speedMul: 1, jumpLocked: false });
  });

  it('1P の createParry の motion() と startedNow() から 同じ 値(式の コピーなし)', () => {
    const a = rig();
    const b = ref1P();
    for (let i = 0; i < 70; i++) {
      const pressed = i === 0 || i === 50;
      a.step(pressed);
      b.step(pressed);
      const m = b.p.motion();
      expect(a.p2.motion(), `ステップ ${i + 1}`).toEqual({ speedMul: b.p.startedNow() ? 1 : m.speedMul, jumpLocked: m.jumpLocked });
    }
  });
});

describe('AC99 持ちかえ・やられ・画面で パリィが 取り消される', () => {
  it('刀でない 物に 持ちかえる と その ステップで idle（1P と 同じ）。入力が 通らない（active false）でも idle', () => {
    const swap = rig();
    swap.goTo(T.ready + 1);
    swap.p2.update({ tick: 99, item: 'dirt', run: true, pressed: false, held: false, active: true });
    expect(swap.p2.state().phase).toBe('idle');
    const off = rig();
    off.goTo(T.ready + 1);
    off.p2.update({ tick: 99, item: 'katana', run: true, pressed: false, held: false, active: false });
    expect(off.p2.state().phase).toBe('idle');
  });

  it('cancel(tick): 倒れた（life.down）・参加が おわる ときに 配線が 呼ぶ。idle に もどり、先行入力も すてる。parryEnd の 出来事が 1 つ', () => {
    const r = rig();
    r.goTo(T.ready + 1);
    r.p2.cancel(50);
    expect(r.p2.state()).toMatchObject({ phase: 'idle', buffered: false });
    expect(r.p2.parry.events().filter((e) => e.type === 'parryEnd')).toHaveLength(1);
    expect(r.p2.motion()).toEqual({ speedMul: 1, jumpLocked: false });
    r.p2.cancel(51); // idle での cancel は 何も おきない
    expect(r.p2.parry.events().filter((e) => e.type === 'parryEnd')).toHaveLength(1);
  });
});

describe('AC99 ひるんだ 出来事は ねらわれた 人の パリィの 出来事の 列に だけ 入る（1P の events に まぜない）', () => {
  it('who = 2 の stagger は 2P の parry.events() にだけ。who = 1 は 1P にだけ。中身は 今の creatures.ts と 同じ { type, yokaiId, by?, damage? }', () => {
    const one = ref1P();
    one.step(true);
    const two = rig();
    two.goTo(T.ready + 1);
    const sink = createParryEventSink((who) => (who === 1 ? one.p : who === 2 ? two.p2 : null));
    sink({ type: 'stagger', yokaiId: 7, by: 'parry' }, 2);
    expect(two.p2.parry.events().filter((e) => e.type === 'stagger')).toMatchObject([{ yokaiId: 7, by: 'parry' }]);
    expect(one.p.events().filter((e) => e.type === 'stagger')).toHaveLength(0);
    sink({ type: 'staggerDouble', yokaiId: 8, damage: 5 }, 1);
    expect(one.p.events().filter((e) => e.type === 'staggerDouble')).toMatchObject([{ yokaiId: 8, damage: 5 }]);
    expect(two.p2.parry.events().filter((e) => e.type === 'staggerDouble')).toHaveLength(0);
  });

  it('その 人が いない（side が null）なら 何も しない（落ちない）。1P の events も ふえない', () => {
    const one = ref1P();
    one.step(true);
    const n = one.p.events().length;
    const sink = createParryEventSink((who) => (who === 1 ? one.p : null));
    expect(() => sink({ type: 'stagger', yokaiId: 1, by: 'parry' }, 2)).not.toThrow();
    expect(one.p.events()).toHaveLength(n);
  });
});
