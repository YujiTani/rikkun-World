// キャラの板の シェーダーを 変えたら、影の差し込みも 合わせる（#199 で 光のまぜを 足したら 影ありで 起動しなくなった）
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SPRITE_SHADERS } from '../../../char/sprite';
import { patchSpriteMaterial } from './shadowPatch';

describe('patchSpriteMaterial', () => {
  it('今の キャラの板の シェーダーに 影を 差し込める（光のまぜは 残す）', () => {
    const mat = new THREE.ShaderMaterial({ vertexShader: SPRITE_SHADERS.vertex, fragmentShader: SPRITE_SHADERS.fragment, uniforms: {} });
    expect(() => patchSpriteMaterial(mat)).not.toThrow();
    expect(mat.fragmentShader).toContain('mix(uPalette[int(idx)], uMixColor, uMix) * uTint * shK');
  });
});
