/**
 * #308 gashaGirl.ts を 分けた もの: 目が 合った ときの 演出（「！」→ 頬染めの 斜線）。
 */
import { Sprite, SpriteMaterial, Vector3, type Group, type Scene } from 'three';
import type { GirlSfx } from './gashaGirlSfx';
import { canvasTex } from './gashaGirlGfx';
import { TUNE as T } from './gashaGirlTuning';

export interface ShyEnv {
  scene: Scene;
  pivot: Group;
  /** 少女の 頭の 中心(世界) */
  headCenter(out: Vector3): Vector3;
  /** 効果音は あとで 作られる ので 使う ときに 取りだす */
  sfx(): Pick<GirlSfx, 'eyeBlush'>;
}

export interface Shy {
  /** 「！」を 出す / 全部 消す */
  set(on: boolean): void;
  /** 目が 合った しゅんかんから 数えはじめる */
  begin(): void;
  update(dt: number): void;
  /** 数えている 最中か */
  active(): boolean;
}

export function createShy(env: ShyEnv): Shy {
  const { scene, pivot, headCenter } = env;
  const headC = new Vector3();
  const bangTex = canvasTex(128, 128, (c) => {
    c.font = 'bold 120px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = 16; c.strokeStyle = '#fff'; c.strokeText('！', 64, 70);
    const g = c.createLinearGradient(0, 10, 0, 118); g.addColorStop(0, '#ff3030'); g.addColorStop(1, '#ffd020');
    c.fillStyle = g; c.fillText('！', 64, 70);
  });
  const bang = new Sprite(new SpriteMaterial({ map: bangTex, transparent: true, depthTest: false, depthWrite: false }));
  bang.visible = false; bang.renderOrder = 10; scene.add(bang);
  const hatchTex = canvasTex(128, 128, (c) => { // 頬染めの 斜線「////」
    c.lineCap = 'round';
    for (const [w, col] of [[22, '#fff'], [11, '#ff5a8a']] as const) {
      c.lineWidth = w; c.strokeStyle = col;
      for (let i = 0; i < 4; i++) { const x = 24 + i * 26; c.beginPath(); c.moveTo(x, 104); c.lineTo(x + 22, 24); c.stroke(); }
    }
  });
  const hatch = new Sprite(new SpriteMaterial({ map: hatchTex, transparent: true, depthTest: false, depthWrite: false }));
  hatch.visible = false; hatch.renderOrder = 10; scene.add(hatch);
  let shyT = -1; // 目が 合ってから の 秒
  let blushPlayed = false;
  const setShy = (on: boolean) => {
    bang.visible = on; hatch.visible = false;
    if (!on) shyT = -1;
  };
  const updateShy = (dt: number) => {
    if (shyT < 0) return;
    shyT += dt;
    headCenter(headC);
    const yaw = pivot.rotation.y, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const k = shyT < 0.08 ? shyT / 0.08 * 1.3 : shyT < 0.18 ? 1.3 - 0.3 * ((shyT - 0.08) / 0.1) : 1; // ぴょこん
    const px = headC.x + rx * 0.5, py = headC.y + 0.4, pz = headC.z + rz * 0.5;
    if (shyT >= T.eye.bangSwapSec && !blushPlayed) { blushPlayed = true; env.sfx().eyeBlush(); }
    if (shyT < T.eye.bangSwapSec) { bang.visible = true; hatch.visible = false; bang.position.set(px, py + 0.1, pz); bang.scale.setScalar(0.7 * k); }
    else { // 0.4 秒 あとに「！」と 入れかわりで 頬染めの 斜線（ぷるぷる ふるえる）
      bang.visible = false; hatch.visible = true;
      const u = shyT - T.eye.bangSwapSec, pop = u < 0.08 ? u / 0.08 * 1.3 : u < 0.18 ? 1.3 - 0.3 * ((u - 0.08) / 0.1) : 1;
      hatch.position.set(px + Math.sin(shyT * 70) * 0.025, py + Math.cos(shyT * 83) * 0.02, pz); hatch.scale.setScalar(0.8 * pop);
    }
  };
  return {
    set: setShy, update: updateShy, active: () => shyT >= 0,
    begin: () => { shyT = 0; setShy(true); shyT = 0; blushPlayed = false; },
  };
}
