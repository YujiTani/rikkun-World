import type { YokaiBase } from '../yokai/common';

/**
 * ねらっている妖怪の ふちどりを出す・隠す係。ふちどりのメッシュは 妖怪のモデルの一部（YokaiBase が作る）で、
 * ここは 「いま どの妖怪か」を覚えて setFocus / updateFocus を呼ぶだけ。
 * 描画回数の増え方: ねらっている妖怪 1 体の箱の数だけ（ねらっていなければ 0）。見た目だけで当たり判定は変えない。
 */
export class YokaiFocus {
  private id: number | null = null;
  private model: YokaiBase | null = null;

  constructor(
    private readonly modelOf: (id: number) => YokaiBase | null,
    private readonly camera: () => { x: number; y: number; z: number },
  ) {}

  update(id: number | null): void {
    const model = id === null ? null : this.modelOf(id);
    if (model !== this.model) {
      this.model?.setFocus(false);
      this.model = model;
    }
    this.id = model ? id : null;
    if (!model) return;
    model.setFocus(true);
    const c = this.camera();
    const p = model.root.position;
    model.updateFocus(Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z));
  }

  current(): number | null {
    return this.id;
  }

  /** ふちどりの複製の数（いま出ている分） */
  hullCount(): number {
    return this.model?.focused() ? this.model.focusHullCount() : 0;
  }
}
