import * as THREE from 'three';
import type { Vec3 } from '../contracts';

/**
 * 空にあがった たこの 見た目（ITEM-FX-1 AC8）: 赤白の ひし形の板 ＋ しっぽ ＋ プレイヤーまでの 糸。箱の 組み合わせ。
 * 試作（あとで yuzu に 見せて 直す）。当たり判定は 持たない（見るだけ）。毎ステップ update() を呼ぶ。
 */
const RED = 0xd8382d;
const WHITE = 0xfdfaf0;
const STRING = 0xf4efe2;
/** ひし形の 一辺（マス） */
const SIDE = 2.2;
const TAIL = 6;

export class KiteView {
  private readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly tail: THREE.Mesh[] = [];
  private readonly line: THREE.Mesh;
  private readonly geo = new THREE.BoxGeometry(1, 1, 1);
  private readonly mats = [RED, WHITE, STRING].map((c) => new THREE.MeshBasicMaterial({ color: c }));

  constructor(scene: THREE.Object3D) {
    const [red, white, str] = this.mats;
    const board = (size: number, mat: THREE.Material, z: number) => {
      const m = new THREE.Mesh(this.geo, mat);
      m.scale.set(size, size, 0.05);
      m.rotation.z = Math.PI / 4;
      m.position.z = z;
      this.body.add(m);
    };
    board(SIDE, red, 0);
    board(SIDE * 0.55, white, 0.03);
    board(SIDE * 0.22, red, 0.06);
    for (let i = 0; i < TAIL; i++) {
      const m = new THREE.Mesh(this.geo, i % 2 === 0 ? red : white);
      m.scale.set(0.35, 0.18, 0.05);
      m.position.set(0, -SIDE * 0.71 - 0.3 - i * 0.32, 0);
      this.tail.push(m);
      this.body.add(m);
    }
    this.line = new THREE.Mesh(this.geo, str);
    this.group.add(this.body, this.line);
    this.group.visible = false;
    this.group.traverse((o) => (o.frustumCulled = false));
    scene.add(this.group);
  }

  /** pos = たこの 位置（上がっていなければ null）、player = プレイヤーの 足もと、tick = ゆれの 時間 */
  update(pos: Vec3 | null, player: Vec3, tick: number): void {
    this.group.visible = pos !== null;
    if (!pos) return;
    const hand = { x: player.x, y: player.y + 1.0, z: player.z };
    // たこ: プレイヤーの ほうを 向いて、少し うしろに たおれ、ゆらゆら かたむく
    this.body.position.set(pos.x, pos.y, pos.z);
    this.body.rotation.set(-0.35, Math.atan2(hand.x - pos.x, hand.z - pos.z), Math.sin(tick * 0.04) * 0.25, 'YXZ');
    this.tail.forEach((m, i) => (m.position.x = Math.sin(tick * 0.06 - i * 0.7) * 0.25 * (i + 1) * 0.3));
    // 糸: 手から たこ（ひし形の 下の さき）まで 1 本の 細い 箱
    const dx = pos.x - hand.x;
    const dy = pos.y - SIDE * 0.7 - hand.y;
    const dz = pos.z - hand.z;
    const len = Math.hypot(dx, dy, dz);
    this.line.position.set(hand.x + dx / 2, hand.y + dy / 2, hand.z + dz / 2);
    this.line.scale.set(0.03, 0.03, Math.max(0.01, len));
    this.line.lookAt(hand.x + dx, hand.y + dy, hand.z + dz);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geo.dispose();
    for (const m of this.mats) m.dispose();
  }
}
