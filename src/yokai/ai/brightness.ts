import * as THREE from 'three';
import type { YokaiBase } from '../common';

const STONE_GRAY = new THREE.Color(0x8c8c8c);
const CHOCHIN_BODY = [0xffb347, 0xfff2a0];

/**
 * 妖怪の人形を暗くする（色に brightness をかける。仕様 §3.2）。
 * 暗くしないもの: ちょうちんの胴、白いけむり・白く光るときの共通の材料。
 * 材料のもとの色は userData に覚えておき、毎回「もとの色 × 明るさ」にする（材料は使いまわしても重ならない）。
 */
export function applyDollBrightness(model: YokaiBase, kindId: string, brightness: number): void {
  model.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      const mat = m as THREE.MeshBasicMaterial;
      const ud = mat.userData as { base?: number; skip?: boolean };
      if (ud.base === undefined) {
        const hex = mat.color.getHex();
        ud.base = hex;
        ud.skip = (kindId === 'chochin' && CHOCHIN_BODY.includes(hex)) || (!mat.map && (hex === 0 || hex === 0xffffff));
      }
      if (ud.skip) continue;
      mat.color.setHex(ud.base);
      if (model.stoneness > 0) mat.color.lerp(STONE_GRAY, model.stoneness);
      if (brightness !== 1) mat.color.multiplyScalar(brightness);
    }
  });
}
