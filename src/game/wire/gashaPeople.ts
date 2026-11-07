// COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)・§8）: がしゃどくろ・少女が 見る「人の 一覧」（GashaTarget）を ゲームの 1P・2P から 作る つなぎ。
// 1P は 今の 口（deps）から（gashaTargets.ts の targetsOf）。2P は 参加している あいだだけ（wireDuoPlay が 口を 出す）。
// 一覧は 毎回 同じ 配列を 使いまわす（毎フレーム 新しい 物を 作らない）。
import type { ArmorSlot, BladeSystem, ItemId, Vec3 } from '../../contracts';
import type { Camera } from 'three';
import type { PlayerController } from '../../player/PlayerController';
import type { P2Life } from '../../duo/p2Life';
import { knockbackMulOf, tekkoDefIgnoreOf } from '../../craft/samuraiPower';
import type { HitSources } from '../../gasha/gashaBigHit';
import type { GashaTarget } from '../../gasha/gashaTargets';

/** 2P の がしゃどくろへの 口（参加している あいだだけ。wireDuoPlay が 作る。参加ごとに 1 つ） */
export interface P2GashaPort {
  ctl: PlayerController;
  life: P2Life;
  armor: { equipped(slot: ArmorSlot): ItemId | null };
  /** 2P の 刀（当たりの 形・わざ） */
  blade: Pick<BladeSystem, 'shape' | 'state'>;
  held(): { item: ItemId; power?: number | null } | null;
  weaponDamage(item: ItemId): number;
  /** 落下ダメージを 受けない（間欠泉） */
  setNoFall(on: boolean): void;
  /** その人の 入力だけ 止める（fn() が true の 間） */
  blockInput(fn: () => boolean): void;
  /** 刀・パンチが がしゃどくろの 部位に 当たった（忍びの手甲の 追い打ち） */
  onBigHit(part: string): void;
  /** COOP-1 4d-2: 2P の わざ（雷・ドームの 当たり。AC110）。出来事の 窓口と ドームの 球だけ */
  legend?: { peekEvents(): readonly { type: string; tick: number }[]; dome(): { x: number; y: number; z: number; r: number } | null };
  /** COOP-1 4d-2: 2P の 飛んで いる 波（真空波・らせん。半径・ダメージは 波が もっている 数） */
  waves?: () => readonly { id: number; position: Vec3 }[];
  /** COOP-1 4d-1 のあと: 少女の 弾を 2P の パリィで うける（判定は 1P と 同じ 部品〈P2Parry.hit〉・2P の 向き） */
  parry?: (h: { dirDeg: number | null; by: 'attack' | 'fireball'; amount: number }) => { result: 'success' | 'early' | 'fail' | 'none'; amount: number };
  /** 2P の 半分の カメラ（いつも 同じ 1 つ。板の 絵・少女の 目が 向く 先） */
  camera: Camera;
  /** その人の カメラだけ 止める・ゆらす（4d-0 の duoCamFx。2 人の とき 世界は 止めない） */
  hitStop(ticks: number): void;
  shake(amount: number): void;
  /** 画面の ゆれを 少なくとも level（0〜1）に する（毎フレーム 呼ぶ） */
  shakeTo(level: number): void;
}

const wrapDeg = (d: number): number => ((d % 360) + 360) % 360;

/** 1P の 口（targetsOf で 作った もの）に「倒れて いるか」ほかを 足した もの。もとの 物は かえない */
export function extendPerson(base: GashaTarget, over: Partial<Omit<GashaTarget, 'down' | 'who' | 'pos' | 'yawDeg'>> & { down?: () => boolean }): GashaTarget {
  const { down, ...rest } = over;
  const o = Object.create(base) as GashaTarget;
  Object.assign(o, rest);
  if (down) Object.defineProperty(o, 'down', { get: down, enumerable: true });
  return o;
}

/** 2P の 口（GashaTarget）。止め・ゆれは 2P の 半分の カメラだけ（4d-0 の duoCamFx） */
function p2Person(port: P2GashaPort, hit: HitSources | null): GashaTarget {
  const t: GashaTarget = {
    who: 2,
    get pos(): Vec3 { return port.ctl.state.position; },
    get yawDeg(): number { return port.ctl.state.yawDeg; },
    get down(): boolean { return port.life.down; },
    hurt: (amount, from) => port.life.damage(amount, { type: 'yokai', kind: 'karakasa', from }).applied > 0,
    carry: (dx, dy, dz, dYawDeg) => {
      const st = port.ctl.state;
      st.position.x += dx; st.position.y += dy; st.position.z += dz;
      st.yawDeg = wrapDeg(st.yawDeg + dYawDeg);
    },
    nudge: (dx, dz) => { const st = port.ctl.state; st.position.x += dx; st.position.z += dz; },
    setVelocity: (v) => { port.ctl.set({ velocity: v }); },
    body: () => port.ctl.state,
    setNoFall: (on) => { port.setNoFall(on); },
    blockInput: (fn) => { port.blockInput(fn); },
    knockbackMul: () => knockbackMulOf(port.armor),
    defIgnore: () => tekkoDefIgnoreOf(port.armor),
    onStrike: (i) => { port.onBigHit(i.part); },
    hearts: () => ({ hp: port.life.hp, maxHp: port.life.maxHp }),
    camera: port.camera,
    hitStop: (n) => { port.hitStop(n); },
    shake: (a) => { port.shake(a); },
    shakeTo: (l) => { port.shakeTo(l); },
  };
  if (hit) t.hit = hit;
  const pry = port.parry;
  if (pry) t.parry = (h) => pry(h);
  return t;
}

/**
 * 人の 一覧（毎回 呼ぶ）。2P が いなければ 1P だけ。2P の 口は 参加ごとに 1 回 作る。
 * 返す 配列は 使いまわし（呼んだ 側は 持ちつづけない）
 */
export function peopleList(p1: GashaTarget, port: () => P2GashaPort | null, hitFor: (p: P2GashaPort) => HitSources | null): () => readonly GashaTarget[] {
  const one: GashaTarget[] = [p1];
  const two: GashaTarget[] = [p1, p1];
  let cur: P2GashaPort | null = null;
  let t2: GashaTarget | null = null;
  return () => {
    const p = port();
    if (!p) return one;
    if (p !== cur || !t2) { cur = p; t2 = p2Person(p, hitFor(p)); }
    two[1] = t2;
    return two;
  };
}
