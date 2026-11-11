import * as THREE from 'three';
import type { Rect } from '../duo/viewRects';
import { halfId } from './duoHalfIds';
import { clampToHalf, fullRect, ndcToHalf } from './halfProject';
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
const at = { x: 0, y: 0 };
const box = { x: 0, y: 0 };
/** 画面の はしに 寄せる すき間（px） */
const EDGE_PAD = 4;

/**
 * 頭の上の名前を HTML で出す（毎ステップ update。使い回しの div。画面のはしでは中へ寄せる）。
 * who = 2: 2 人の とき 2P の 半分に 出す もう 1 つ（COOP-1 5f-2 #21。半分ごとに 1 つずつ）
 */
export class YokaiNameplates {
  private readonly pool: HTMLDivElement[] = [];

  private readonly size = new WeakMap<HTMLElement, { vw: number; w: number; h: number }>();

  constructor(
    private readonly parent: HTMLElement,
    private readonly who: 1 | 2 = 1,
  ) {}

  private marked = false;

  /** 2 人の あいだ だけ UI 検査の 目印（data-testid）を 名札に つける */
  mark(on: boolean): void {
    this.marked = on;
    for (const e of this.pool) {
      if (on) e.setAttribute('data-testid', halfId('nameplate', this.who));
      else e.removeAttribute('data-testid');
    }
  }

  /**
   * half = この 名札を 出す 半分の 矩形（その 半分の カメラで 投げる ときだけ 渡す。1 人の ときは 省いて 画面ぜんたい）。
   * 2 人の ときは 区画ごとに その 区画の カメラ・矩形で 呼ぶ（duoHalves.ts の projectPane）
   */
  update(items: readonly NameplateItem[], camera: THREE.Camera, half: Rect | null = null): void {
    camera.updateMatrixWorld();
    const w = window.innerWidth;
    const hf = half ?? fullRect(w, window.innerHeight);
    // 遠い方から並べて、近い方を前に
    const sorted = items.length > 1 ? [...items].sort((a, b) => b.dist - a.dist) : items;
    let n = 0;
    for (const it of sorted) {
      v.set(it.x, it.y, it.z).project(camera);
      if (v.z > 1 || v.z < -1) continue; // うしろ
      const el = this.el(n++);
      const wasHidden = el.hidden;
      el.hidden = false;
      // 大きさは 文字が変わったとき・画面の大きさが変わったとき・出し直したときだけ測る
      let sz = this.size.get(el);
      if (el.textContent !== it.text || !sz || sz.vw !== w || wasHidden) {
        el.textContent = it.text;
        sz = { vw: w, w: el.offsetWidth, h: el.offsetHeight };
        this.size.set(el, sz);
      }
      const hw = sz.w / 2;
      const hh = sz.h;
      ndcToHalf(hf, v.x, v.y, at);
      const p = clampToHalf(hf, at.x, at.y, sz.w, hh, EDGE_PAD, hh + EDGE_PAD, box);
      el.style.transform = `translate(${(p.x - hw).toFixed(1)}px, ${(p.y - hh).toFixed(1)}px)`;
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i]!.hidden = true;
  }

  /** 全部 かくす（2P が やめた とき） */
  hideAll(): void {
    for (const e of this.pool) e.hidden = true;
  }

  private el(i: number): HTMLDivElement {
    let e = this.pool[i];
    if (!e) {
      e = document.createElement('div');
      e.className = 'yokai-nameplate';
      e.hidden = true;
      if (this.marked) e.setAttribute('data-testid', halfId('nameplate', this.who));
      this.parent.append(e);
      this.pool.push(e);
    }
    return e;
  }
}
