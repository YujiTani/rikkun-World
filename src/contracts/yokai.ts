/**
 * 妖怪・戦いの型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { YokaiKind as YokaiKindFromIds } from '../content/yokai/ids';
import type { DamageKind } from './items';
import type { Vec3 } from './world';

// 妖怪の種類は content/yokai/ids.ts の 1 か所（#307）。ここは 別名
export type YokaiKind = YokaiKindFromIds;

export type YokaiState =
  | 'appear'
  | 'idle'
  | 'wander'
  | 'chase'
  | 'retreat'
  | 'attack'
  | 'search'
  | 'dying'
  | 'leaving';

export interface YokaiInfo {
  id: number;
  kind: YokaiKind;
  /** 足もとの中央 */
  position: Vec3;
  yawDeg: number;
  hp: number;
  maxHp: number;
  state: YokaiState;
  /** 攻撃の何ステップ目か（攻撃していなければ 0） */
  attackTick: number;
  scale: number;
  /** 表示名（モデルの displayName。例 からかさおばけ） */
  name: string;
  /** 二つ名（BALANCE §2.5） */
  title: YokaiTitle;
  /** 出たときの場所の倍率 M（BALANCE §2.3） */
  m: number;
  /** 1 回の攻撃力（体力。1 = ハート半分） */
  attack: number;
}

/** 二つ名（弱い順 おやぶん → たいしょう → ヌシ。BALANCE §2.5） */
export type YokaiTitle = 'none' | 'oyabun' | 'taisho' | 'nushi';

/** LIVE-4: 妖怪 の 体力 を へらした もの（りっくん〈ぶき・や・わざ〉か、いっしょ に たたかう マッチョ か） */
export type YokaiHurtBy = 'player' | 'macho' | 'kodachi';

export type YokaiEvent =
  | { type: 'spawn'; tick: number; id: number; kind: YokaiKind; position: Vec3 }
  | { type: 'attackStart'; tick: number; id: number; kind: YokaiKind }
  | { type: 'attackHit'; tick: number; id: number; kind: YokaiKind; hitPlayer: boolean; position: Vec3 }
  | { type: 'fireball'; tick: number; id: number; position: Vec3 }
  | { type: 'fireballEnd'; tick: number; position: Vec3; hitPlayer: boolean }
  /** LIVE-4: `by` = 体力 を へらした の は だれ か（落下 など は 省略） */
  | { type: 'hurt'; tick: number; id: number; kind: YokaiKind; position: Vec3; by?: YokaiHurtBy }
  | { type: 'defeat'; tick: number; id: number; kind: YokaiKind; position: Vec3; reward: number; title: YokaiTitle }
  /** 二つ名の妖怪が出た（1 体に 1 回。音を鳴らす合図） */
  | { type: 'titleSound'; tick: number; id: number; kind: YokaiKind; title: Exclude<YokaiTitle, 'none'> }
  | { type: 'leave'; tick: number; id: number; kind: YokaiKind; position: Vec3 };

export interface YokaiRayHit {
  id: number;
  kind: YokaiKind;
  /** 線の始まりから当たりの箱の面まで */
  distance: number;
}

/** 妖怪たち。担当 B が `src/yokai/`（モデルは既存）と `src/yokai/ai/` で実装する */
export interface YokaiWorld {
  list(): YokaiInfo[];
  /** 線に当たるいちばん近い妖怪（パンチ用）。maxDistance より遠ければ null */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): YokaiRayHit | null;
  /**
   * パンチが当たった。from はたたいた人の足もと（押される向き）。
   * WEAPON-2: `knock` を 省くと 今まで どおり（水平 1.0・上へ 0）。ぬりかべは どの 値でも 押されない
   */
  /** 実際に 与えた ダメージを 返してもよい（よろけの 2 倍の あと。WEAPON-5） */
  damage(id: number, amount: number, from: Vec3, knock?: YokaiKnock, by?: YokaiHurtBy): number | void;
  /** そのマスに妖怪の当たりの箱が重なっているか（ブロックを置けない） */
  occupies(x: number, y: number, z: number): boolean;
  /** WEAPON-9: (x, z) の ほうへ 水平に dist だけ すいよせる（ふだんの 当たり判定の 中で。上下は かえない） */
  pull?(id: number, x: number, z: number, dist: number): void;
  /** 画面と音用（呼ぶと空になる）。テストの窓口用の列は別に持つ */
  drainEvents(): YokaiEvent[];
}

export type CombatEvent =
  | { type: 'punchStart'; tick: number; /** WEAPON-3: パンチの向き u と えらんだ 妖怪 */ dirDeg?: number; targetId?: number | null }
  | { type: 'punchHit'; tick: number; yokaiId: number }
  | { type: 'punchMiss'; tick: number }
  /** NINJA-1: 忍びの手甲の 追い打ち（小太刀）が 妖怪に 当たった（音・絵・テスト用） */
  | { type: 'kodachiHit'; tick: number; yokaiId: number; damage: number }
  | { type: 'playerHit'; tick: number; by: YokaiKind; amount: number; /** 防具でカットした（カキン） */ blocked?: boolean }
  | { type: 'fallHurt'; tick: number; amount: number }
  | { type: 'regen'; tick: number; hp: number }
  | { type: 'death'; tick: number; dropped: number[] }
  | { type: 'respawn'; tick: number }
  | { type: 'pickup'; tick: number; bagId: number };

/** プレイヤーの体力と戦い。担当 C が `src/combat/` で実装する */
export interface PlayerCombat {
  hp(): number;
  maxHp(): number;
  dead(): boolean;
  /** むてきのこりステップ */
  invincibleTicks(): number;
  /** 妖怪の攻撃が当たった。むてきなどで受けなかったら false */
  damage(amount: number, by: YokaiKind, from: Vec3, kind?: DamageKind): boolean;
  /** M7: 体力を もどす（ハート半分 = 1）。最大をこえない。やられている間は 0。実際に もどった量を返す */
  heal(amount: number): number;
  /** 画面と音用（呼ぶと空になる）。テストの窓口用の列は別に持つ */
  drainEvents(): CombatEvent[];
}

// ================================================================ WEAPON-2（弓の山なり・刀の構えと技・道具の たいきゅう）
// 担当の割り振り: docs/tickets/WEAPON-2-dev-split.md。仕様: docs/design/WEAPON-2.md（第 5 版）

// ---------------------------------------------------------------- 妖怪（E）

/** 押す 距離（水平。P から 妖怪への 向き）と 上への 初速（ブロック/秒）。`YokaiWorld.damage` の 4 つ目 */
export interface YokaiKnock {
  /** 水平に 押す 距離（今の 値は 1.0。10 ステップ かけて 押す） */
  dist: number;
  /** 上への 初速（ブロック/秒。0 = 上げない） */
  up: number;
  /** WEAPON-9: 押す ステップ数（省くと 10）。長い ときは はじめ 速く・おわり ゆっくり */
  ticks?: number;
  /** WEAPON-9: true なら ぬりかべも 押す（虹の はじき） */
  heavy?: boolean;
}
