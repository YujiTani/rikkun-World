import * as THREE from 'three';

/**
 * 街の なおしの 小さな まとめ絵（足場・るすの ふだ用）。設計の 絵（public/town/repair/*.png）を キャンバスに 並べる。
 * 絵が 読みこまれる まえは 色（color）で うめる。1 点 ＝ 1 ドット。UV は 絵の 場所だけで きまる（読みこみ 順に よらない）。
 */
export interface AtlasItem {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 絵の ファイル（public から）。なければ color だけ */
  url?: string;
  color: string;
}

const BASE = './town/repair/';

export class RepairAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly items = new Map<string, AtlasItem>();
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly w: number,
    private readonly h: number,
    items: readonly AtlasItem[],
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    for (const it of items) {
      this.items.set(it.name, it);
      this.ctx.fillStyle = it.color;
      this.ctx.fillRect(it.x, it.y, it.w, it.h);
      if (it.url !== undefined) this.load(it);
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  private load(it: AtlasItem): void {
    const img = new Image();
    img.onload = () => {
      this.ctx.drawImage(img, it.x, it.y, it.w, it.h);
      this.texture.needsUpdate = true;
    };
    img.src = `${BASE}${it.url}`;
  }

  /** 絵 name の 中の (px, py)（絵の 左上が 0, 0。下向きが +y）の UV */
  uv(name: string, px: number, py: number, out: { u: number; v: number }): void {
    const it = this.items.get(name)!;
    out.u = (it.x + px) / this.w;
    out.v = 1 - (it.y + py) / this.h;
  }

  size(name: string): { w: number; h: number } {
    const it = this.items.get(name)!;
    return { w: it.w, h: it.h };
  }

  dispose(): void {
    this.texture.dispose();
  }
}
