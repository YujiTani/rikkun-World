import * as THREE from 'three';
import type { VoxelWorld, YokaiKind } from '../../contracts';
import type { Rokurokubi } from '../models/rokurokubi';
import { AI_CONST, KIND_AI, type KindAi } from './config';
import type { Ent, YokaiField } from './entity';
import { obbBounds, toLocalXZ, type Aabb, type OBox } from './geometry';

/**
 * 妖怪の体のかたち（当たりの箱・大きさ・マスとの重なり）。どれも 1 体ぶん（Ent）を 受けとって 読むだけ。
 * 毎フレーム呼ばれるので、作業用の入れ物（tmp など）は ここで 1 回だけ 作って 使いまわす。
 */

const tmp = { x: 0, z: 0 };
const tmpBox: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const tmpVec = new THREE.Vector3();

const dimsCache = new Map<string, KindAi>();

/** 体の大きさ s 倍の 動きの数（半径・高さ・頭の上の高さ だけ s 倍。のぼれる段・はやさ・見つける距離は そのまま） */
export function scaledDims(kind: YokaiKind, s: number): KindAi {
  if (s === 1) return KIND_AI[kind];
  const key = `${kind}|${s}`;
  let d = dimsCache.get(key);
  if (!d) {
    const b = KIND_AI[kind];
    d = { ...b, radius: b.radius * s, height: b.height * s, marksHeight: b.marksHeight * s };
    dimsCache.set(key, d);
  }
  return d;
}

/** 足もとの位置と向きを 見た目(model.root)に うつす */
export function syncTransform(e: Ent): void {
  e.model.root.position.set(e.x, e.y, e.z);
  e.model.root.rotation.y = -e.yaw;
}

/** 当たりの箱（足もとからの位置を妖怪の向きで見たもの）。たおれているあいだは無い */
export function boxesOf(e: Ent, out: OBox[]): OBox[] {
  out.length = 0;
  if (e.state === 'dying' || e.state === 'leaving') return out;
  switch (e.kind) {
    case 'karakasa':
      out.push({ cx: 0, cy: 0.9, cz: 0, hx: 0.75, hy: 0.9, hz: 0.75 });
      break;
    case 'chochin':
      out.push({ cx: 0, cy: 1.1, cz: 0, hx: 0.4, hy: 0.6, hz: 0.4 });
      break;
    case 'nurikabe':
      // ねている（攻撃の 90〜195 ステップ目）あいだは、ねた形
      if (e.state === 'attack' && e.attackSteps >= 90 && e.attackSteps < 195) {
        out.push({ cx: 0, cy: 0.4, cz: -1.9, hx: 1.3, hy: 0.4, hz: 1.5 });
      } else {
        out.push({ cx: 0, cy: 1.5, cz: 0, hx: 1.3, hy: 1.5, hz: 0.4 });
      }
      break;
    case 'rokurokubi': {
      out.push({ cx: 0, cy: 0.9, cz: 0, hx: 0.35, hy: 0.9, hz: 0.225 });
      const h = (e.model as Rokurokubi).headCenter(tmpVec);
      out.push({ cx: h.x, cy: h.y, cz: h.z, hx: 0.3, hy: 0.3, hz: 0.3 });
      break;
    }
    case 'tako_hachimaki':
      out.push({ cx: 0, cy: 0.95, cz: 0, hx: 0.6, hy: 0.9, hz: 0.55 });
      break;
    default: {
      const unreachable: never = e.kind;
      throw new Error(`boxesOf: 知らない妖怪 ${String(unreachable)}`);
    }
  }
  if (e.bodyScale !== 1) {
    for (const b of out) {
      b.cx *= e.bodyScale;
      b.cy *= e.bodyScale;
      b.cz *= e.bodyScale;
      b.hx *= e.bodyScale;
      b.hy *= e.bodyScale;
      b.hz *= e.bodyScale;
    }
  }
  return out;
}

/** 箱 (x0..x1, y0..y1, z0..z1) の中に 固いブロックが ないか */
export function boxFreeAt(world: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const e = 1e-6;
  for (let y = Math.floor(y0 + e); y <= Math.floor(y1 - e); y++) {
    for (let x = Math.floor(x0 + e); x <= Math.floor(x1 - e); x++) {
      for (let z = Math.floor(z0 + e); z <= Math.floor(z1 - e); z++) {
        if (world.isSolid(x, y, z)) return false;
      }
    }
  }
  return true;
}

/** 向きのついた箱 b（足もとから見た位置）が重なるマスを、y の下から上まで順に fn へ渡す */
export function forCells(e: Ent, b: OBox, yLo: number, yHi: number, fn: (x: number, y: number, z: number) => void): void {
  const bb = obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox);
  const c = Math.abs(Math.cos(e.yaw));
  const s = Math.abs(Math.sin(e.yaw));
  const x0 = Math.floor(bb.minX + 1e-6);
  const x1 = Math.floor(bb.maxX - 1e-6);
  const z0 = Math.floor(bb.minZ + 1e-6);
  const z1 = Math.floor(bb.maxZ - 1e-6);
  const m = 0.5 * (c + s) - 1e-6;
  for (let y = yLo; y <= yHi; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        toLocalXZ(x + 0.5 - e.x, z + 0.5 - e.z, e.yaw, tmp);
        if (Math.abs(tmp.x - b.cx) < b.hx + m && Math.abs(tmp.z - b.cz) < b.hz + m) fn(x, y, z);
      }
    }
  }
}

/** プレイヤーの体の箱（足もと f.px, f.py, f.pz）。padXZ・padY だけ広げる */
export function playerBox(f: YokaiField, out: Aabb, padXZ = 0, padY = 0): Aabb {
  const h = AI_CONST.playerWidth / 2 + padXZ;
  out.minX = f.px - h;
  out.maxX = f.px + h;
  out.minZ = f.pz - h;
  out.maxZ = f.pz + h;
  out.minY = f.py - padY;
  out.maxY = f.py + AI_CONST.playerHeight + padY;
  return out;
}

/** 妖怪の向きで見た箱と、プレイヤーの箱の重なり（向きのついた箱のきちんとした判定） */
export function localOverlap(f: YokaiField, e: Ent, b: OBox, padXZ = 0, padY = 0): boolean {
  toLocalXZ(f.px - e.x, f.pz - e.z, e.yaw, tmp);
  const c = Math.abs(Math.cos(e.yaw));
  const s = Math.abs(Math.sin(e.yaw));
  const hp = (AI_CONST.playerWidth / 2 + padXZ) * (c + s);
  const ly = f.py + AI_CONST.playerHeight / 2 - e.y;
  return (
    Math.abs(tmp.x - b.cx) < b.hx + hp &&
    Math.abs(ly - b.cy) < b.hy + AI_CONST.playerHeight / 2 + padY &&
    Math.abs(tmp.z - b.cz) < b.hz + hp
  );
}
