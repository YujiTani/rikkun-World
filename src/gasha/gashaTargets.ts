/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)）: がしゃどくろ・少女の 部品が 受ける「プレイヤー」を 人の 一覧に する ための、描画も ゲームも いらない 小さな 共通部品。
 * 1P と 2P で 同じ 部品を 使う（式の コピーを 作らない）。1 人の とき（targets を わたさない 従来の 形）は 今の deps.player ほかから 1P 1 つを 作る（AC113）。
 */
import type { Camera } from 'three';
import type { HitSources } from './gashaBigHit';

type V3 = { x: number; y: number; z: number };

/** 人の 一覧の 1 つ（仕様 §8 の deps.targets(): readonly GashaTarget[]）。位置・向きは 読む たびに 今の 値 */
export interface GashaTarget {
  readonly who: 1 | 2;
  /** 足もと */
  readonly pos: V3;
  /** 向き（度） */
  readonly yawDeg: number;
  /** 倒れて いる（ねらいから のぞく） */
  readonly down: boolean;
  /** ダメージ（入ったら true） */
  hurt?(amount: number, from: V3): boolean;
  /** のっている 人を 動かす（位置の ずれ、向き〈度〉の ずれ） */
  carry?(dx: number, dy: number, dz: number, dYawDeg: number): void;
  /** 水平に すこし 寄せる（ブロック） */
  nudge?(dx: number, dz: number): void;
  setVelocity?(v: V3): void;
  body?(): { position: V3; velocity: V3; onGround?: boolean };
  /** 落下ダメージを 受けない */
  setNoFall?(on: boolean): void;
  /** その人の 入力だけ 止める（fn() が true の 間） */
  blockInput?(fn: () => boolean): void;
  /** 羽織の 「とばされにくさ」の 倍率 */
  knockbackMul?(): number;
  /** 止め・ゆれ（その人の 半分だけ。4d-0 の duoCamFx に つなぐ。口が なければ 何も しない） */
  hitStop?(ticks: number): void;
  shake?(amount: number): void;
  /** 画面の ゆれを 少なくとも level（0〜1）に する（毎フレーム 呼ぶ 型の ゆれ。たまり続けない）。口が なければ 何もしない */
  shakeTo?(level: number): void;
  /** 少女の こうげきを うける（4d-1 の あと つなぐ。今の GashaGirlDeps.parry と 同じ 形） */
  parry?(h: { dirDeg: number | null; by: 'attack' | 'fireball'; amount: number }): { result: 'success' | 'early' | 'fail' | 'none'; amount: number };
  /** 少女が 見る ハート */
  hearts?(): { hp: number; maxHp: number };
  /** その人の 半分の カメラ（板の 絵の 向き） */
  camera?: Camera;
  /** その人の こうげきの 当たりの 形 */
  hit?: HitSources;
  defIgnore?(): number;
  onStrike?(info: { part: string; source: string }): void;
}

/** 1 人用の 従来の 口（GashaBigDeps・GashaGirlDeps の どちらも この 形を みたす） */
export interface TargetSource {
  targets?(): readonly GashaTarget[];
  player(): { x: number; y: number; z: number; yawDeg: number };
  hurt?(amount: number, from: V3): boolean;
  carryPlayer?(dx: number, dy: number, dz: number, dYawDeg: number): void;
  nudgePlayer?(dx: number, dz: number): void;
  setPlayerVelocity?(v: V3): void;
  playerBody?(): { position: V3; velocity: V3; onGround?: boolean };
  setNoFall?(on: boolean): void;
  blockPlayerInput?(fn: () => boolean): void;
  knockbackMul?(): number;
  hitStop?(ticks: number): void;
  shake?(amount: number): void;
  parry?(h: { dirDeg: number | null; by: 'attack' | 'fireball'; amount: number }): { result: 'success' | 'early' | 'fail' | 'none'; amount: number };
  hp?(): number;
  maxHp?(): number;
  camera?: Camera;
  hit?: HitSources;
  defIgnore?(): number;
  onStrike?(info: { part: string; source: string }): void;
}

const dist3 = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** 近い 方（3 次元の 直線）。倒れて いる 人は のぞく。同じ きょりなら 1P。いなければ null */
export function pickTarget(targets: readonly GashaTarget[], from: V3): GashaTarget | null {
  let best: GashaTarget | null = null, bd = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (t.down) continue;
    const d = dist3(t.pos, from);
    if (best === null || d < bd || (d === bd && t.who < best.who)) { best = t; bd = d; }
  }
  return best;
}

