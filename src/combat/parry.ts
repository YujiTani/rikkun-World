import type { ItemId, Vec3, W2Settings } from '../contracts';
import { isBladeItem } from '../tools/blade/BladeSystem';

/**
 * 刀の パリィ（WEAPON-5。仕様 docs/design/WEAPON-5.md）。
 * 純粋な 関数（判定・半分・向き・入力の ふりわけ・光の 強さ）と、1 ステップごとに 進める 部品 `createParry`。
 * 1 ステップの 中の 順番: 入力（`update`）→ 妖怪の 攻撃の 当たり（`hit`）。
 */

export type ParryPhase = 'idle' | 'ready' | 'guard' | 'recover' | 'kime';
export type ParryResult = 'success' | 'early' | 'fail' | 'none';

export interface ParryStateLike {
  phase: ParryPhase;
  frame: number;
}

type ParrySettings = Pick<W2Settings, 'parryTicks' | 'parryEarlyTicks' | 'parryEarlyMul' | 'parryArcDeg'>;

/** 向きを (-180, 180] に */
function wrap180(d: number): number {
  let x = d % 360;
  if (x > 180) x -= 360;
  else if (x <= -180) x += 360;
  return x;
}

/** 水平の 向き（度。0 = 北 −z、90 = 東 +x）。水平の きょり 0.01 未満は null（真上・真下） */
export function bearingOf(from: Vec3, to: Vec3): number | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 0.01) return null;
  return (Math.atan2(dx, -dz) * 180) / Math.PI;
}

/**
 * 判定。state = いまの パリィ、fromDeg = 来た 向き（null = 真上・真下 → 前とみなす）、yawDeg = プレイヤーの 向き。
 * 前 ±arc°（ちょうどは 前）の 外は どの F でも 失敗（behind）。
 */
export function judgeParry(state: ParryStateLike, fromDeg: number | null, yawDeg: number, S: ParrySettings): { result: ParryResult; behind: boolean } {
  if (state.phase === 'idle') return { result: 'none', behind: false };
  const behind = fromDeg !== null && Math.abs(wrap180(fromDeg - yawDeg)) > S.parryArcDeg + 1e-9;
  if (behind) return { result: 'fail', behind: true };
  if (state.phase === 'kime' || state.phase === 'guard') return { result: 'success', behind: false };
  if (state.phase === 'ready') return { result: 'early', behind: false };
  const t = S.parryTicks;
  const f = state.frame;
  if (f <= t.ready + t.guard + S.parryEarlyTicks) return { result: 'early', behind: false };
  return { result: 'fail', behind: false };
}

/** 半分（切り上げ）の ダメージ。防具の カットは 半分の あと（カットが あれば 最低 1） */
export function halfDamage(amount: number, mul: number): number {
  return Math.ceil(amount * mul - 1e-9);
}
export function parryEarlyDamage(amount: number, mul: number, armorCut: number): number {
  const half = halfDamage(amount, mul);
  return armorCut >= 1 ? Math.max(1, half - armorCut) : half;
}

export type AttackRoute = 'parry' | 'normal' | 'none';

/** 左クリックの ふりわけ（§4.2）。刀 ＋ Shift ＋ 押した → パリィ、刀 ＋ Shift ＋ 押しつづけ → 何も出さない、ほかは 今のまま */
export function routeAttackInput(i: { item: ItemId | null | undefined; run: boolean; pressed: boolean; held: boolean }): AttackRoute {
  if (!isBladeItem(i.item) || !i.run) return 'normal';
  if (i.pressed) return 'parry';
  if (i.held) return 'none';
  return 'normal';
}

/**
 * 青白い 光の 強さ 0〜1。成功の 次の ステップが ticksLeft = N（= parryGlowTicks）。
 * はじめの 3 割は 1、そのあと なめらかに 0 へ（山は 1 つ・点滅しない）。ticksLeft 0 は 0。
 */
export function parryGlowLevel(ticksLeft: number, S: Pick<W2Settings, 'parryGlowTicks'>): number {
  const n = S.parryGlowTicks;
  if (!(ticksLeft > 0) || n <= 0) return 0;
  const s = n - ticksLeft + 1;
  const plateau = Math.round(n * 0.3);
  if (s <= plateau) return 1;
  const k = (s - plateau) / Math.max(1, n - plateau);
  return Math.max(0, Math.min(1, 1 - Math.pow(Math.min(1, k), 0.8)));
}

export type ParryBy = 'attack' | 'fireball';

export interface ParryEvent {
  type: 'parryStart' | 'parrySuccess' | 'parryEarly' | 'parryFail' | 'parryEnd' | 'stagger' | 'staggerDouble' | 'reflectHit';
  tick: number;
  frame?: number;
  by?: ParryBy | 'parry' | 'reflect';
  yokaiId?: number | null;
  amount?: number;
  damage?: number;
  behind?: boolean;
  success?: boolean;
}

export interface ParryStateView {
  phase: ParryPhase;
  frame: number;
  buffered: boolean;
  slowLeft: number;
  timeScale: number;
  glowLeft: number;
}

