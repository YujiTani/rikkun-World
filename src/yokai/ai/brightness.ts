import * as THREE from 'three';
import type { YokaiBase } from '../common';
import { baseColorOf, variantColor } from '../variants';

const STONE_GRAY = new THREE.Color(0x8c8c8c);
const CHOCHIN_BODY = [0xffb347, 0xfff2a0];

/**
 * 妖怪の人形を暗くする（色に brightness をかける。仕様 §3.2）。
 * 暗くしないもの: ちょうちんの胴（3 段階とも）、白いけむり・白く光るときの共通の材料。
 * 材料のもとの色は userData に覚えておき、毎回「もとの色 × 明るさ」にする（材料は使いまわしても重ならない）。
 */
export function applyDollBrightness(model: YokaiBase, kindId: string, brightness: number, stage: 1 | 2 | 3 = 1): void {
  model.stage = stage;
  model.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      const mat = m as THREE.MeshBasicMaterial;
      const ud = mat.userData as { base?: number; skip?: boolean; body?: boolean; stageMaps?: Record<1 | 2 | 3, THREE.Texture> };
      if (ud.base === undefined) {
        // 段階 2・3 の色で はじめて見たときも、もとの色（段階 1）にもどして覚える
        const hex = baseColorOf(kindId, mat.color.getHex());
        ud.base = hex;
        ud.body = kindId === 'chochin' && CHOCHIN_BODY.includes(hex);
        ud.skip = ud.body || (!mat.map && (hex === 0 || hex === 0xffffff));
      }
      // ぬりかべ の もよう（段階ごとの テクスチャ）
      if (ud.stageMaps && mat.map !== ud.stageMaps[stage]) {
        mat.map = ud.stageMaps[stage];
        mat.needsUpdate = true;
      }
      if (ud.body) {
        // ちょうちんの どう: 暗くしない。いまの色（ふつう / 明るい）を 段階の色に差しかえる
        mat.color.setHex(variantColor(kindId, stage, baseColorOf(kindId, mat.color.getHex())));
        continue;
      }
      if (ud.skip) continue;
      mat.color.setHex(variantColor(kindId, stage, ud.base));
      if (model.stoneness > 0) mat.color.lerp(STONE_GRAY, model.stoneness);
      if (brightness !== 1) mat.color.multiplyScalar(brightness);
    }
  });
}