/** わざを 始める ステップで 決め、とちゅうで かえない ねらい */
export interface AimLock {
  /** 今 決める（毎回 決め直す。わざの はじめに 1 回 呼ぶ）。だれも ねらえなければ null */
  start(targets: readonly GashaTarget[], from: V3): GashaTarget | null;
  /** 決めた 人（なければ null） */
  who(): 1 | 2 | null;
  /** 決めた 時の 場所（動いても かわらない）。なければ null */
  spot(): V3 | null;
  /** 決めた 人の 今（倒れて いても 返す。一覧から 消えて いたら null。でも who と spot は のこる） */
  live(targets: readonly GashaTarget[]): GashaTarget | null;
  /** なにも ねらわない */
  clear(): void;
}

export function createAimLock(): AimLock {
  let who: 1 | 2 | null = null;
  const spot: V3 = { x: 0, y: 0, z: 0 };
  return {
    start(targets, from) {
      const t = pickTarget(targets, from);
      if (!t) { who = null; return null; }
      who = t.who;
      const p = t.pos;
      spot.x = p.x; spot.y = p.y; spot.z = p.z;
      return t;
    },
    who: () => who,
    spot: () => (who === null ? null : spot),
    live(targets) {
      if (who === null) return null;
      for (let i = 0; i < targets.length; i++) if (targets[i]!.who === who) return targets[i]!;
      return null;
    },
    clear() { who = null; },
  };
}

/** 従来の 口から 作った 1P 1 つ（deps ごとに 1 つを 使いまわす。位置は 読む たびに 今の 値） */
const legacyCache = new WeakMap<object, readonly GashaTarget[]>();

function legacyTargets(d: TargetSource): readonly GashaTarget[] {
  const scratch: V3 = { x: 0, y: 0, z: 0 };
  const t: GashaTarget = {
    who: 1,
    down: false,
    get pos() { const p = d.player(); scratch.x = p.x; scratch.y = p.y; scratch.z = p.z; return scratch; },
    get yawDeg() { return d.player().yawDeg; },
  };
  // 無い 口は 無いまま（あれば 今の 口へ そのまま わたす）
  if (d.hurt) t.hurt = (a, f) => d.hurt!(a, f);
  if (d.carryPlayer) t.carry = (dx, dy, dz, dyaw) => d.carryPlayer!(dx, dy, dz, dyaw);
  if (d.nudgePlayer) t.nudge = (dx, dz) => d.nudgePlayer!(dx, dz);
  if (d.setPlayerVelocity) t.setVelocity = (v) => d.setPlayerVelocity!(v);
  if (d.playerBody) t.body = () => d.playerBody!();
  if (d.setNoFall) t.setNoFall = (on) => d.setNoFall!(on);
  if (d.blockPlayerInput) t.blockInput = (fn) => d.blockPlayerInput!(fn);
  if (d.knockbackMul) t.knockbackMul = () => d.knockbackMul!();
  if (d.hitStop) t.hitStop = (n) => d.hitStop!(n);
  if (d.shake) t.shake = (a) => d.shake!(a);
  if (d.parry) t.parry = (h) => d.parry!(h);
  if (d.hp && d.maxHp) t.hearts = () => ({ hp: d.hp!(), maxHp: d.maxHp!() });
  if (d.camera) t.camera = d.camera;
  if (d.hit) t.hit = d.hit;
  if (d.defIgnore) t.defIgnore = () => d.defIgnore!();
  if (d.onStrike) t.onStrike = (i) => d.onStrike!(i);
  return [t];
}

/** 人の 一覧。deps.targets が あれば それ（毎回 呼ぶ）。なければ 今の 口から 1P 1 つ（1 人の ときは 今の まま） */
export function targetsOf(d: TargetSource): readonly GashaTarget[] {
  if (d.targets) return d.targets();
  let l = legacyCache.get(d);
  if (!l) { l = legacyTargets(d); legacyCache.set(d, l); }
  return l;
}

/** ねらった 人の パリィに 聞く。パリィを もたない（2P は 4d-1 の まえ）・だれも ねらわない ときは none（そのままの ダメージ） */
export function askAimedParry(aim: GashaTarget | null, h: { dirDeg: number | null; by: 'attack' | 'fireball'; amount: number }): { result: 'success' | 'early' | 'fail' | 'none'; amount: number } {
  if (!aim?.parry) return { result: 'none', amount: h.amount };
  return aim.parry(h);
}

/** ねらった 人の ハート（口が なければ fallback） */
export function aimedHearts(aim: GashaTarget | null, fallback: () => { hp: number; maxHp: number }): { hp: number; maxHp: number } {
  return aim?.hearts?.() ?? fallback();
}

/** 板の 絵が 向く カメラ（ねらっている 人の 半分の カメラ。なければ fallback） */
export function facingCamera(aim: GashaTarget | null, fallback: Camera): Camera {
  return aim?.camera ?? fallback;
}
