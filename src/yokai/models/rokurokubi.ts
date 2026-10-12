import * as THREE from 'three';
import { DEG, YokaiBase, makePixelTexture } from '../common';
import type { YokaiPoseInput } from '../common';

const SKIN = 0xf2c9a0;
const FACE = [
  'KKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKK',
  'KKSSSKKKKKKSSSKK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSKKSSSSKKSSSK',
  'KSSKSSKSSKSSKSSK',
  'KSSSSSSSSSSSSSSK',
  'KSPPSSSSSSSSPPSK',
  'KSSSSSKKKKSSSSSK',
  'KSSSSSKRRKSSSSSK',
  'KSSSSSSKKSSSSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
];
// にっこり目をとじた形（目の行だけ、まっすぐな線にする）
const FACE_CLOSED = FACE.map((r, y) => {
  if (y === 5) return 'KSSSSSSSSSSSSSSK';
  if (y === 6) return 'KSSKKKKSSKKKKSSK';
  return r;
});

const NODES = 4;
const NODE_LEN = 0.3;

/** ろくろくび（首がのびる）。設計書 6 章 */
export class Rokurokubi extends YokaiBase {
  readonly id = 'rokurokubi';
  readonly displayName = 'ろくろくび';
  readonly attackSeconds = 1.45;
  readonly moveSpeed = 1.0;

  private readonly body = this.group(this.rig);
  private readonly sleeveL = this.group(this.body, [-0.3, 1.0, 0]);
  private readonly sleeveR = this.group(this.body, [0.3, 1.0, 0]);
  private readonly nodes: THREE.Group[] = [];
  private readonly necks: THREE.Mesh[] = [];
  private readonly head: THREE.Group;

  constructor() {
    super();
    const b = this.body;
    const blue = 0x6f84e8;
    this.addBox(b, 0.7, 0.3, 0.45, [0, 0.15, 0], this.mat(0x5b6fd6), 0x5b6fd6);
    this.addBox(b, 0.6, 0.7, 0.35, [0, 0.65, 0], this.mat(blue), blue);
    this.addBox(b, 0.62, 0.15, 0.37, [0, 0.6, 0], this.mat(0xf2c14e), 0xf2c14e);
    this.addBox(this.sleeveL, 0.25, 0.45, 0.35, [-0.125, -0.225, 0], this.mat(blue), blue);
    this.addBox(this.sleeveR, 0.25, 0.45, 0.35, [0.125, -0.225, 0], this.mat(blue), blue);
    // 首: 節のグループを順につなぐ。節ごとに伸び縮みさせるので、のびは箱と次の位置に分けてかける
    let parent: THREE.Object3D = b;
    for (let i = 0; i < NODES; i++) {
      const g = this.group(parent, [0, i === 0 ? 1.0 : NODE_LEN, 0]);
      this.necks.push(this.addBox(g, 0.14, NODE_LEN, 0.14, [0, NODE_LEN / 2, 0], this.mat(SKIN), SKIN));
      this.nodes.push(g);
      parent = g;
    }
    this.head = this.group(parent, [0, NODE_LEN, 0]);
    const k = 0x222222;
    const dark = this.mat(k);
    const skin = this.mat(SKIN);
    // 面の順: +x, -x, +y, -y, +z, -z
    this.addBox(this.head, 0.5, 0.5, 0.5, [0, 0.25, 0], [dark, dark, dark, skin, dark, skin], SKIN);
    this.addFace(this.head, 0.5, [0, 0.25, -0.26], makePixelTexture(FACE, { S: SKIN }), makePixelTexture(FACE_CLOSED, { S: SKIN }), true);
    this.addBox(this.head, 0.25, 0.2, 0.25, [0, 0.6, 0.05], dark, k);
    const pin = this.addBox(this.head, 0.4, 0.04, 0.04, [0, 0.62, 0.05], this.mat(0xff7a9a), 0xff7a9a);
    pin.rotation.z = 20 * DEG;
    this.finish();
  }

  /** 首ののび（1 = ふつう）と、節の前のかたむきを決める */
  private setNeck(sy: number, rotX: number): void {
    for (let i = 0; i < NODES; i++) {
      const g = this.nodes[i]!;
      g.position.y = i === 0 ? 1.0 : NODE_LEN * sy;
      g.rotation.x = rotX;
      this.necks[i]!.scale.y = sy;
      this.necks[i]!.position.y = (NODE_LEN * sy) / 2;
    }
    this.head.position.y = NODE_LEN * sy;
  }

  protected pose(p: YokaiPoseInput): void {
    const tau = Math.PI * 2;
    this.body.position.y = 0;
    this.sleeveL.rotation.x = 0;
    this.sleeveR.rotation.x = 0;
    if (p.moving) {
      this.body.position.y = 0.03 * Math.abs(Math.sin((Math.PI * p.time) / 0.8));
      const s = 15 * DEG * Math.sin((tau * p.time) / 0.8);
      this.sleeveL.rotation.x = s;
      this.sleeveR.rotation.x = -s;
    }
    let sy = 1;
    let rx = 0;
    if (p.attackT >= 0) {
      const t = p.attackT;
      if (t < 0.6) sy = 1 + 0.3 * (t / 0.6);
      else if (t < 0.85) {
        sy = 1.3;
        rx = -28 * ((t - 0.6) / 0.25);
      } else {
        const k = Math.max(0, 1 - (t - 0.85) / 0.6);
        sy = 1 + 0.3 * k;
        rx = -28 * k;
      }
    }
    this.setNeck(sy, rx * DEG);
    for (let i = 0; i < NODES; i++) {
      this.nodes[i]!.rotation.z = 4 * DEG * Math.sin((tau * (p.time - 0.3 * i)) / 2.5);
    }
    this.head.rotation.z = -6 * DEG * Math.sin((tau * p.time) / 2.5);
  }

  protected poseDie(p: number): void {
    this.setNeck(1 - 0.9 * p, 0);
  }
}
