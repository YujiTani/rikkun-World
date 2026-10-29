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
  private readonly height_: number;

  constructor(opts: { height?: number } = {}) {
    this.height_ = opts.height ?? GADGET_TUNING.kite.height;
  }

  /** 上がっていなければ あげる、上がっていれば もどす */
  toggle(player: Vec3): 'up' | 'down' {
    if (this.isUp) {
      this.isUp = false;
      return 'down';
    }
    const K = GADGET_TUNING.kite;
    this.isUp = true;
    this.age = 0;
    this.rise = 0;
    this.pos = { x: player.x + K.offset, y: player.y, z: player.z + K.offset };
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
    const tx = player.x + K.offset + Math.sin(ph) * K.sway;
    const tz = player.z + K.offset + Math.cos(ph * 0.7) * K.sway;
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
