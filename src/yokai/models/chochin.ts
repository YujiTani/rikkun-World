import { DEG, YokaiBase, makeBlinkRows, makePixelTexture } from '../common';
import type { YokaiPoseInput } from '../common';

const FACE = [
  '................',
  '................',
  '..WWWW......WW..',
  '.WWWWWW....WWWW.',
  '.WWKKWW....WKKW.',
  '.WWKKWW....WKKW.',
  '.WWWWWW....WWWW.',
  '..WWWW......WW..',
  '................',
  '..KKKKKKKKKKKK..',
  '..KRRRRRRRRRRK..',
  '...KRRRRRRRRK...',
  '....KKKKKKKK....',
  '................',
  '................',
  '................',
];
const FACE_CLOSED = makeBlinkRows(FACE, [2, 3, 4, 5, 6, 7], 4, '.', 'WK');

const BODY = 0xffb347;
const BODY_BRIGHT = 0xfff2a0;
const HANDLE_Y = 1.2;

/** ちょうちんおばけ（浮かぶあかり）。設計書 4 章 */
export class Chochin extends YokaiBase {
  readonly id = 'chochin';
  readonly displayName = 'ちょうちんおばけ';
  readonly attackSeconds = 1.0;
  readonly moveSpeed = 0.8;

  private readonly uku = this.group(this.rig, [0, 0.5, 0]);
  private readonly tsuri = this.group(this.uku, [0, HANDLE_Y, 0]);
  private readonly tongue = this.group(this.tsuri, [0, 0.3 - HANDLE_Y, -0.37]);
  private readonly bodyMat = this.mat(BODY);

  constructor() {
    super();
    const g = this.tsuri;
    const dark = 0x3a3a4a;
    const wood = 0x6b4226;
    const rib = 0xc46a1e;
    const at = (y: number): [number, number, number] => [0, y - HANDLE_Y, 0];
    this.addBox(g, 0.45, 0.08, 0.45, at(0.04), this.mat(dark), dark);
    this.addBox(g, 0.6, 0.12, 0.6, at(0.14), this.bodyMat, BODY);
    this.addBox(g, 0.72, 0.5, 0.72, at(0.45), this.bodyMat, BODY);
    this.addBox(g, 0.74, 0.03, 0.74, at(0.32), this.mat(rib), rib);
    this.addBox(g, 0.74, 0.03, 0.74, at(0.58), this.mat(rib), rib);
    this.addBox(g, 0.6, 0.12, 0.6, at(0.76), this.bodyMat, BODY);
    this.addBox(g, 0.45, 0.08, 0.45, at(0.86), this.mat(dark), dark);
    this.addBox(g, 0.06, 0.25, 0.06, at(1.025), this.mat(wood), wood);
    this.addBox(g, 0.3, 0.06, 0.06, at(1.15), this.mat(wood), wood);
    this.addFace(g, 0.5, [0, 0.45 - HANDLE_Y, -0.375], makePixelTexture(FACE), makePixelTexture(FACE_CLOSED));
    this.addBox(this.tongue, 0.16, 0.05, 0.12, [0, 0, -0.06], this.mat(0xff7a9a), 0xff7a9a);
    this.addBox(this.tongue, 0.16, 0.4, 0.05, [0, -0.18, -0.12], this.mat(0xff7a9a), 0xff7a9a);
    this.finish();
  }

  protected pose(p: YokaiPoseInput): void {
    const tau = Math.PI * 2;
    this.uku.position.set(0, 0.5 + 0.08 * Math.sin((tau * p.time) / 2), 0);
    this.uku.rotation.set(0, 0, 0);
    this.tsuri.rotation.z = 8 * DEG * Math.sin((tau * p.time) / 2);
    this.tongue.rotation.x = 0;
    if (p.moving) {
      this.uku.rotation.x = -10 * DEG;
      this.tongue.rotation.x = 15 * DEG * Math.sin((tau * p.time) / 0.5);
    }
    let color = BODY;
    if (p.attackT >= 0) {
      const t = p.attackT;
      if (t < 0.4 && Math.floor(t / 0.1) % 2 === 0) color = BODY_BRIGHT; // 2 回点めつ
      if (t >= 0.4) {
        const k = t < 0.65 ? (t - 0.4) / 0.25 : Math.max(0, 1 - (t - 0.65) / 0.35);
        this.uku.position.z = -0.6 * k;
      }
    }
    this.bodyMat.color.setHex(color);
  }

  protected poseDie(p: number): void {
    this.uku.position.y = 0.5 * (1 - p);
    this.uku.rotation.z = 90 * DEG * p;
  }
}
