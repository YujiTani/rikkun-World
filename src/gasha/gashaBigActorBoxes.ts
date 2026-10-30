/**
 * #308 gashaBigActor.ts を 分けた もの: 当たりの 箱（見えない OBB）。毎コマ 関節の いまの 姿勢で 場所を 更新し、
 * 「このマスは 固いか」を その場で 聞く（マスの 集合は 作らない）。置いた ブロックの 追加の 箱・くずれて 落ちた 関節の 箱の はずしも ここ。
 */
import { Quaternion, Vector3 } from 'three';
import { maskHas, type BigModel, type JointName } from './gashaBigTypes';
import { TUNE as T } from './gashaBigTuning';
import type { ActorWork, Box, ExtraHit } from './gashaBigActorBase';

export class ActorBoxes {
  private hitCount = 0;
  private hitBoxes: Box[] = [];
  private xhits: ExtraHit[] = [];
  private xboxes: Box[] = [];
  private readonly boxes: Box[] = [];
  private bbox = { lo: [0, 0, 0], hi: [0, 0, 0] };
  private stamp = 0;
  private readonly goneJoints = new Set<JointName>();
  private readonly jointCache: { q: Quaternion; sc: Vector3; stamp: number }[];
  private readonly tv = new Vector3();
  private readonly tq = new Quaternion();
  private readonly ts = new Vector3();

  constructor(private readonly model: BigModel, names: JointName[], private readonly jointIndex: Map<JointName, number>, private readonly work: ActorWork) {
    this.jointCache = names.map(() => ({ q: new Quaternion(), sc: new Vector3(), stamp: 0 }));
    for (const h of model.hits) {
      this.boxes.push({ name: h.name, joint: h.joint, c: [0, 0, 0], ax: new Array<number>(9).fill(0), half: [0, 0, 0], ext: [0, 0, 0], mask: h.mask });
    }
    this.hitCount = model.hits.length;
    this.hitBoxes = this.boxes.slice();
  }

  /** 関節の 箱を 当たりから はずす(くずれて 落ちた)。見た目は 呼んだ 側が 消す */
  hideJoint(j: JointName): void {
    this.goneJoints.add(j);
  }

  showAllJoints(): void {
    this.goneJoints.clear();
  }

