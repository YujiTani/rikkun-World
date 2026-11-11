import type { ItemId, Vec3 } from '../contracts';
import { GADGET_TUNING, jumpHeightWith } from '../content/items/gadgetTuning';
import type { SeatSystem } from '../house/seat';
import type { ActionState } from '../input/actions';
import { KiteSystem } from '../player/kite';
import { NOT_NIGHT_TEXT, type SleepSystem, type SleepUse, type SleepWho } from '../time/sleep';
import type { DuoVec3 } from './types';

/**
 * COOP-1 5e（docs/design/COOP-1.md 1.16 §3.7 (f)・§9.12・AC143・AC145・AC169〜AC173）: 小物（たこ・わらじ・ふとん・すわる）の 1P・2P 共通の 部品。
 * 2P の たこ・わらじ・ふとんは 1P と 同じ 部品（`KiteSystem`・`jumpHeightWith`・`SleepSystem`）を 2P の 体・2P の もちもので 使う。1P の `wireGadgets` も ここを 通る（式の コピーを しない）。
 * テストは p2Gadgets.test.ts。DOM・three は 使わない（たこの 絵は `view` の 口で うけとる）。
 */

/** たこ・わらじが 見る 体（1P の PlayerController も 2P の ctl2 も この 形） */
export interface P2GadgetsBody {
  state: { position: Vec3; yawDeg: number };
  settings: { jumpHeight: number };
  setJumpHeight(h: number | null): void;
}

export interface P2GadgetsDeps {
  body: P2GadgetsBody;
  /** 手に 持つ 物（なければ null） */
  held(): ItemId | null;
  /** あしの そうび（なければ null） */
  legs(): ItemId | null;
  /** ゆれの 時間（game.tick） */
  tick(): number;
  /** たこの 絵（KiteView と 同じ 形。なければ 描かない） */
  view?: { update(pos: Vec3 | null, player: Vec3, tick: number): void };
}

export interface KiteInfo {
  up: boolean;
  position: DuoVec3 | null;
}

export interface P2Gadgets {
  kite: KiteSystem;
  /** ZL（m4.gadgets.kite）: 上がって いなければ あげ、上がって いれば おろす */
  useKite(): 'up' | 'down';
  /** 毎ステップ: たこ（持ちかえで おりる・ついてくる）・たこの 絵・わらじの ジャンプ */
  step(): void;
  info(): KiteInfo;
  /** 2P が やめた とき: たこを おろす（絵も かくす） */
  clear(): void;
}

/** 1P も 2P も 同じ たこ・わらじの まとめ（2P は 参加する たびに 1 つ） */
export function createP2Gadgets(d: P2GadgetsDeps): P2Gadgets {
  const kite = new KiteSystem();
  const { body } = d;
  return {
    kite,
    useKite: () => kite.toggle(body.state.position, body.state.yawDeg),
    step() {
      kite.onHeld(d.held());
      kite.update(body.state.position);
      d.view?.update(kite.position(), body.state.position, d.tick());
      // わらじ: はいている 間だけ ジャンプが 高い。LEGEND-4: 黒龍を 持つ 間も（重なったら 高い ほう）
      body.setJumpHeight(jumpHeightWith(d.legs(), body.settings.jumpHeight, d.held()));
    },
    info: () => kiteInfo(kite) as KiteInfo,
    clear() {
      kite.onHeld(null);
      d.view?.update(null, body.state.position, d.tick());
    },
  };
}

/** `duo.kite(who)` の 中身。kite が null（2P が いない）なら null。position は コピー */
export function kiteInfo(kite: Pick<KiteSystem, 'up' | 'position'> | null): KiteInfo | null {
  if (!kite) return null;
  const p = kite.position();
  return { up: kite.up(), position: p ? { x: p.x, y: p.y, z: p.z } : null };
}

/** `duo.seat(who)` の 中身。すわって いなければ（seat が null でも）null。block は コピー・position は 出さない */
export function seatInfo(seat: Pick<SeatSystem, 'seat'> | null): { kind: 'sit' | 'bath'; block: DuoVec3 } | null {
  const s = seat?.seat();
  return s ? { kind: s.kind, block: { x: s.block.x, y: s.block.y, z: s.block.z } } : null;
}

// ---------------------------------------------------------------- ふとん

export interface SleepPortDeps {
  sleep: Pick<SleepSystem, 'use'>;
  /** 使った 人の 半分に 文を 出す（1P は #sleep-notice、2P は duo-gadget-note-p2） */
  showNote(who: SleepWho, text: string): void;
}

/**
 * ふとんを 使う 窓口（`gadgets.port.sleep(who)`。1P も 2P も 同じ 1 つの SleepSystem）。返り値は `sleep.use(who)` の 結果。
 * 'notNight' の ときだけ 使った 人の 半分に「よる に ねようね」。ねる 音は SleepSystem の onStart（窓口は 鳴らさない）
 */
export function createSleepPort(d: SleepPortDeps): (who: SleepWho) => SleepUse {
  return (who) => {
    const r = d.sleep.use(who);
    if (r === 'notNight') d.showNote(who, NOT_NIGHT_TEXT);
    return r;
  };
}

