import * as THREE from 'three';

/**
 * 地面に ねかせた 丸い 影の 板を いくつか まとめて 1 つの 形に した もの（DOM なし）。
 * 1 まい = 四角（一辺 size・ワールドの 座標）。こさ alpha は 頂点の 色の 透明度（板ごとに ちがう こさに できる）。
 * 何まい あっても 1 回の 描画に なる ので、プレイヤーの 影に 建築士さんの 影を まぜて 描画回数を ふやさない（HOUSE-1A）。
 */
export class BlobQuads {
  readonly geometry = new THREE.BufferGeometry();
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;

  constructor(readonly count: number) {
    const uv = new Float32Array(count * 8);
    const idx = new Uint16Array(count * 6);
    const col = new Float32Array(count * 16).fill(1);
    for (let i = 0; i < count; i++) {
      // 四すみ（x0,z0）（x0,z1）（x1,z1）（x1,z0）。うえから 見て 反時計まわり（おもてが 上）
      uv.set([0, 0, 0, 1, 1, 1, 1, 0], i * 8);
      idx.set([0, 1, 2, 0, 2, 3].map((k) => i * 4 + k), i * 6);
    }
    this.pos = new THREE.BufferAttribute(new Float32Array(count * 12), 3);
    this.col = new THREE.BufferAttribute(col, 4);
    this.geometry.setAttribute('position', this.pos);
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setAttribute('color', this.col);
    this.geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  }

  /** i 番目の 板を (x, y, z) の 上に、一辺 size・こさ alpha で 置く。size が 0 なら 何も 描かれない */
  set(i: number, x: number, y: number, z: number, size: number, alpha: number): void {
    const h = size / 2;
    const p = this.pos.array as Float32Array;
    const o = i * 12;
    p.set([x - h, y, z - h, x - h, y, z + h, x + h, y, z + h, x + h, y, z - h], o);
    const c = this.col.array as Float32Array;
    for (let k = 0; k < 4; k++) c[i * 16 + k * 4 + 3] = alpha;
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
  }

  /** i 番目の 板を 見えなく する */
  hide(i: number): void {
    this.set(i, 0, 0, 0, 0, 0);
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
