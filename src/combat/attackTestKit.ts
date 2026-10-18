/**
 * WEAPON-3 のユニットテスト用の 共通の道具（テスト専用。ゲームの コードからは 読まない）。
 * 向きの決まり `attackFacing`（担当 A）の 入力・出力の 形は ここで 決めた（仕様書 §4.2〜§4.4・§4.8）。
 * 名前だけ 実装に 合わせて 直すときは、このファイルの 1 か所だけ 直す。
 */
import type { BladeTech, ItemId, Vec3, VoxelWorld, W2Settings, YokaiEvent, YokaiInfo, YokaiKind, YokaiRayHit, YokaiState, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { KIND_AI } from '../yokai/ai/config';
import { decideAttack, type AttackDecision, type AttackHold, type AttackInput, type AttackKeys } from './attackFacing';

export type { AttackDecision, AttackHold, AttackInput, AttackKeys };

/** 仕様書 §4.7 の 新しい 設定（まだ contracts には ない → 型だけ 足して 読む） */
export type W3Settings = W2Settings & {
  bladeFaceAssistDeg: number;
  thrustTiltMaxDeg: number;
  punchShape: { halfAngleDeg: number; yMin: number; yMax: number };
};

export const NO_KEYS: AttackKeys = { forward: false, back: false, right: false, left: false };
export const keys = (...k: Array<keyof AttackKeys>): AttackKeys => ({ ...NO_KEYS, ...Object.fromEntries(k.map((x) => [x, true])) });

/** 足もと P（平らな 石の 床の 上） */
export const P: Vec3 = { x: 16.5, y: 9, z: 16.5 };
/** 体の点 B（ひらけた所: P の 真上 + 1.40） */
export const B: Vec3 = { x: P.x, y: P.y + 1.4, z: P.z };

export function flatWorld(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 32, y: 24, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) w.setBlock(x, 8, z, 'stone');
  return w;
}

export function settingsW3(): W3Settings {
  return createW2Settings() as W3Settings;
}

/** 向き（度。0 = 北 −Z、90 = 東 +X）と 距離 d の 水平の 点（足もとの 高さ y） */
export function at(deg: number, d: number, y = P.y, from: Vec3 = P): Vec3 {
  const a = (deg * Math.PI) / 180;
  return { x: from.x + Math.sin(a) * d, y, z: from.z - Math.cos(a) * d };
}

/** 角の 差（0〜180） */
export function angDiff(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return Math.abs(d);
}

export const mod360 = (a: number): number => ((a % 360) + 360) % 360;

/** P から 点への 水平の 向き（度。0 以上 360 未満） */
export function bearing(to: Vec3, from: Vec3 = P): number {
  return mod360((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI);
}

let nextId = 1;
export function yokaiAt(kind: YokaiKind, pos: Vec3, o: { id?: number; state?: YokaiState; scale?: number } = {}): YokaiInfo {
  return {
    id: o.id ?? nextId++,
    kind,
    position: { ...pos },
    yawDeg: 0,
    hp: 99,
    maxHp: 99,
    state: o.state ?? 'idle',
    attackTick: 0,
    scale: o.scale ?? 1,
    name: 'テスト',
    title: 'none',
    m: 1,
    attack: 2,
  };
}

/** 妖怪の 当たりの箱の 中心（横の中心・高さの 真ん中） */
export function centerOf(y: YokaiInfo): Vec3 {
  const h = KIND_AI[y.kind].height * y.scale;
  return { x: y.position.x, y: y.position.y + h / 2, z: y.position.z };
}

export interface DecideOpts {
  hold?: AttackHold;
  tech?: BladeTech;
  step?: 1 | 2 | 3;
  punchReach?: number;
  yawDeg?: number;
  facingDeg?: number;
  keys?: AttackKeys;
  position?: Vec3;
  yokai?: YokaiInfo[];
  world?: VoxelWorld;
  settings?: W3Settings;
  item?: ItemId;
  aim?: AttackInput['aim'];
}

/** 既定: 刀・突き・yaw 0・facing 0・キーなし・妖怪なし・＋マークの先は 何もない（空ぶり） */
export function decide(o: DecideOpts = {}): AttackDecision {
  const position = o.position ?? P;
  const input: AttackInput = {
    settings: o.settings ?? settingsW3(),
    hold: o.hold ?? 'blade',
    tech: o.tech ?? 'thrust',
    step: o.step,
    item: o.item,
    punchReach: o.punchReach ?? 3.5,
    yawDeg: o.yawDeg ?? 0,
    facingDeg: o.facingDeg ?? 0,
    keys: o.keys ?? NO_KEYS,
    position,
    body: { x: position.x, y: position.y + 1.4, z: position.z },
    yokai: o.yokai ?? [],
    world: o.world ?? flatWorld(),
    aim: o.aim ?? { yokaiId: null, block: null },
  };
  return decideAttack(input);
}

/** 仮の 妖怪の世界（`ai: false` と 同じ: 動かない）。線は 軸そろえの 箱（半径 r・高さ h）と 当てる */
export class FakeYokaiWorld implements YokaiWorld {
  items: YokaiInfo[] = [];
  damaged: Array<{ id: number; amount: number; from: Vec3 }> = [];
  add(kind: YokaiKind, pos: Vec3, o: { state?: YokaiState } = {}): YokaiInfo {
    const y = yokaiAt(kind, pos, o);
    this.items.push(y);
    return y;
  }
  clear(): void {
    this.items = [];
  }
  list = () => this.items;
  raycast(o: Vec3, d: Vec3, max: number): YokaiRayHit | null {
    let best: YokaiRayHit | null = null;
    for (const y of this.items) {
      if (y.state === 'dying' || y.state === 'leaving') continue;
      const { radius: r, height: h } = KIND_AI[y.kind];
      let t0 = 0;
      let t1 = max;
      const lo = [y.position.x - r, y.position.y, y.position.z - r];
      const hi = [y.position.x + r, y.position.y + h, y.position.z + r];
      const oo = [o.x, o.y, o.z];
      const dd = [d.x, d.y, d.z];
      let ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(dd[i]!) < 1e-9) {
          if (oo[i]! < lo[i]! || oo[i]! > hi[i]!) ok = false;
        } else {
          const a = (lo[i]! - oo[i]!) / dd[i]!;
          const b = (hi[i]! - oo[i]!) / dd[i]!;
          t0 = Math.max(t0, Math.min(a, b));
          t1 = Math.min(t1, Math.max(a, b));
        }
      }
      if (ok && t0 <= t1 && (!best || t0 < best.distance)) best = { id: y.id, kind: y.kind, distance: t0 };
    }
    return best;
  }
  damage(id: number, amount: number, from: Vec3): void {
    this.damaged.push({ id, amount, from: { ...from } });
  }
  occupies = () => false;
  drainEvents(): YokaiEvent[] {
    return [];
  }
}
