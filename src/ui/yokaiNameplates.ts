import * as THREE from 'three';
import './yokaiNameplates.css';

export interface NameplateItem {
  id: number;
  text: string;
  /** 名前を置く ワールドの位置（バーの上） */
  x: number;
  y: number;
  z: number;
  /** プレイヤーまでの水平の距離（近い方を前に） */
  dist: number;
}

const v = new THREE.Vector3();

/** 頭の上の名前を HTML で出す（毎ステップ update。使い回しの div。画面のはしでは中へ寄せる） */
export class YokaiNameplates {
  private readonly pool: HTMLDivElement[] = [];

  constructor(private readonly parent: HTMLElement) {}

  update(items: readonly NameplateItem[], camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 遠い方から並べて、近い方を前に
    const sorted = items.length > 1 ? [...items].sort((a, b) => b.dist - a.dist) : items;
    let n = 0;
    for (const it of sorted) {
      v.set(it.x, it.y, it.z).project(camera);
      if (v.z > 1 || v.z < -1) continue; // うしろ
      const el = this.el(n++);
      if (el.textContent !== it.text) el.textContent = it.text;
      el.hidden = false;
      const hw = el.offsetWidth / 2;
      const hh = el.offsetHeight;
      const px = Math.min(Math.max((v.x * 0.5 + 0.5) * w, hw + 4), w - hw - 4);
      const py = Math.min(Math.max((-v.y * 0.5 + 0.5) * h, hh + 4), h - hh - 4);
      el.style.transform = `translate(${(px - hw).toFixed(1)}px, ${(py - hh).toFixed(1)}px)`;
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i]!.hidden = true;
  }

  private el(i: number): HTMLDivElement {
    let e = this.pool[i];
    if (!e) {
      e = document.createElement('div');
      e.className = 'yokai-nameplate';
      e.hidden = true;
      this.parent.append(e);
      this.pool.push(e);
    }
    return e;
  }
}
