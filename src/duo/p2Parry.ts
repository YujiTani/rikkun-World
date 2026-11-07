import type { ArmorSlot, ItemId } from '../contracts';
import { createParry, type Parry, type ParryEvent, type ParryHit, type ParryInput, type ParryStateView } from '../combat/parry';
import { SAMURAI_GEAR } from '../craft/config';
import type { YokaiParryPort, YokaiParryVerdict } from '../yokai/ai/managerTypes';

/**
 * COOP-1 4d-1（docs/design/COOP-1.md 1.13 §3.6 (a)・§8・§9.10、AC99・AC102）: 2P の パリィ。three・DOM を 使わない。テストは p2Parry.test.ts。
 * 部品は 1P と 同じ `createParry`（src/combat/parry.ts）で、式は コピーしない。数（コマ・ゆっくり・半分）は 調整表 w2（`createW2Settings()`）が 1 か所。
 * 2P の 入力・そうび・向きだけを 2P の もの に する。1 人の ときの 遊びは かわらない（1P の `createParry` と 配線には さわらない）。
 */

export interface P2ParryDeps {
  /** 1P と 同じ 調整表（createParry に そのまま わたす） */
  settings: Parameters<typeof createParry>[0];
  /** 「動きを へらす」（せっていは この 機械に 1 つ。1P と 同じ 物を わたす） */
  reducedMotion?: () => boolean;
  /** 2P の そうび（陣笠の 判定。1P の そうびは 見ない） */
  armor: { equipped(slot: ArmorSlot): ItemId | null };
  /** 2P の 向き（判定の 向き。読むたびに いまの 値） */
  yawDeg: () => number;
  /** はじめの 成功の 1 回だけ（2P の 位置・向きで 火花を 出す 合図） */
  onSpark?: () => void;
}

export interface P2Parry {
  /** 中の `createParry` 1 つ。2P の DigSystemImpl の `m4.parry` に わたす（Shift＋ZR の ふりわけは 1P と 同じ 道） */
  readonly parry: Parry;
  /** 入力。1P の step.ts と 同じ: 陣笠を 入れてから `parry.update`。妖怪の 更新より 前に 1 ステップ 1 回 */
  update(input: ParryInput): void;
  /** 妖怪の 攻撃・火の玉が 2P に 当たる 直前に 聞く（判定の 向きは 2P の 向き） */
  hit(h: Omit<ParryHit, 'yawDeg'>): YokaiParryVerdict;
  /** 1 ステップ 1 回の 読み（update・cancel の あと 最初の 呼びで 作り、同じ ステップ中は 同じ 物を 返す。受けとった 側は 書きかえない） */
  state(): ParryStateView;
  /** パリィの あいだの 歩く倍率・ジャンプ止め（1P の step.ts と 同じ 決まり: 始めた ステップは まだ 走れる）。返す 物は 使いまわす */
  motion(): { speedMul: number; jumpLocked: boolean };
  /** パリィの 全部を 取り消す（倒れた・参加が おわる） */
  cancel(tick: number): void;
  /** 妖怪がわの よろけ・2 倍・はね返しの 出来事を この 人の 出来事の 列へ */
  note(e: Omit<ParryEvent, 'tick'>): void;
}

export function createP2Parry(d: P2ParryDeps): P2Parry {
  const parry = createParry(d.settings, d.reducedMotion ? { reducedMotion: d.reducedMotion } : {});
  /** 毎回 同じ 入れものに 書く（妖怪の 当たりの たびに 新しい 物を 作らない） */
  const hitIn: ParryHit = { dirDeg: null, yawDeg: 0, by: 'attack', yokaiId: null, amount: 0 };
  const motionOut = { speedMul: 1, jumpLocked: false };
  /** 1 ステップに 何回 読まれても `parry.state()` は 1 回（update・cancel で 作りなおす。毎回 新しい 物を 作らない） */
  let stateNow: ParryStateView | null = null;
  return {
    parry,
    update(input) {
      input.jingasa = d.armor.equipped('head') === SAMURAI_GEAR.head; // SAMURAI-1: 始めた ステップの 値が その パリィの 間 つかわれる
      parry.update(input);
      stateNow = null;
    },
    hit(h) {
      hitIn.dirDeg = h.dirDeg;
      hitIn.yawDeg = d.yawDeg();
      hitIn.by = h.by;
      hitIn.yokaiId = h.yokaiId;
      hitIn.amount = h.amount;
      const r = parry.hit(hitIn);
      if (r.first) d.onSpark?.();
      return { result: r.result, amount: r.amount };
    },
    state: () => (stateNow ??= parry.state()),
    motion() {
      const m = parry.motion();
      motionOut.speedMul = parry.startedNow() ? 1 : m.speedMul;
      motionOut.jumpLocked = m.jumpLocked;
      return motionOut;
    },
    cancel(tick) {
      parry.cancel(tick);
      stateNow = null;
    },
    note: (e) => parry.note(e),
  };
}

/** 妖怪の パリィの 口: ねらっている 人の パリィに 聞く。その人が いなければ 受けない（none・元の 数） */
export function createParryPort(side: (who: 1 | 2) => { hit(h: Omit<ParryHit, 'yawDeg'>): YokaiParryVerdict } | null): YokaiParryPort {
  return {
    hit(h, who) {
      const s = side(who);
      return s ? s.hit(h) : { result: 'none', amount: h.amount };
    },
  };
}

type ParryNote = { type: 'stagger' | 'staggerDouble' | 'reflectHit'; yokaiId: number; by?: ParryEvent['by']; damage?: number };

/** 妖怪の `onParryEvent(e, who)` の 行き先: ねらわれた 人の パリィの 出来事の 列に だけ 入れる（1P の 列に 2P の ひるみを まぜない） */
export function createParryEventSink(side: (who: 1 | 2) => { note(e: Omit<ParryEvent, 'tick'>): void } | null): (e: ParryNote, who: 1 | 2) => void {
  return (e, who) => {
    side(who)?.note({ type: e.type, yokaiId: e.yokaiId, ...(e.by ? { by: e.by } : {}), ...(e.damage !== undefined ? { damage: e.damage } : {}) });
  };
}
