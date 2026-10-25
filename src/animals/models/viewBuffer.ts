import type { AnimalView } from '../../contracts';

/**
 * `animals.forEachVisible(fn)` の 結果を 使いまわしの 配列に 集める（しくみ側が 同じ 入れ物を 使いまわしても 安全 に
 * コピーする）。毎ステップ `fill()` → `fx.step(views, eye)`、描く ときは 同じ 配列を `update()` に わたす。
 */
export class ViewBuffer {
  private readonly items: AnimalView[] = [];
  private n = 0;
  readonly views: AnimalView[] = [];

  fill(api: { forEachVisible(fn: (v: AnimalView) => void): void }): readonly AnimalView[] {
    this.n = 0;
    api.forEachVisible((v) => {
      let o = this.items[this.n];
      if (!o) o = this.items[this.n] = { ...v };
      else Object.assign(o, v);
      this.n++;
    });
    this.views.length = this.n;
    for (let i = 0; i < this.n; i++) this.views[i] = this.items[i];
    return this.views;
  }
}