export interface ParryInput {
  tick: number;
  item: ItemId | null | undefined;
  /** Shift（Action `run`）を 押しているか */
  run: boolean;
  /** このステップで 左クリックを 押したか */
  pressed: boolean;
  /** 左クリックを 押しつづけているか（押したステップも 含む） */
  held: boolean;
  /** 出せる か（もちもの画面・案内画面・やられている 間は false） */
  active: boolean;
  /** 刀の わざ・かまえ替えが つづいていて、このステップも おわらない（パリィを すぐは 出せない） */
  bladeBusy?: boolean;
  /** 刀の わざが 先行入力を 受けつける とき（パリィも 先行入力に できる） */
  bladeAccepts?: boolean;
}

export interface ParryHit {
  /** 来た 向き（プレイヤーの足もと → 相手。null = 真上・真下） */
  dirDeg: number | null;
  yawDeg: number;
  by: ParryBy;
  yokaiId: number | null;
  /** 元の ダメージ（防具の前） */
  amount: number;
}

export interface ParryHitResult {
  result: ParryResult;
  behind: boolean;
  /** early のとき 半分にした あとの 数（防具の前）。それ以外は 元の数 */
  amount: number;
  /** このパリィで はじめての 成功（スロー・光・音・火花を 出す） */
  first: boolean;
}

const MAX_EVENTS = 20000;

export interface ParryOptions {
  /** 「動きを減らす」: スローを しない（slowLeft は 同じく へる） */
  reducedMotion?: boolean | (() => boolean);
}

export interface Parry {
  /** 1 ステップ 1 回。入力 → 妖怪の 当たり の 順で、当たりより 先に 呼ぶ */
  update(input: ParryInput): void;
  /** 妖怪の 攻撃・火の玉が プレイヤーに 当たった */
  hit(h: ParryHit): ParryHitResult;
  state(): ParryStateView;
  /** 読んでも 空に ならない 出来事 */
  events(): ParryEvent[];
  eventCount(): number;
  eventsFrom(i: number): ParryEvent[];
  /** 外から 足す 出来事（妖怪がわの stagger・staggerDouble・reflectHit） */
  note(e: Omit<ParryEvent, 'tick'>, tick?: number): void;
  /** 鳴らす 音の 名前（読むと 空になる） */
  sounds(): string[];
  /** 次の ステップに 押した パリィを 先行入力に できるか */
  acceptsBuffer(): boolean;
  /** 先行入力を すてる（あとに 押した わざが 勝つ） */
  dropBuffer(): void;
  /** いまの ステップが 先行入力を 受ける区間か（きめ・すき の さいご） */
  inWindow(): boolean;
  /** パリィの 間の 歩く倍率・ジャンプ止め */
  motion(): { speedMul: number; jumpLocked: boolean };
  /** このステップで パリィを 始めた（走りの 勢いを 止める） */
  startedNow(): boolean;
  /** パリィの 全部を 取り消す（持ちかえ・やられた） */
  cancel(tick: number): void;
}

