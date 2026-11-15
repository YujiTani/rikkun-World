// TOWN-1 1E: かじやさん・やたいの 3 人の 見た目（ねらい中は ふちどり）・かじやさんの つちを ふる うで・炉の 火・かえりの おふだの ため の 光（vendors.ts が 使う）。
// 体の 材料は 4 人で 1 つ（骨なしの メッシュ ＋ shadeMat。よろずやさんと 同じ）。毎フレーム 新しい 物を 作らない。
import * as THREE from 'three';
import type { Vec3 } from '../../contracts';
import { shadeMat } from '../../animals/models/animalRenderParts';
import { FX_SETTINGS } from '../../fx/config';
import { ShopkeeperRenderer } from '../../town/ShopkeeperRenderer';
import { currentTown } from '../../town/townState';
import { OFUDA_TUNING, SMITH_TUNING } from '../../town/vendor/vendorTable';
import { VENDOR_NPCS, VENDOR_TALK_ID } from '../../town/vendor/vendorTalk';
import type { VendorNpc } from '../../town/vendor/vendorDesk';
import { SMITH_SHOULDER, smithArmModel, vendorModel, type VendorLook } from '../../town/vendorNpcSpec';
import type { WiredShop } from './shop';

type Who = 1 | 2;

/** 人 → 形（やたいさん ＝ かいとりの やたいの 人） */
const LOOK_OF = { smith: 'smith', stall: 'stall', dango: 'dango', gohan: 'gohan' } as const satisfies Record<VendorNpc, VendorLook>;

/** 見た目の 数（ブロック・ラジアン・こ） */
const LOOK = {
  /** 小キューブ 1 つの 大きさ（ブロック） */
  unit: 1 / 16,
  /** つちを ふりあげる 角度（ラジアン） */
  swing: 1.3,
  /** おふだの 光の 柱（半径・高さ。ブロック） */
  glowR: 0.65,
  glowH: 2.2,
  /** 光の いちばん 濃い とき（0〜1） */
  glowMax: 0.55,
  glowHex: 0xfff2a8,
} as const;

export interface VendorLooks {
  /** なおした: つちを ふって 炉の 火 */
  hammer(): void;
  /** 世界が 動いた 1 ステップ（つちの うごき・おふだの 火の 粉） */
  step(charge: (who: Who) => number | null, pos: (who: Who) => Vec3 | null): void;
  /** おふだで うつった: 光の つぶ */
  arrived(at: Vec3): void;
}

export function createVendorLooks(deps: Pick<WiredShop, 'shared' | 'game' | 'dig' | 'lighting'>): VendorLooks {
  const { shared, game, dig, lighting } = deps;
  const drawn = (x: number, z: number): boolean => shared.streamHost?.stream.isDrawn(Math.floor(x) >> 4, Math.floor(z) >> 4) ?? true;
  const mat = shadeMat();
  lighting.register(mat, 'doll');
  const people = {} as Record<VendorNpc, ShopkeeperRenderer>;
  for (const n of VENDOR_NPCS) {
    people[n] = new ShopkeeperRenderer(drawn, vendorModel(LOOK_OF[n]), mat);
    game.scene.add(people[n].group);
  }
  // かじやさんの 右うで（かたの 点で 前に ふる）
  const shoulder = new THREE.Group();
  shoulder.position.set(SMITH_SHOULDER[0] * LOOK.unit, SMITH_SHOULDER[1] * LOOK.unit, SMITH_SHOULDER[2] * LOOK.unit);
  const arm = new THREE.Mesh(smithArmModel().geo, mat);
  arm.position.set(-shoulder.position.x, -shoulder.position.y, -shoulder.position.z);
  arm.renderOrder = 2;
  shoulder.add(arm);
  people.smith.group.add(shoulder);

  // おふだの 光（人ごと。ふだんは 見えない）
  const glowGeo = new THREE.CylinderGeometry(LOOK.glowR, LOOK.glowR, LOOK.glowH, 16, 1, true);
  const glows: Record<Who, THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>> = { 1: null!, 2: null! };
  for (const who of [1, 2] as const) {
    const m = new THREE.MeshBasicMaterial({ color: LOOK.glowHex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    m.userData.noDim = true;
    glows[who] = new THREE.Mesh(glowGeo, m);
    glows[who].visible = false;
    glows[who].renderOrder = 3;
    game.scene.add(glows[who]);
  }

  let tick = 0;
  let swingLeft = 0;
  let swingLen: number = SMITH_TUNING.swingSteps;
  const where = (n: VendorNpc) => currentTown()?.info().npcs.find((x) => x.kind === n) ?? null;
  const cell = { x: 0, y: 0, z: 0 };

  game.onBeforeRender(() => {
    const aimed = dig.aimedArchitect();
    for (const n of VENDOR_NPCS) {
      const at = where(n);
      people[n].update(at ? { x: at.pos.x, y: at.pos.y, z: at.pos.z, yaw: at.yaw } : null, game.camera, aimed === VENDOR_TALK_ID[n]);
    }
    shoulder.rotation.x = swingLeft > 0 ? LOOK.swing * Math.sin((1 - swingLeft / swingLen) * Math.PI) : 0;
  });

  const burst = (at: Vec3, hex: number, n: number): void => {
    cell.x = Math.floor(at.x);
    cell.y = Math.floor(at.y);
    cell.z = Math.floor(at.z);
    shared.fx.particles.burstHex(cell, hex, FX_SETTINGS, n);
  };

  return {
    hammer: () => {
      swingLeft = swingLen = SMITH_TUNING.hammerSteps;
      const s = where('smith');
      if (s) {
        // 炉の 火: かじやさんの 前（顔の 向き）の マス
        const fx = -Math.sin(s.yaw);
        const fz = -Math.cos(s.yaw);
        burst({ x: s.pos.x + fx, y: s.pos.y, z: s.pos.z + fz }, SMITH_TUNING.flameHex, SMITH_TUNING.flameCount);
      }
    },
    step: (charge, pos) => {
      tick++;
      if (swingLeft > 0) swingLeft--;
      else if (tick % SMITH_TUNING.idleEvery === 0) swingLeft = swingLen = SMITH_TUNING.swingSteps; // ときどき トンカン
      for (const who of [1, 2] as const) {
        const c = charge(who);
        const p = c === null ? null : pos(who);
        const g = glows[who];
        g.visible = p !== null;
        if (p === null || c === null) continue;
        const k = 1 - c / OFUDA_TUNING.chargeSteps;
        g.position.set(p.x, p.y + LOOK.glowH / 2, p.z);
        g.material.opacity = LOOK.glowMax * (0.3 + 0.7 * k);
        g.scale.set(1 - 0.35 * k, 1, 1 - 0.35 * k);
        if (tick % OFUDA_TUNING.sparkEvery === 0) burst({ x: p.x, y: p.y + 1, z: p.z }, OFUDA_TUNING.sparkHex, OFUDA_TUNING.sparkCount);
      }
    },
    arrived: (at) => burst({ x: at.x, y: at.y + 1, z: at.z }, OFUDA_TUNING.sparkHex, OFUDA_TUNING.arriveCount),
  };
}