/** ねむり中だけ lock.playInputEnabled() を false に する（元の 判定は のこす。待ち中は 止めない）。1P の lock と 2P の lock2 の 両方に かける */
export function blockInputWhileSleeping(lock: { playInputEnabled(): boolean }, sleep: { blocksInput(): boolean }): void {
  const orig = lock.playInputEnabled.bind(lock);
  lock.playInputEnabled = () => orig() && !sleep.blocksInput();
}

/** 待ちを 起こす 入力（SeatSystem の 立つ もとと 同じ。歩く 4 方向・ジャンプ。ZL・見回し では 起きない） */
const WAKE_ACTIONS = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump'] as const;

export interface WaitWakeDeps {
  who: SleepWho;
  sleep: Pick<SleepSystem, 'waiting' | 'wake'>;
  actions: Pick<ActionState, 'isHeld' | 'wasPressed'>;
  combat: { flinching(): boolean; dead?(): boolean };
  /** もちもの画面を 開いて いる 間 true（その 間は 歩く・ジャンプの 入力を 見ない。画面を 開いたまま 待てる）。省くと いつも false */
  paused?: () => boolean;
}

/**
 * その 人の 「待ちを 起こす 入力」を 見る（毎ステップ 1 回、`sleep.update` の 前。1P も 2P も 同じ 部品）。
 * who が 待って いる あいだだけ 働く。歩く・ジャンプを 押す／ひるむ／倒れる で `sleep.wake(who)`。
 * 待ちに 入った とき すでに 押しっぱなしだった ボタンは いったん はなす まで 起こさない（SeatSystem と 同じ 決まり）。
 * やめる・パッドが ぬける は 配線が 直接 `sleep.wake(2)` を 呼ぶ
 */
export function createWaitWake(d: WaitWakeDeps): { step(): void } {
  /** 待ちに 入った とき 押されて いた キー（はなす まで 起こす もとに しない）。WAKE_ACTIONS の 並びの ビット */
  let held = 0;
  let waiting = false;
  return {
    step() {
      if (d.sleep.waiting() !== d.who) {
        waiting = false;
        return;
      }
      if (d.combat.flinching() || d.combat.dead?.() === true) {
        waiting = false;
        d.sleep.wake(d.who);
        return;
      }
      if (!waiting) {
        // 待ちに 入った ステップ: 押されて いる キーを おぼえる だけ
        waiting = true;
        held = 0;
        for (let i = 0; i < WAKE_ACTIONS.length; i++) if (d.actions.isHeld(WAKE_ACTIONS[i]!)) held |= 1 << i;
        return;
      }
      if (d.paused?.() === true) {
        // もちもの画面を 開いて いる 間は 起こさない。押されて いる キーは おぼえて、とじた あと はなす まで 起こさない
        held = 0;
        for (let i = 0; i < WAKE_ACTIONS.length; i++) if (d.actions.isHeld(WAKE_ACTIONS[i]!)) held |= 1 << i;
        return;
      }
      for (let i = 0; i < WAKE_ACTIONS.length; i++) {
        const a = WAKE_ACTIONS[i]!;
        const bit = 1 << i;
        if (!d.actions.isHeld(a)) held &= ~bit; // はなしたら その キーは また 起こす もとに なる
        if (d.actions.wasPressed(a) || (d.actions.isHeld(a) && (held & bit) === 0)) {
          waiting = false;
          d.sleep.wake(d.who);
          return;
        }
      }
    },
  };
}

export interface SleepNoticeIn {
  waiting: SleepWho | null;
  /** 「2 人」に 数えられる 人の 数 */
  ready: number;
  /** ゆうがた・よる */
  night: boolean;
  sleeping: boolean;
}

export interface SleepNotice {
  /** 「おともだちが いっしょに ねたがっているよ」を 出す 人（半分の 持ち主） */
  ask: SleepWho[];
  /** 待ち中の うすい 暗さ（待って いる 人の 半分） */
  dim: Array<{ who: SleepWho; value: number }>;
}

/**
 * ふとんの お知らせの 中身。待って いる 人が いて ねむり中でない とき、待って いる 人の 半分に うすい 暗さ。
 * 札は それに 加えて 「2 人」が 2 以上・ゆうがた／よる の とき だけ、待って いない 方の 人 1 人
 */
export function sleepNotice(s: SleepNoticeIn): SleepNotice {
  const out: SleepNotice = { ask: [], dim: [] };
  if (s.waiting === null || s.sleeping) return out;
  out.dim.push({ who: s.waiting, value: GADGET_TUNING.futon.sleepWaitDim });
  if (s.ready >= 2 && s.night) out.ask.push(s.waiting === 1 ? 2 : 1);
  return out;
}

export interface SleepInfoDeps {
  sleep: Pick<SleepSystem, 'waiting' | 'sleeping' | 'stepsLeft'>;
  ready(): number;
  night(): boolean;
}

export interface SleepInfo extends SleepNotice {
  ready: number;
  waiting: SleepWho | null;
  sleeping: boolean;
  stepsLeft: number;
}

/** `duo.sleep()` の 中身（ふとんの ようす。見るだけ） */
export function sleepInfo(d: SleepInfoDeps): SleepInfo {
  const waiting = d.sleep.waiting();
  const sleeping = d.sleep.sleeping();
  const ready = d.ready();
  return { ready, waiting, sleeping, stepsLeft: d.sleep.stepsLeft(), ...sleepNotice({ waiting, ready, night: d.night(), sleeping }) };
}
