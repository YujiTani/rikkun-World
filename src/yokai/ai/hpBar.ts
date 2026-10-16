import * as THREE from 'three';
import { boxGeo } from '../common';

import type { YokaiTitle } from '../../contracts';

export type { YokaiTitle };
export type HpBarColor = 'white' | 'yellow' | 'red';
export type HpBarIcon = 'oyabun' | 'taisho' | 'nushi';

/** BALANCE.md §4.7 */
export const HP_BAR = {
  /** 本数の上限 */
  maxBars: 20,
  /** ふつうの妖怪: たたかれてから出す ステップ */
  ticks: 180,
  /** 二つ名の妖怪: この距離（ブロック）以内ならいつも出す */
  titleRange: 16,
  /** 横はばの上限（ブロック） */
  maxWidth: 1.6,
  /** 1 本の たかさ */
  barHeight: 0.26,
} as const;

export interface HpBarState {
  visible: boolean;
  bars: number;
  left: number;
  color: HpBarColor;
  icon: HpBarIcon | null;
}

/** 本数・残りの本数・色（体力が 0 より大きい間は 残り 1 本以上） */
export function hpBarModel(hp: number, maxHp: number): { bars: number; left: number; color: HpBarColor } {
  const max = Math.max(1, maxHp);
  const h = Math.min(Math.max(hp, 0), max);
  const bars = Math.min(max, HP_BAR.maxBars);
  let left = Math.ceil((bars * h) / max);
  if (h > 0 && left < 1) left = 1;
  const color: HpBarColor = h * 3 < max ? 'red' : h * 2 < max ? 'yellow' : 'white';
  return { bars, left, color };
}

/** 出すか・アイコンは何か。dist = プレイヤーまでの水平の距離、ticksLeft = たたかれてからの 残り ステップ */
export function hpBarState(hp: number, maxHp: number, title: YokaiTitle, dist: number, ticksLeft: number): HpBarState {
  const m = hpBarModel(hp, maxHp);
  const icon: HpBarIcon | null = title === 'none' ? null : title;
  const visible = ticksLeft > 0 || (icon !== null && dist <= HP_BAR.titleRange);
  return { visible, ...m, icon };
}

/** 1 本の ふち（間隔・はば）。20 本で 1.6 ブロック以内 */
export function hpBarLayout(bars: number): { pitch: number; width: number; total: number } {
  const pitch = Math.min(0.12, HP_BAR.maxWidth / Math.max(1, bars));
  const width = pitch * 0.6;
  return { pitch, width, total: (bars - 1) * pitch + width };
}

const COLORS: Record<HpBarColor | 'gray', number> = { white: 0xffffff, yellow: 0xffd54f, red: 0xe53935, gray: 0x555555 };
const mats = new Map<string, THREE.MeshBasicMaterial>();
function mat(c: HpBarColor | 'gray'): THREE.MeshBasicMaterial {
  let m = mats.get(c);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: COLORS[c] });
    mats.set(c, m);
  }
  return m;
}

const iconTex = new Map<number, THREE.CanvasTexture>();
function starTexture(n: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  let t = iconTex.get(n);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 64 * n;
    c.height = 64;
    const g = c.getContext('2d');
    if (g) {
      g.font = '56px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#FFD54F';
      g.strokeStyle = '#000';
      g.lineWidth = 4;
      for (let i = 0; i < n; i++) {
        g.strokeText('★', 32 + 64 * i, 34);
        g.fillText('★', 32 + 64 * i, 34);
      }
    }
    t = new THREE.CanvasTexture(c);
    iconTex.set(n, t);
  }
  return t;
}

export function disposeHpBarMaterials(): void {
  for (const m of mats.values()) m.dispose();
  mats.clear();
  for (const t of iconTex.values()) t.dispose();
  iconTex.clear();
}

const STAR_COUNT: Record<HpBarIcon, number> = { oyabun: 1, taisho: 2, nushi: 3 };

/** 頭の上の 体力のバー（細い長方形を 横に ならべる）。点滅しない */
export class HpBar {
  readonly group = new THREE.Group();
  private readonly rects: THREE.Mesh[] = [];
  private iconMesh: THREE.Mesh | null = null;
  private key = '';

  constructor() {
    this.group.visible = false;
  }

  show(s: HpBarState): void {
    const key = `${s.bars}|${s.left}|${s.color}|${s.icon}`;
    this.group.visible = true;
    if (key === this.key) return;
    this.key = key;
    const { pitch, width, total } = hpBarLayout(s.bars);
    while (this.rects.length < s.bars) {
      const m = new THREE.Mesh(boxGeo(1, HP_BAR.barHeight, 0.04), mat('white'));
      this.rects.push(m);
      this.group.add(m);
    }
    for (let i = 0; i < this.rects.length; i++) {
      const m = this.rects[i]!;
      m.visible = i < s.bars;
      m.material = mat(i < s.left ? s.color : 'gray');
      m.scale.x = width;
      m.position.set(-total / 2 + width / 2 + i * pitch, 0, 0);
    }
    if (this.iconMesh) this.iconMesh.visible = false;
    if (s.icon) {
      const n = STAR_COUNT[s.icon];
      const tex = starTexture(n);
      if (tex) {
        const h = HP_BAR.barHeight * 1.5;
        if (!this.iconMesh) {
          this.iconMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
          );
          this.group.add(this.iconMesh);
        }
        const im = this.iconMesh;
        (im.material as THREE.MeshBasicMaterial).map = tex;
        (im.material as THREE.MeshBasicMaterial).needsUpdate = true;
        im.scale.set(h * n, h, 1);
        im.position.set(-total / 2 - h * n / 2 - 0.05, 0, 0.03);
        im.visible = true;
      }
    }
  }

  hide(): void {
    this.group.visible = false;
  }

  /** 二つ名のアイコンの板を捨てる（長方形の形・色と、アイコンの絵は みんなで使うので ここでは捨てない） */
  dispose(): void {
    if (this.iconMesh) {
      this.iconMesh.geometry.dispose();
      (this.iconMesh.material as THREE.Material).dispose();
      this.group.remove(this.iconMesh);
      this.iconMesh = null;
    }
    this.group.removeFromParent();
  }

  get shown(): boolean {
    return this.group.visible;
  }

  /** 見えている 長方形の数 */
  get rectCount(): number {
    return this.rects.filter((r) => r.visible).length;
  }
}