  /** 箱の 世界での 場所を 更新（関節の いまの 姿勢）。group の 行列は 先に 更新して おく */
  updateBoxes(): void {
    const m = this.model;
    const q = this.tq, sc = this.ts, pos = this.tv;
    const stamp = ++this.stamp;
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity, hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    const mg0 = T.collide.margin, lift0 = T.collide.topLift;
    const v = new Vector3();
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i]!, h = i < this.hitCount ? m.hits[i]! : this.xhits[i - this.hitCount]!;
      const mg = b.exact ? 0 : mg0, lift = b.exact ? 0 : lift0;
      const jg = m.joints[b.joint];
      const ji = this.jointIndex.get(b.joint)!;
      const cj = this.jointCache[ji]!;
      if (cj.stamp !== stamp) { jg.matrixWorld.decompose(pos, q, sc); cj.q.copy(q); cj.sc.copy(sc); cj.stamp = stamp; }
      v.copy(h.c).sub(m.rest[b.joint]).applyMatrix4(jg.matrixWorld);
      b.c[0] = v.x; b.c[1] = v.y; b.c[2] = v.z;
      for (let k = 0; k < 3; k++) {
        v.copy(h.axes[k]!).applyQuaternion(cj.q);
        b.ax[k * 3] = v.x; b.ax[k * 3 + 1] = v.y; b.ax[k * 3 + 2] = v.z;
      }
      b.half[0] = h.half[0] * cj.sc.x; b.half[1] = h.half[1] * cj.sc.y; b.half[2] = h.half[2] * cj.sc.z;
      const hx = b.half[0] + mg, hy = b.half[1] + mg + lift, hz = b.half[2] + mg;
      for (let d = 0; d < 3; d++) b.ext[d] = Math.abs(b.ax[d]!) * hx + Math.abs(b.ax[3 + d]!) * hy + Math.abs(b.ax[6 + d]!) * hz;
      lo0 = Math.min(lo0, b.c[0] - b.ext[0]); hi0 = Math.max(hi0, b.c[0] + b.ext[0]);
      lo1 = Math.min(lo1, b.c[1] - b.ext[1]); hi1 = Math.max(hi1, b.c[1] + b.ext[1]);
      lo2 = Math.min(lo2, b.c[2] - b.ext[2]); hi2 = Math.max(hi2, b.c[2] + b.ext[2]);
    }
    this.bbox = { lo: [lo0, lo1, lo2], hi: [hi0, hi1, hi2] };
    this.work.boxes = this.hitCount;
  }

  /** マス（i, j, k）の 中心が 入る 箱の 番号（なければ -1）。voxelize と おなじ きまり（j < 0 は 地面の 下なので なし） */
  boxAt(i: number, j: number, k: number): number {
    const bb = this.bbox;
    const cx = i + 0.5, cy = j + 0.5, cz = k + 0.5;
    if (j < 0 || cx < bb.lo[0]! || cx > bb.hi[0]! || cy < bb.lo[1]! || cy > bb.hi[1]! || cz < bb.lo[2]! || cz > bb.hi[2]!) { this.work.lastQueryBoxes = 0; return -1; }
    const mg0 = T.collide.margin, lift0 = T.collide.topLift;
    let tested = 0, found = -1;
    for (let n = 0; n < this.boxes.length; n++) {
      const b = this.boxes[n]!;
      if (this.goneJoints.size > 0 && this.goneJoints.has(b.joint)) continue;
      const mg = b.exact ? 0 : mg0, lift = b.exact ? 0 : lift0;
      const dx = cx - b.c[0], dy = cy - b.c[1], dz = cz - b.c[2];
      if (Math.abs(dx) > b.ext[0] || Math.abs(dy) > b.ext[1] || Math.abs(dz) > b.ext[2]) continue;
      tested++;
      const a = b.ax;
      const u = dx * a[0]! + dy * a[1]! + dz * a[2]!;
      const vv = dx * a[3]! + dy * a[4]! + dz * a[5]! - lift / 2;
      const w = dx * a[6]! + dy * a[7]! + dz * a[8]!;
      if (Math.abs(u) <= b.half[0] + mg && Math.abs(vv) <= b.half[1] + mg + lift / 2 && Math.abs(w) <= b.half[2] + mg && (!b.mask || maskHas(b.mask, u, w, b.half[0], b.half[2]))) {
        // うでの 箱を 優先（雲より 動くので）
        if (found < 0 || (this.boxes[found]!.joint === 'Hips' && b.joint !== 'Hips')) found = n;
        if (b.joint !== 'Hips') break;
      }
    }
    this.work.lastQueryBoxes = tested;
    return found;
  }

  solid(i: number, j: number, k: number): boolean { return this.boxAt(i, j, k) >= 0; }

  /** 足もとの すぐ 下の マスが どの 箱か（のっている 箱）。足が 地面に のって いる ときだけ */
  boxUnder(x: number, y: number, z: number): number {
    const i = Math.floor(x), j = Math.floor(y + 0.02) - 1, k = Math.floor(z);
    const a = this.boxAt(i, j, k);
    return a >= 0 ? a : this.boxAt(i, j - 1, k); // うすい 箱が かたむいて も のりつづける ように 2 マス 下まで 見る
  }

  /** いまの 当たりの 箱の 数 */
  get boxCount(): number { return this.hitCount; }

  /** 当たりの 箱（世界の 座標。毎コマ 更新される）。プレイヤーの 攻撃を 受ける 口が 読む（gashaBigHit.ts） */
  get boxList(): readonly Box[] { return this.hitBoxes; }

  /** 体に ついて 動く 追加の 箱（置いた ブロック）を 入れかえる。当たりの 箱の 番号（hits）の あとに 足す。boxAt の 答えが hits の 数 以上なら 追加の 箱 */
  setExtras(list: readonly ExtraHit[]): void {
    this.boxes.length = this.hitCount;
    this.xhits = list.slice();
    for (const x of list) this.boxes.push({ name: 'placed', joint: x.joint, c: [0, 0, 0], ax: new Array<number>(9).fill(0), half: [0, 0, 0], ext: [0, 0, 0], exact: true });
    this.xboxes = this.boxes.slice(this.hitCount);
    this.model.group.updateMatrixWorld(true);
    this.updateBoxes();
  }
  /** 追加の 箱（置いた ブロック。setExtras に わたした 順。世界の 座標） */
  get extraBoxes(): readonly Box[] { return this.xboxes; }
  /** 当たりの 箱（hits）の 数。これ 以上の 番号は 追加の 箱 */
  get hitBoxCount(): number { return this.hitCount; }
  /** 箱 n の 関節（追加の 箱も 含む） */
  jointOfBox(n: number): JointName | null { return this.boxes[n]?.joint ?? null; }
}
