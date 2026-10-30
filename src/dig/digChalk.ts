import type { TargetInfo } from '../contracts';
import {
  CHALK_NORMAL,
  COMPASS_STEP,
  chalkAlongWall,
  chalkFaceOfNormal,
  chalkInfo,
  chalkMarkId,
  type ChalkFace,
  type Compass,
} from '../world/blocks/chalkMark';
import type { DigCore } from './digCore';

/**
 * チョークの 数（MINE-1B #349。docs/design/MINE-1.md §4.4「チョーク」）。1 か所の 表。
 */
export const CHALK_TUNING = {
  /** チョークの アイテム id */
  item: 'chalk',
  /** 足あとを 1 つ おぼえる 間かく（歩数。60 歩数 = 1 秒 なので 0.1 秒ごと） */
  trailEveryTicks: 6,
  /** 足あとを 来た ほうに 数える 長さ（歩数。10 秒） */
  trailKeepTicks: 600,
  /** 足あとを おぼえる 数（10 秒 ÷ 0.1 秒 ＋ 余り 4 つ） */
  trailSize: 104,
  /** 「来た ほう」に 数える 足あとの 遠さ（マス。今の 足の 位置から 横に これ 以上 はなれて いた もの） */
  trailMinDistance: 3,
  /** これ より 大きく とんだ とき（マス。1 回の 足あとの 間で）は ワープと みなして 足あとを わすれる */
  trailJumpDistance: 8,
  /** かべで「どちらとも 言えない」来た ほうの はば（かべの 正面からの 角度の 余弦。cos 30° ＝ ±30 度） */
  wallFrontCos: Math.cos(Math.PI / 6),
  /** 見て いる 向きが かべに まっすぐと みなす はば（かべに そう 向きの 成分。0〜1。約 3 度） */
  wallStraightEps: 0.05,
} as const;

/** (x, z) の 向きに いちばん 近い 北・東・南・西（同じなら 南北） */
function nearestCompass(x: number, z: number): Compass {
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'e' : 'w') : z > 0 ? 's' : 'n';
}

/**
 * チョークで かく 係（右クリック）。ゆか・かべに しるし（`chalk_mark*`）を 1 マス 置く。
 * 来た ほうを さす やじるしの ために、毎ステップ 足あとを 少しずつ おぼえる（新しい 物を 作らない 輪の 入れもの）。
 */
export class DigChalk {
  private readonly trailX = new Float32Array(CHALK_TUNING.trailSize);
  private readonly trailZ = new Float32Array(CHALK_TUNING.trailSize);
  private readonly trailAt = new Int32Array(CHALK_TUNING.trailSize);
  /** 次に 書く 場所・おぼえている 数・この 係の 歩数 */
  private head = 0;
  private count = 0;
  private steps = 0;
  /** `cameFrom` の 答え（今の 足から 足あとへの 向き。毎回 つくらず 書きかえる） */
  private outX = 0;
  private outZ = 0;

  constructor(private readonly c: DigCore) {}

  /** 毎ステップ。足の 位置 (x, z) を 少しずつ おぼえる */
  step(x: number, z: number): void {
    const k = CHALK_TUNING;
    if (this.steps++ % k.trailEveryTicks !== 0) return;
    if (this.count > 0) {
      const last = (this.head - 1 + k.trailSize) % k.trailSize;
      if (Math.hypot(x - this.trailX[last]!, z - this.trailZ[last]!) > k.trailJumpDistance) this.count = 0; // とんだ → 前の 足あとは 来た ほうでは ない
    }
    this.trailX[this.head] = x;
    this.trailZ[this.head] = z;
    this.trailAt[this.head] = this.steps;
    this.head = (this.head + 1) % k.trailSize;
    if (this.count < k.trailSize) this.count++;
  }

  /** いま 右クリックで かけるか（ヒントも この 答えを 使う）。毎フレーム 呼ばれても 新しい 物を 作らない */
  canDraw(): boolean {
    const c = this.c;
    const t = c.tgt();
    if (!t || c.bodyTgt() || c.inventory.held()?.item !== CHALK_TUNING.item) return false;
    if (chalkInfo(t.id)) return true; // しるしを ねらって いる → かきなおせる
    if (chalkFaceOfNormal(t.face.x, t.face.y, t.face.z) === null) return false; // 天井（下の 面）など
    if (!c.world.isSolid(t.block.x, t.block.y, t.block.z)) return false; // 固く ない ブロック（たいまつ・くさ など）
    return c.world.getBlock(t.place.x, t.place.y, t.place.z) === 'air'; // 前の マスが 空気（水・ほかの ブロックでは ない）
  }