export function createParry(S: ParrySettings & Pick<W2Settings, 'parryKimeTicks' | 'parrySlow' | 'parryGlowTicks' | 'bladeBufferTicks'>, opts: ParryOptions = {}): Parry {
  const reduced = (): boolean => (typeof opts.reducedMotion === 'function' ? opts.reducedMotion() : !!opts.reducedMotion);
  let phase: ParryPhase = 'idle';
  let frame = 0;
  let buffered = false;
  let started = false;
  /** 始めた ステップの 設定（そのパリィの間 つかう） */
  let snap = { ready: 2, guard: 18, recover: 20, early: 12, kime: 8, mul: 0.5, arc: 90 };
  let total = 0;
  let succeeded = false;
  let firstDone = false;
  let toKime = false;
  let slowLeft = 0;
  let glowLeft = 0;
  let slowPending = 0;
  let glowPending = 0;
  let tickNow = 0;
  const evs: ParryEvent[] = [];
  let snd: string[] = [];

  const emit = (e: ParryEvent): void => {
    evs.push(e);
    if (evs.length > MAX_EVENTS) evs.length = MAX_EVENTS; // 上限（実際には 届かない）。古い分は 消さない
  };

  const snapSettings = (): ParrySettings => ({
    parryTicks: { ready: snap.ready, guard: snap.guard, recover: snap.recover },
    parryEarlyTicks: snap.early,
    parryEarlyMul: snap.mul,
    parryArcDeg: snap.arc,
  });

  const start = (tick: number): void => {
    snap = {
      ready: S.parryTicks.ready,
      guard: S.parryTicks.guard,
      recover: S.parryTicks.recover,
      early: S.parryEarlyTicks,
      kime: S.parryKimeTicks,
      mul: S.parryEarlyMul,
      arc: S.parryArcDeg,
    };
    total = snap.ready + snap.guard + snap.recover;
    phase = 'ready';
    frame = 1;
    buffered = false;
    succeeded = false;
    firstDone = false;
    toKime = false;
    started = true;
    emit({ type: 'parryStart', tick });
    snd.push('parrySwing');
    settlePhase();
  };

  /** frame から phase を 決める（かまえ・受け・すき） */
  const settlePhase = (): void => {
    phase = frame <= snap.ready ? 'ready' : frame <= snap.ready + snap.guard ? 'guard' : 'recover';
  };

  /** おわる。先行入力（buffered）は のこす（そのステップに すぐ 次を 出す）。取り消しは 呼ぶ側で すてる */
  const end = (tick: number): void => {
    emit({ type: 'parryEnd', tick, success: succeeded });
    phase = 'idle';
    frame = 0;
    toKime = false;
  };

  /** 先行入力を 受ける はじめの F（すき: さいご bladeBufferTicks。きめ: ぜんぶ） */
  const windowStart = (): number => total - S.bladeBufferTicks + 1;

  return {
    update(i: ParryInput): void {
      tickNow = i.tick;
      started = false;
      // スロー・光の 数え: 成功の 次の ステップから
      if (slowPending > 0) {
        slowLeft = slowPending;
        slowPending = 0;
      } else if (slowLeft > 0) slowLeft--;
      if (glowPending > 0) {
        glowLeft = glowPending;
        glowPending = 0;
      } else if (glowLeft > 0) glowLeft--;

      // 取り消し（持ちかえ・やられた・画面）
      if (!i.active || !isBladeItem(i.item)) {
        if (phase !== 'idle') end(i.tick);
        buffered = false;
        if (phase === 'idle') return;
      }

      // すすめる
      if (phase !== 'idle') {
        if (toKime) {
          phase = 'kime';
          frame = 1;
          toKime = false;
        } else if (phase === 'kime') {
          frame++;
          if (frame > snap.kime) end(i.tick);
        } else {
          frame++;
          if (frame > total) end(i.tick);
          else settlePhase();
        }
      }

      // 押した
      const press = i.active && routeAttackInput(i) === 'parry';
      if (press) {
        if (phase === 'idle') {
          if (!i.bladeBusy) start(i.tick);
          else if (i.bladeAccepts) buffered = true;
        } else if (phase === 'kime' || frame >= windowStart()) buffered = true;
      }
      // きめ明け・すき明け: 先行入力は 次のステップではなく そのステップに 出す
      if (phase === 'idle' && buffered && i.active && isBladeItem(i.item) && !i.bladeBusy) {
        buffered = false;
        start(i.tick);
      }
    },

    hit(h: ParryHit): ParryHitResult {
      const j = judgeParry({ phase, frame }, h.dirDeg, h.yawDeg, snapSettings());
      if (j.result === 'none') return { result: 'none', behind: false, amount: h.amount, first: false };
      if (j.result === 'success') {
        emit({ type: 'parrySuccess', tick: tickNow, frame, by: h.by, yokaiId: h.yokaiId });
        let first = false;
        if (!firstDone) {
          firstDone = true;
          first = true;
          snd.push('parry');
          slowPending = S.parrySlow.ticks;
          glowPending = S.parryGlowTicks;
        }
        succeeded = true;
        if (phase !== 'kime') toKime = true;
        return { result: 'success', behind: false, amount: 0, first };
      }
      if (j.result === 'early') {
        const amount = halfDamage(h.amount, snap.mul);
        emit({ type: 'parryEarly', tick: tickNow, frame, by: h.by, yokaiId: h.yokaiId, amount });
        snd.push('parryEarly');
        return { result: 'early', behind: false, amount, first: false };
      }
      emit({ type: 'parryFail', tick: tickNow, frame, by: h.by, yokaiId: h.yokaiId, behind: j.behind });
      return { result: 'fail', behind: j.behind, amount: h.amount, first: false };
    },

    state(): ParryStateView {
      return {
        phase,
        frame,
        buffered,
        slowLeft,
        timeScale: slowLeft > 0 && !reduced() ? S.parrySlow.scale : 1,
        glowLeft,
      };
    },
    events(): ParryEvent[] {
      return evs.slice();
    },
    eventCount(): number {
      return evs.length;
    },
    eventsFrom(i: number): ParryEvent[] {
      return evs.slice(i);
    },
    note(e, tick): void {
      emit({ ...e, tick: tick ?? tickNow });
    },
    sounds(): string[] {
      const out = snd;
      snd = [];
      return out;
    },
    acceptsBuffer(): boolean {
      if (phase === 'idle') return false;
      if (phase === 'kime') return true;
      return frame + 1 >= windowStart();
    },
    dropBuffer(): void {
      buffered = false;
    },
    inWindow(): boolean {
      return phase === 'kime' || (phase !== 'idle' && frame >= windowStart());
    },
    motion(): { speedMul: number; jumpLocked: boolean } {
      return phase === 'idle' ? { speedMul: 1, jumpLocked: false } : { speedMul: 0, jumpLocked: true };
    },
    startedNow(): boolean {
      return started;
    },
    cancel(tick: number): void {
      if (phase !== 'idle') end(tick);
      buffered = false;
    },
  };
}
