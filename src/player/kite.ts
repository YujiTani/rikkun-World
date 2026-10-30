import type { ItemId, Vec3 } from '../contracts';
import { GADGET_ID, GADGET_TUNING } from '../content/items/gadgetTuning';

/**
 * たこ（ITEM-FX-1 AC8〜AC10）。持って右クリックで、糸つきで プレイヤーの上空へ のぼり、ゆらゆら 揺れる。
 * もう一度 右クリックか、たこ以外を 持つと 戻る（消える。たこ アイテムは なくならない）。
 * 当たり判定なし・妖怪にも ダメージにも さわらない（見た目だけ）。数は GADGET_TUNING.kite。
 */
export class KiteSystem {
  /** 当たり判定なし */
  readonly solid = false;
  private isUp = false;
  private age = 0;
  /** のぼった 高さの 割合 0〜1 */
  private rise = 0;
  private pos: Vec3 = { x: 0, y: 0, z: 0 };
  /** あげた とき の 向き（水平の 単位ベクトル。向きを 渡さなければ 真上） */
  private dirX = 0;
  private dirZ = 0;
  private readonly height_: number;

  constructor(opts: { height?: number } = {}) {
    this.height_ = opts.height ?? GADGET_TUNING.kite.height;
  }

  /** 上がっていなければ あげる、上がっていれば もどす */
  /** yawDeg = プレイヤーの 向き（0 = 北 -z・90 = 東 +x）。渡すと その 前方へ ななめに あがる */
  toggle(player: Vec3, yawDeg?: number): 'up' | 'down' {
    if (this.isUp) {
      this.isUp = false;
      return 'down';
    }
    this.isUp = true;
    this.age = 0;
    this.rise = 0;
    const yaw = ((yawDeg ?? 0) * Math.PI) / 180;
    this.dirX = yawDeg === undefined ? 0 : Math.sin(yaw);
    this.dirZ = yawDeg === undefined ? 0 : -Math.cos(yaw);
    this.pos = { x: player.x, y: player.y, z: player.z };
    return 'up';
  }

  /** たこ以外を 持ったら もどす */
  onHeld(item: ItemId | null): void {
    if (item !== GADGET_ID.kite) this.isUp = false;
  }

  /** 毎ステップ。プレイヤーの まわりを ついてくる */
  update(player: Vec3): void {
    if (!this.isUp) return;
    const K = GADGET_TUNING.kite;
    this.age++;
    this.rise = Math.min(1, this.rise + 1 / K.riseSteps);
    const ph = (this.age / K.swayPeriodSteps) * Math.PI * 2;
    const ease = this.rise * this.rise * (3 - 2 * this.rise);
    // 水平: ずれ + ゆらゆら（プレイヤーが 動くと ゆっくり ついてくる）
    // 前方へ ななめに: 水平の きょり = 高さ ÷ tan(角度)。のぼりながら ひろがる
    const run = (this.height_ / Math.tan((K.angleDeg * Math.PI) / 180)) * ease;
    const tx = player.x + this.dirX * run + Math.sin(ph) * K.sway;
    const tz = player.z + this.dirZ * run + Math.cos(ph * 0.7) * K.sway;
    this.pos.x += (tx - this.pos.x) * K.follow;
    this.pos.z += (tz - this.pos.z) * K.follow;
    // 高さ: 足もと → 上空（ゆらゆらは ±sway 以内）
    this.pos.y = player.y + (this.height_ + Math.sin(ph * 1.3) * K.sway) * ease;
  }

  up(): boolean {
    return this.isUp;
  }
  position(): Vec3 | null {
    return this.isUp ? this.pos : null;
  }
  /** プレイヤーの 足もとから たこまでの 高さ */
  height(player: Vec3): number | null {
    return this.isUp ? this.pos.y - player.y : null;
  }
}
