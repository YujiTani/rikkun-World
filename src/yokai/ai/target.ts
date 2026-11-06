import type { DamageKind, PlayerCombat, Vec3, YokaiKind } from '../../contracts';
import type { Ent, YokaiField } from './entity';

/** 仲間（2P）の 窓口（YokaiManagerOptions.partner と 同じ形） */
export interface YokaiPartner {
  position: Vec3;
  /** false（倒れている・パッドが ぬけている）の 2P は ねらわない・数えない */
  targetable: boolean;
  /** 妖怪の 攻撃が 当たった。むてきなどで 受けなかったら false */
  hurt(amount: number, kind: YokaiKind, from: Vec3): boolean;
}

/** プレイヤー 1 人ぶんの 足もと */
export interface PlayerPos {
  x: number;
  y: number;
  z: number;
}

/** 2P の 足もと（on = ねらえる 2P が いる） */
export interface PartnerPos extends PlayerPos {
  on: boolean;
}

/** 毎ステップの はじめに 1P・2P の 足もとを 書く（毎回 新しい 物は 作らない） */
export function writePlayers(f: YokaiField, p1: Vec3, p2: YokaiPartner | null): void {
  f.p1.x = p1.x;
  f.p1.y = p1.y;
  f.p1.z = p1.z;
  const on = p2 !== null && p2.targetable;
  f.p2.on = on;
  if (p2 !== null) {
    f.p2.x = p2.position.x;
    f.p2.y = p2.position.y;
    f.p2.z = p2.position.z;
  }
}

/** f.px/py/pz（いま 見ている ねらい相手の 足もと）を who の 人に する */
export function aim(f: YokaiField, who: 1 | 2): void {
  // 2P を ねらって いる とちゅうで 2P が 倒れた・ぬけた とき: 1P の 箱で 当たりを 見ない
  // (who=2 の まま、いちばん 最後の 2P の 足もとを 使う。currentTarget が dead=true を かえて 当てずに 終わる)
  const p = who === 2 ? f.p2 : f.p1;
  f.who = who;
  f.px = p.x;
  f.py = p.y;
  f.pz = p.z;
}

/** 妖怪 e の ねらい相手に する */
export function aimAt(f: YokaiField, e: Ent): void {
  aim(f, e.target);
}

const dist3 = (p: PlayerPos, e: Ent): number => Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);

/** ねらう 相手: ねらえる 人のうち 近い方（3 次元。同じなら 1P）。ねらえる 人が いなければ 1P */
export function pickTarget(f: YokaiField, p1Alive: boolean, e: Ent): 1 | 2 {
  if (!f.p2.on) return 1;
  if (!p1Alive) return 2;
  return dist3(f.p2, e) < dist3(f.p1, e) ? 2 : 1;
}

/** いちばん 近い プレイヤー（ねらえる 2P だけ 数える。同じなら 1P） */
export function nearestWho(f: YokaiField, x: number, y: number, z: number): 1 | 2 {
  if (!f.p2.on) return 1;
  const d1 = Math.hypot(f.p1.x - x, f.p1.y - y, f.p1.z - z);
  const d2 = Math.hypot(f.p2.x - x, f.p2.y - y, f.p2.z - z);
  return d2 < d1 ? 2 : 1;
}

/**
 * いま f が ねらっている 人（f.who）に ダメージを とどける 窓口。chase・contact・swim・fireballs には これを `combat` として わたす。
 * 1P は PlayerCombat、2P は partner.hurt。
 */
export function currentTarget(f: YokaiField, p1: Pick<PlayerCombat, 'damage' | 'dead'>, partner: () => YokaiPartner | null | undefined): Pick<PlayerCombat, 'damage' | 'dead'> {
  return {
    dead: () => (f.who === 2 ? !f.p2.on : p1.dead()),
    damage: (amount: number, by: YokaiKind, from: Vec3, kind?: DamageKind) => (f.who === 2 ? (partner()?.hurt(amount, by, from) ?? false) : p1.damage(amount, by, from, kind)),
  };
}
