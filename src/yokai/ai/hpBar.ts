import * as THREE from 'three';
import { boxGeo } from '../common';
import { nickIconPixels } from '../../ui/itemArtBal';
import type { Rgba } from '../../world/blocks/textures';

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
  /** 1 本の たかさ（DESIGN 13.3） */
  barHeight: 0.18,
  /** 1 本の はば・すきま（20 本で 0.06 × 20 ＋ 0.02 × 19 = 1.58） */
  barWidth: 0.06,
  barGap: 0.02,
  /** アイコンの高さ（バーの高さの 1.5 倍まで）・アイコンとバーの あいだ */
  iconHeight: 0.27,
  iconGap: 0.05,
  /** うしろの 下じき */
  underlayColor: 0x10141f,
  underlayOpacity: 0.55,
  underlayPad: 0.03,
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

/** 1 本の ふち（間隔・はば）。20 本で 1.58 ブロック（1.6 以内） */
export function hpBarLayout(bars: number): { pitch: number; width: number; total: number } {
  const width = HP_BAR.barWidth;
  const pitch = width + HP_BAR.barGap;
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

/** アイコンの 絵（16×16 の丸いバッジ。★ の文字ではない） */
export function hpBarIconPixels(icon: HpBarIcon): Rgba[] {
  return nickIconPixels(icon);
}

const iconTex = new Map<HpBarIcon, THREE.DataTexture>();
/** ドットのまま（ぼかさない）。DataTexture は 下の行が先 */
function iconTexture(icon: HpBarIcon): THREE.DataTexture {
  let t = iconTex.get(icon);
  if (!t) {
    const px = hpBarIconPixels(icon);
    const data = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const c = px[y * 16 + x]!;
        const i = ((15 - y) * 16 + x) * 4;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = c[3];
      }
    t = new THREE.DataTexture(data, 16, 16, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    iconTex.set(icon, t);
  }
  return t;
}

let underlayMaterial: THREE.MeshBasicMaterial | null = null;
function underlayMat(): THREE.MeshBasicMaterial {
  underlayMaterial ??= new THREE.MeshBasicMaterial({
    color: HP_BAR.underlayColor,
    transparent: true,
    opacity: HP_BAR.underlayOpacity,
    depthWrite: false,
  });
  return underlayMaterial;
}

export function disposeHpBarMaterials(): void {
  for (const m of mats.values()) m.dispose();
  mats.clear();
  for (const t of iconTex.values()) t.dispose();
  iconTex.clear();
  underlayMaterial?.dispose();
  underlayMaterial = null;
}

export interface HpBarIconInfo {
  tier: HpBarIcon;
  /** ドットのまま（ぼかさない）か */
  nearest: boolean;
  width: number;
  height: number;
  /** バーの左はしと アイコンの右はしの あいだ */
  gap: number;
}

/** 頭の上の 体力のバー（細い長方形を 横に ならべる）。点滅しない */
export class HpBar {
  readonly group = new THREE.Group();
  private readonly rects: THREE.Mesh[] = [];
  private iconMesh: THREE.Mesh | null = null;
  private under: THREE.Mesh | null = null;
  private info: HpBarIconInfo | null = null;
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
    // 下じき（バー ＋ アイコンの うしろ）
    const iconH = HP_BAR.iconHeight;
    const pad = HP_BAR.underlayPad;
    const left = -total / 2 - (s.icon ? iconH + HP_BAR.iconGap : 0) - pad;
    const right = total / 2 + pad;
    const h = (s.icon ? Math.max(iconH, HP_BAR.barHeight) : HP_BAR.barHeight) + pad * 2;
    if (!this.under) {
      this.under = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), underlayMat());
      this.under.renderOrder = -1;
      this.group.add(this.under);
    }
    this.under.material = underlayMat();
    this.under.scale.set(right - left, h, 1);
    this.under.position.set((left + right) / 2, 0, -0.03);

    if (this.iconMesh) this.iconMesh.visible = false;
    this.info = null;
    if (s.icon) {
      if (!this.iconMesh) {
        this.iconMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
        );
        this.group.add(this.iconMesh);
      }
      const im = this.iconMesh;
      const tex = iconTexture(s.icon);
      const m = im.material as THREE.MeshBasicMaterial;
      if (m.map !== tex) {
        m.map = tex;
        m.needsUpdate = true;
      }
      im.scale.set(iconH, iconH, 1);
      im.position.set(-total / 2 - HP_BAR.iconGap - iconH / 2, 0, 0.03);
      im.visible = true;
      this.info = { tier: s.icon, nearest: tex.magFilter === THREE.NearestFilter, width: iconH, height: iconH, gap: HP_BAR.iconGap };
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
    if (this.under) {
      this.under.geometry.dispose();
      this.group.remove(this.under);
      this.under = null;
    }
    this.group.removeFromParent();
  }

  /** アイコンの 大きさ・場所の 記録（テスト用）。アイコンが 無ければ null */
  get iconInfo(): HpBarIconInfo | null {
    return this.group.visible ? this.info : null;
  }

  /** うしろの 下じき（テスト用） */
  get underlay(): THREE.Mesh | null {
    return this.under;
  }

  get shown(): boolean {
    return this.group.visible;
  }

  /** 見えている 長方形の数 */
  get rectCount(): number {
    return this.rects.filter((r) => r.visible).length;
  }
}