  /**
   * かく。ねらった 面の 前の マスに しるし、チョーク 1 へる。しるしを ねらって いたら かきなおし（押しなおした ときだけ。向きが かわる ときだけ チョーク 1 へる）。
   * `fresh` = 右クリックを 押した ステップ（押しっぱなしの くりかえしでは しるしの かきなおしは しない）
   */
  draw(t: TargetInfo, fresh: boolean): void {
    const c = this.c;
    if (!this.canDraw()) return;
    const old = chalkInfo(t.id);
    let cell = t.place;
    let face: ChalkFace;
    if (old) {
      if (!fresh) return; // 同じ マスは 押しつづけても 1 回 だけ
      cell = t.block;
      face = old.face;
    } else {
      face = chalkFaceOfNormal(t.face.x, t.face.y, t.face.z)!;
    }
    const id = chalkMarkId(face, this.dirFor(face));
    if (!id || id === t.id) return;
    if (!c.world.setBlock(cell.x, cell.y, cell.z, id)) return;
    c.inventory.consumeHeld();
    c.m4.tools?.pushSwing('place');
    c.emit({ type: 'place', tick: c.tick(), block: { x: cell.x, y: cell.y, z: cell.z }, id });
  }

  /** 今の 足から 3 マス 以上 はなれた、10 秒 いないで いちばん 新しい 足あとへの 向きを `outX/outZ` に 入れる。なければ false */
  private cameFrom(px: number, pz: number): boolean {
    const k = CHALK_TUNING;
    const min2 = k.trailMinDistance * k.trailMinDistance;
    for (let i = 0; i < this.count; i++) {
      const j = (this.head - 1 - i + k.trailSize) % k.trailSize;
      if (this.steps - this.trailAt[j]! > k.trailKeepTicks) return false; // これ より 古い 足あとは ない
      const dx = this.trailX[j]! - px;
      const dz = this.trailZ[j]! - pz;
      if (dx * dx + dz * dz >= min2) {
        this.outX = dx;
        this.outZ = dz;
        return true;
      }
    }
    return false;
  }

  /**
   * やじるしの 向き（来た ほう。足あとが なければ 見て いる 向きの 反対）。
   * ゆか ＝ いちばん 近い 北・東・南・西。かべ ＝ かべに そった 2 つの うち 来た ほうに 近い ほう。
   * 来た ほうが かべの 正面から ±30 度 なら どちらとも 言えない ので、見て いる 向きが よって いる ほう（まっすぐ なら かべを 見て 右）
   */
  private dirFor(face: ChalkFace): Compass {
    const p = this.c.player();
    const yaw = (p.yawDeg * Math.PI) / 180;
    const lookX = Math.sin(yaw);
    const lookZ = -Math.cos(yaw);
    let cx = -lookX;
    let cz = -lookZ;
    if (this.cameFrom(p.position.x, p.position.z)) {
      cx = this.outX;
      cz = this.outZ;
    }
    const along = chalkAlongWall(face);
    if (!along) return nearestCompass(cx, cz);
    const [a, b] = along;
    const [ax, az] = COMPASS_STEP[a];
    const n = CHALK_NORMAL[face];
    const len = Math.hypot(cx, cz) || 1;
    if ((cx * n[0] + cz * n[2]) / len < CHALK_TUNING.wallFrontCos) return cx * ax + cz * az >= 0 ? a : b;
    const side = lookX * ax + lookZ * az; // a の ほうへ 見て いる とき 正
    if (Math.abs(side) >= CHALK_TUNING.wallStraightEps) return side > 0 ? a : b;
    // まっすぐ かべを 見て いる → 見ている 向き f ＝ かべの 向きの 反対 の 右 ＝ (n.z, -n.x)
    return n[2] * ax - n[0] * az > 0 ? a : b;
  }
}
