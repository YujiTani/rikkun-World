import * as THREE from 'three';

/** ねらっている妖怪のふちどりの黄色（--rk-accent に近い）。点滅させない */
export const YOKAI_FOCUS_COLOR = 0xffd23f;
const BAR = 0.025;
const PAD = 0.06;

/**
 * ねらっている妖怪の まわりに 黄色い枠（箱の 12 本のふち）を出す。見た目だけ（当たり判定は変えない）。
 * 毎ステップ update(id か null)。メッシュは 12 本を使いまわす。
 */
export class YokaiFocus {
  readonly group = new THREE.Group();
  private readonly bars: THREE.Mesh[] = [];
  private readonly box = new THREE.Box3();
  private readonly size = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private id: number | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly bounds: (id: number, out: THREE.Box3) => boolean,
  ) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: YOKAI_FOCUS_COLOR, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 3;
      this.bars.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  update(id: number | null): void {
    this.id = null;
    this.group.visible = false;
    if (id === null || !this.bounds(id, this.box)) return;
    this.id = id;
    this.box.expandByScalar(PAD);
    this.box.getSize(this.size);
    this.box.getCenter(this.center);
    const { x: sx, y: sy, z: sz } = this.size;
    let i = 0;
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        this.place(i++, sx, BAR, BAR, 0, a * sy / 2, b * sz / 2);
        this.place(i++, BAR, sy, BAR, a * sx / 2, 0, b * sz / 2);
        this.place(i++, BAR, BAR, sz, a * sx / 2, b * sy / 2, 0);
      }
    }
    this.group.visible = true;
  }

  private place(i: number, w: number, h: number, d: number, x: number, y: number, z: number): void {
    const m = this.bars[i];
    m.scale.set(w + BAR, h + BAR, d + BAR);
    m.position.set(this.center.x + x, this.center.y + y, this.center.z + z);
  }

  /** いま ふちどりを付けている妖怪の id */
  current(): number | null {
    return this.id;
  }
}
