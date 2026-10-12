import { DEG, YokaiBase, makeBlinkRows, makePixelTexture } from '../common';
import type { YokaiPoseInput } from '../common';

const FACE = [
  '................',
  '................',
  '.....WWWWWW.....',
  '....WWWWWWWW....',
  '...WWWWKKWWWW...',
  '...WWWKWKKWWW...',
  '...WWWKKKKWWW...',
  '....WWWKKWWW....',
  '.....WWWWWW.....',
  '................',
  '................',
  '....K......K....',
  '.....KRRRRK.....',
  '......KRRK......',
  '................',
  '................',
];
const FACE_CLOSED = makeBlinkRows(FACE, [2, 3, 4, 5, 6, 7, 8], 5, '.', 'WK');

const HOP_SECONDS = 0.6;

/** からかさおばけ（跳ねるかさ）。設計書 3 章 */
export class Karakasa extends YokaiBase {
  readonly id = 'karakasa';
  readonly displayName = 'からかさおばけ';
  readonly attackSeconds = 1.0;
  readonly moveSpeed = 0.8 / HOP_SECONDS;
  /** 1 回の跳ねで進む距離（ブロック） */
  readonly hopDistance = 0.8;

  private readonly body = this.group(this.rig);
  private readonly tongue = this.group(this.body, [0, 0.92, -0.56]);

  constructor() {
    super();
    const b = this.body;
    const brown = 0x8b4a2b;
    const red = 0xe0503a;
    this.addBox(b, 1.1, 0.5, 1.1, [0, 1.1, 0], this.mat(red), red);
    this.addBox(b, 0.3, 0.1, 0.3, [0, 1.55, 0], this.mat(brown), brown);
    this.addBox(b, 0.7, 0.15, 0.7, [0, 1.425, 0], this.mat(red), red);
    this.addBox(b, 1.5, 0.08, 1.5, [0, 0.84, 0], this.mat(0xf2c14e), 0xf2c14e);
    this.addFace(b, 0.5, [0, 1.1, -0.56], makePixelTexture(FACE), makePixelTexture(FACE_CLOSED));
    this.addBox(b, 0.12, 0.3, 0.12, [0, 0.65, 0], this.mat(0xa0703c), 0xa0703c);
    const leg = this.group(b, [0, 0.5, 0]);
    this.addBox(leg, 0.16, 0.4, 0.16, [0, -0.2, 0], this.mat(0xf2c9a0), 0xf2c9a0);
    this.addBox(leg, 0.3, 0.1, 0.4, [0, -0.45, -0.03], this.mat(0x6b4226), 0x6b4226);
    this.addBox(this.tongue, 0.14, 0.06, 0.26, [0, 0, -0.13], this.mat(0xff7a9a), 0xff7a9a);
    this.addBox(this.tongue, 0.14, 0.2, 0.06, [0, -0.1, -0.23], this.mat(0xff7a9a), 0xff7a9a);
    this.finish();
  }

  protected pose(p: YokaiPoseInput): void {
    const b = this.body;
    const tau = Math.PI * 2;
    b.rotation.set(0, 0, 0);
    b.position.set(0, 0, 0);
    b.scale.set(1, 1, 1);
    this.tongue.rotation.x = 10 * DEG * Math.sin((tau * p.time) / 1);
    this.tongue.scale.z = 1;
    if (p.moving && p.attackT < 0) {
      const u = p.time % HOP_SECONDS;
      b.position.y = 0.4 * Math.abs(Math.sin((Math.PI * u) / HOP_SECONDS));
      if (u > HOP_SECONDS - 0.1) b.scale.set(1.1, 0.85, 1.1); // ぺたん
    } else {
      b.rotation.z = 5 * DEG * Math.sin((tau * p.time) / 2);
    }
    if (p.attackT >= 0) {
      const t = p.attackT;
      const lean = t < 0.4 ? t / 0.4 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
      b.rotation.x = -20 * DEG * lean;
      b.rotation.z = 0;
      const ext = t < 0.4 ? 0 : t < 0.6 ? (t - 0.4) / 0.2 : Math.max(0, 1 - (t - 0.6) / 0.4);
      this.tongue.scale.z = 1 + 1.5 * ext;
    }
  }

  protected poseDie(p: number): void {
    this.body.rotation.y = 720 * DEG * p;
    this.body.position.y = 0.3 * p;
  }
}
