// 虹だけに 効かせる ブルーム（選んだ 物だけ 光らせる）。キャラ・地面・空・白い斬撃は にじませない
// scale=.5 で 半分の 解像度の バッファ（横縦 1/2 ＝ 画素数 1/4）。パス数: 本描き 1 ＋ 虹だけ 2（元の絵と にじみ入りの絵）＋ UnrealBloom（明るい所 1・ぼかし 5 段 × 2・合成 1 ≒ 12）＋ 足し合わせ 1 ≒ 16
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
export const BLOOM = { strength: .35, radius: .2, threshold: .5, gain: .55 };
export function addBloom(panel, w, h, dpr, scale = .5) {
  const { renderer, scene, camera, nonFx } = panel, W = Math.round(w * dpr * scale), Hh = Math.round(h * dpr * scale);
  const mk = () => new THREE.WebGLRenderTarget(W, Hh, { type: THREE.HalfFloatType });
  const rtFx = mk(), rtB = mk();
  const pass = new UnrealBloomPass(new THREE.Vector2(W, Hh), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tB: { value: rtB.texture }, tF: { value: rtFx.texture }, gain: { value: BLOOM.gain } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: 'uniform sampler2D tB; uniform sampler2D tF; uniform float gain; varying vec2 vUv; void main(){ vec3 d=max(texture2D(tB,vUv).rgb-texture2D(tF,vUv).rgb,0.)*gain; gl_FragColor=vec4(d,1.);\n #include <colorspace_fragment>\n }',
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
  });
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const orig = panel.render, bg = scene.background;
  panel.render = (i, drawFx) => {
    orig(i, drawFx);   // 本描き（虹も 入る）
    const vis = nonFx.map(o => o.visible); nonFx.forEach(o => (o.visible = false)); scene.background = new THREE.Color(0x000000);
    renderer.setRenderTarget(rtFx); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(rtB); renderer.clear(); renderer.render(scene, camera);
    nonFx.forEach((o, k) => (o.visible = vis[k])); scene.background = bg;
    pass.render(renderer, null, rtB, 0, false);   // rtB に にじみを 足す
    renderer.setRenderTarget(null); const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(quadScene, quadCam); renderer.autoClear = ac;
  };
}
