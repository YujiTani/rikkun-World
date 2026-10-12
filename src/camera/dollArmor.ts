import * as THREE from 'three';
import { DOLL_SIZES } from './config';

/** 防具を着た人形の見た目（かぶと・よろい）。人形ごとに 1 度だけ作る。 */

const DARK = 0x30343f;
const DARK2 = 0x464b59;
const GOLD = 0xe0b020;
const RED = 0xc0392b;

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

/** あたま用（頭グループの中。原点が首、あたまは 0〜0.5） */
export function buildKabuto(): THREE.Group {
  const [hw, hh, hd] = DOLL_SIZES.head;
  const g = new THREE.Group();
  g.add(box(hw + 0.06, 0.22, hd + 0.06, DARK, 0, hh - 0.06, 0));
  // ひさし
  g.add(box(hw + 0.06, 0.04, 0.09, DARK2, 0, hh - 0.18, -(hd / 2 + 0.05)));
  // 金のかざり（まえだて）
  g.add(box(0.1, 0.12, 0.03, GOLD, 0, hh - 0.08, -(hd / 2 + 0.04)));
  // つの
  for (const s of [-1, 1]) {
    const horn = box(0.04, 0.22, 0.04, GOLD, s * 0.15, hh + 0.12, -(hd / 2 - 0.02));
    horn.rotation.z = -s * 0.35;
    g.add(horn);
  }
  // しころ（うしろとよこのたれ）
  g.add(box(hw + 0.1, 0.16, 0.05, DARK2, 0, hh - 0.26, hd / 2 + 0.03));
  for (const s of [-1, 1]) g.add(box(0.05, 0.14, hd * 0.7, DARK2, s * (hw / 2 + 0.03), hh - 0.24, 0.05));
  return g;
}

/** からだ用（からだグループの中。中心が体の中心）。うでの肩当ては別 */
export function buildYoroiBody(): THREE.Group {
  const [bw, bh, bd] = DOLL_SIZES.body;
  const g = new THREE.Group();
  g.add(box(bw + 0.06, bh * 0.62, bd + 0.06, DARK, 0, bh * 0.16, 0));
  // かざりのひも
  g.add(box(0.1, bh * 0.62, 0.03, RED, 0, bh * 0.16, -(bd / 2 + 0.035)));
  g.add(box(bw + 0.08, 0.04, bd + 0.08, GOLD, 0, bh * 0.16 - bh * 0.31, 0));
  // くさずり（すそ）
  g.add(box(bw + 0.08, bh * 0.26, bd + 0.08, DARK2, 0, -bh * 0.3, 0));
  for (const x of [-0.12, 0, 0.12]) g.add(box(0.015, bh * 0.26, 0.015, RED, x, -bh * 0.3, -(bd / 2 + 0.05)));
  return g;
}

/** うでの肩当て（うでグループの中） */
export function buildYoroiShoulder(): THREE.Group {
  const [aw, , ad] = DOLL_SIZES.arm;
  const g = new THREE.Group();
  g.add(box(aw + 0.1, 0.16, ad + 0.1, DARK, 0, -0.08, 0));
  g.add(box(aw + 0.11, 0.03, ad + 0.11, RED, 0, -0.16, 0));
  return g;
}

/** こて（うでグループの中。ひじから下の うで〈手〉をおおう） */
export function buildKote(): THREE.Group {
  const [aw, ah, ad] = DOLL_SIZES.arm;
  const g = new THREE.Group();
  const h = ah / 2 - 0.04;
  const y = -ah / 2 - h / 2;
  g.add(box(aw + 0.06, h, ad + 0.06, DARK, 0, y, 0));
  g.add(box(aw + 0.08, 0.04, ad + 0.08, RED, 0, -ah / 2 - 0.03, 0));
  g.add(box(aw + 0.08, 0.04, ad + 0.08, GOLD, 0, -ah + 0.1, 0));
  g.add(box(0.08, h * 0.7, 0.03, DARK2, 0, y, -(ad / 2 + 0.035)));
  return g;
}

/** すねあて（あしグループの中。ひざから下、くつの上） */
export function buildSuneate(): THREE.Group {
  const [lw, lh, ld] = DOLL_SIZES.leg;
  const g = new THREE.Group();
  const top = -lh / 2;
  const h = lh / 2 - DOLL_SIZES.shoeHeight;
  const y = top - h / 2;
  g.add(box(lw + 0.06, h, ld + 0.06, DARK, 0, y, 0));
  g.add(box(lw + 0.08, 0.04, ld + 0.08, RED, 0, top - 0.04, 0));
  g.add(box(lw + 0.08, 0.04, ld + 0.08, GOLD, 0, top - h + 0.05, 0));
  g.add(box(0.08, h * 0.75, 0.03, DARK2, 0, y, -(ld / 2 + 0.035)));
  return g;
}
