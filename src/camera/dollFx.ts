import * as THREE from 'three';
import { DOLL_ANIM, DOLL_SIZES } from './config';

const DEG = Math.PI / 180;

/** たおれたとき（やられた）横になる角度 */
export const FALLEN_ROLL_DEG = 90;

export interface DollArcs {
  slash: THREE.Mesh;
  sweep: THREE.Mesh;
}

/** 白い弧（切ったとき・まわり切りのとき）の板を作って parent に入れる */
export function buildDollArcs(parent: THREE.Group): DollArcs {
  const make = (c: { radius: number; width: number; fromDeg: number; toDeg: number }) => {
    const geo = new THREE.RingGeometry(
      c.radius - c.width / 2,
      c.radius + c.width / 2,
      20,
      1,
      c.fromDeg * DEG,
      (c.toDeg - c.fromDeg) * DEG,
    );
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    // 平らな輪を横にねかせ（前が輪の上）、少しななめにして見えるように
    m.rotation.order = 'YXZ';
    m.rotation.x = -Math.PI / 2 + 0.35;
    m.position.set(0, DOLL_ANIM.arcHeight, 0);
    m.userData.noAlpha = true;
    m.visible = false;
    parent.add(m);
    return m;
  };
  return { slash: make(DOLL_ANIM.slashArc), sweep: make(DOLL_ANIM.sweepArc) };
}

/** 白い弧の見え方（どちらを出すか・向き・うすくなる） */
export function updateDollArcs(
  arcs: DollArcs,
  kind: 'none' | 'slash' | 'sweep',
  shown: boolean,
  arcDirDeg: number | null,
  lastYawDeg: number,
  arcAge: number,
): void {
  for (const k of ['slash', 'sweep'] as const) {
    const m = arcs[k];
    m.visible = kind === k && shown;
    m.rotation.y = arcDirDeg === null ? 0 : -(arcDirDeg - lastYawDeg) * DEG;
    if (m.visible) {
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - arcAge / (DOLL_ANIM.arcTicks + 1);
    }
  }
}

/** やられたとき頭の上をまわる星（倒れた人形の座標で置く） */
export function updateDollStars(stars: THREE.Group, fallen: number, tickCount: number): void {
  const th = fallen * FALLEN_ROLL_DEG * DEG;
  const headCenterY = DOLL_SIZES.leg[1] + DOLL_SIZES.body[1] + DOLL_SIZES.head[1] / 2;
  // まわりの中心（頭の真上）を、倒れた人形の座標にもどす
  const wx = -headCenterY * Math.sin(th);
  const wy = headCenterY * Math.cos(th) + 0.45;
  stars.position.set(wx * Math.cos(th) + wy * Math.sin(th), -wx * Math.sin(th) + wy * Math.cos(th), 0);
  stars.rotation.z = -th;
  const n = stars.children.length;
  const spin = tickCount * DOLL_ANIM.starSpinDegPerTick * DEG;
  for (let i = 0; i < n; i++) {
    const a = spin + (i * 2 * Math.PI) / n;
    stars.children[i].position.set(Math.cos(a) * DOLL_ANIM.starRadius, 0, Math.sin(a) * DOLL_ANIM.starRadius);
    stars.children[i].rotation.y = a;
  }
}
