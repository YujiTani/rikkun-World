import { Color, type Material, type Object3D } from 'three';

/** 暗くするなかま。block = ブロック・海など、doll = 妖怪・人形 */
export type LightGroup = 'block' | 'doll';

interface Entry {
  group: LightGroup;
  /** 暗くする前の色 */
  base: Color;
}

type Colored = Material & { color: Color };

const hasColor = (m: Material): m is Colored => (m as Partial<Colored>).color instanceof Color;

/**
 * 「明るさを渡す仕組み」（M3 §3.2）。
 * 材料を登録しておくと、setLevels() のたびに「もとの色 × 明るさ」にそろえる（既存の材料は書きかえない。登録した材料だけ）。
 * 暗くしないもの（ちょうちんの胴・火の玉・ふくろ・光の柱・目の白）は登録しないか、`userData.noDim = true` をつけておく。
 *
 * 色をあとから変える（たたかれて白く光る、など）ときは、material.color を直接変えず
 * setBase(material, hex) を使う（明るさをかけた色が入る）。
 */
export class Lighting {
  private readonly entries = new Map<Material, Entry>();
  private block = 1;
  private doll = 1;

  /** 材料を登録する（色を持たない材料は無視）。同じ材料を 2 回登録しても 1 つだけ */
  register(material: Material, group: LightGroup): void {
    if (!hasColor(material)) return;
    if (material.userData.noDim === true) return;
    const found = this.entries.get(material);
    if (found) {
      found.group = group;
      return;
    }
    this.entries.set(material, { group, base: material.color.clone() });
    this.applyOne(material, this.entries.get(material)!);
  }

  /** 形ぜんぶの材料を登録する（userData.noDim のメッシュは飛ばす）。登録した数を返す */
  registerTree(root: Object3D, group: LightGroup): number {
    let n = 0;
    root.traverse((o) => {
      if (o.userData.noDim === true) return;
      const m = (o as Partial<{ material: Material | Material[] }>).material;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) {
        const before = this.entries.size;
        this.register(x, group);
        n += this.entries.size - before;
      }
    });
    return n;
  }

  unregister(material: Material): void {
    const e = this.entries.get(material);
    if (!e) return;
    if (hasColor(material)) material.color.copy(e.base);
    this.entries.delete(material);
  }

  /** 暗くする前の色を変える（登録していない材料なら、そのまま色を変える） */
  setBase(material: Material, hex: number): void {
    const e = this.entries.get(material);
    if (!e) {
      if (hasColor(material)) material.color.setHex(hex);
      return;
    }
    e.base.setHex(hex);
    this.applyOne(material, e);
  }

  setLevels(block: number, doll: number): void {
    if (block === this.block && doll === this.doll) return;
    this.block = block;
    this.doll = doll;
    for (const [m, e] of this.entries) this.applyOne(m, e);
  }

  level(group: LightGroup): number {
    return group === 'block' ? this.block : this.doll;
  }

  size(): number {
    return this.entries.size;
  }

  private applyOne(m: Material, e: Entry): void {
    if (!hasColor(m)) return;
    m.color.copy(e.base).multiplyScalar(this.level(e.group));
  }
}
