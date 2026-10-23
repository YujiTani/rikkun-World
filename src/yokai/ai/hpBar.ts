import * as THREE from 'three';
import { boxGeo } from '../common';
import { nickIconPixels } from '../../ui/itemArtBal';
import type { Rgba } from '../../world/blocks/textures';

import type { YokaiTitle } from '../../contracts';

export type { YokaiTitle };
export type HpBarIcon = 'oyabun' | 'taisho' | 'nushi';

/** BALANCE.md §4.7 */
export const HP_BAR = {
  /** 本数の上限 */
  maxBars: 20,
  /** 重ねる大きな塊の上限（6 段以上のこっていても 5 枚） */
  maxBig: 5,
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
  /** 大きな塊の数（のこりの段の数。見せるのは min(big, maxBig) 枚） */
  big: number;
  icon: HpBarIcon | null;
}

/** 細いバー・大きな塊の色（decisions/2026-10-23-hp-bar-chunks.md） */
export const HP_BAR_COLORS = {
  bar: 0xffd54f,
  empty: 0x555555,
  big: [0x43a047, 0x9ccc3c, 0xffd54f, 0xff9800, 0xe53935],
} as const;

/** 大きな塊の寸法とずらし方（トランプのように重ねる） */
const BIG_CHUNK = { size: 0.27, gap: 0.08, step: 0.05, rise: 0.025 } as const;
/** 縁どり（内: ほぼ黒の紺、外: 白っぽい） */
const EDGE = { inner: 0x0b1030, outer: 0xf4f4ff, innerPad: 0.012, outerPad: 0.026 } as const;

/**
 * 細いバーの本数・残り・大きな塊の数。
 * 最大 20 以下: 細いバーだけ。21 以上: 20 ずつの段（はしたは いちばん最後の段）。
 * 細いバーは今の段、塊は今の段より後ろにのこっている段の数。
 */
export function hpBarModel(hp: number, maxHp: number): { bars: number; left: number; big: number } {
  const max = Math.max(1, maxHp);
  const h = Math.min(Math.max(hp, 0), max);
  if (max <= HP_BAR.maxBars) {
    const bars = Math.min(max, HP_BAR.maxBars);
    let left = Math.ceil((bars * h) / max);
    if (h > 0 && left < 1) left = 1;
    return { bars, left, big: 0 };
  }
  const size = HP_BAR.maxBars;
  const m = Math.round(max);
  const hc = Math.min(Math.max(Math.ceil(h), 0), m);
  const stages = Math.ceil(m / size);
  const rest = m - size * (stages - 1); // いちばん最後の段の大きさ
  const j = Math.min(stages - 1, Math.floor((m - hc) / size));
  const last = j === stages - 1;
  const bars = last ? rest : size;
  const left = last ? hc : hc - (m - size * (j + 1));
  return { bars, left: Math.max(hc > 0 ? 1 : 0, left), big: stages - 1 - j };
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

const mats = new Map<number, THREE.MeshBasicMaterial>();
/** 色ごとに 1 つを みんなで使う */
function mat(c: number): THREE.MeshBasicMaterial {
  let m = mats.get(c);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: c });
    mats.set(c, m);
  }
  return m;
}

let unitPlane: THREE.PlaneGeometry | null = null;
/** 縁の板の形（1×1 を みんなで使う） */
function edgeGeo(): THREE.PlaneGeometry {
  return (unitPlane ??= new THREE.PlaneGeometry(1, 1));
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
  unitPlane?.dispose();
  unitPlane = null;
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
  private readonly cards: THREE.Mesh[] = [];
  /** 縁の板: [0,1] = 細いバー全体の 外・内、[2+2k, 3+2k] = 大きな塊 k 枚目の 外・内 */
  private readonly edges: THREE.Mesh[] = [];
  private iconMesh: THREE.Mesh | null = null;
  private under: THREE.Mesh | null = null;
  private info: HpBarIconInfo | null = null;
  private key = '';

  constructor() {
    this.group.visible = false;
  }

  show(s: HpBarState): void {
    const key = `${s.bars}|${s.left}|${s.big}|${s.icon}`;
    this.group.visible = true;
    if (key === this.key) return;
    this.key = key;
    const { pitch, width, total: barW } = hpBarLayout(s.bars);
    const nCards = Math.min(Math.max(s.big, 0), HP_BAR.maxBig);
    const stackW = nCards > 0 ? BIG_CHUNK.size + (nCards - 1) * BIG_CHUNK.step : 0;
    const stackH = nCards > 0 ? BIG_CHUNK.size + (nCards - 1) * BIG_CHUNK.rise : 0;
    const total = barW + (nCards > 0 ? BIG_CHUNK.gap + stackW : 0);
    const x0 = -total / 2;
    while (this.rects.length < s.bars) {
      const m = new THREE.Mesh(boxGeo(1, HP_BAR.barHeight, 0.04), mat(HP_BAR_COLORS.bar));
      this.rects.push(m);
      this.group.add(m);
    }
    for (let i = 0; i < this.rects.length; i++) {
      const m = this.rects[i]!;
      m.visible = i < s.bars;
      m.material = mat(i < s.left ? HP_BAR_COLORS.bar : HP_BAR_COLORS.empty);
      m.scale.x = width;
      m.position.set(x0 + width / 2 + i * pitch, 0, 0);
    }
    // 大きな塊（トランプのように ずらして 重ねる。手前ほど 大きい番号の色）
    while (this.cards.length < nCards) {
      const c = new THREE.Mesh(boxGeo(BIG_CHUNK.size, BIG_CHUNK.size, 0.04), mat(HP_BAR_COLORS.bar));
      this.cards.push(c);
      this.group.add(c);
    }
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]!;
      c.visible = i < nCards;
      if (i >= nCards) continue;
      const back = nCards - 1 - i; // 0 = 手前
      c.material = mat(HP_BAR_COLORS.big[i]!);
      const right = x0 + total - BIG_CHUNK.size / 2;
      c.position.set(right - back * BIG_CHUNK.step, back * BIG_CHUNK.rise - (stackH - BIG_CHUNK.size) / 2, -back * 0.03);
    }
    // 縁（外 → 内の順に うしろから）。細いバーは 20 本まとめて 1 まいずつ（すきまは 内の縁で うまる）
    const edge = (idx: number, k: 'inner' | 'outer', cx: number, cy: number, w: number, h: number, z: number) => {
      let m = this.edges[idx];
      if (!m) {
        m = new THREE.Mesh(edgeGeo(), mat(EDGE[k]));
        this.edges[idx] = m;
        this.group.add(m);
      }
      m.visible = true;
      m.scale.set(w, h, 1);
      m.position.set(cx, cy, z);
    };
    for (const k of ['outer', 'inner'] as const) {
      const pad = k === 'outer' ? EDGE.outerPad : EDGE.innerPad;
      const z = k === 'outer' ? -0.004 : -0.002;
      const o = k === 'outer' ? 0 : 1;
      edge(o, k, x0 + barW / 2, 0, barW + pad * 2, HP_BAR.barHeight + pad * 2, z);
      for (let i = 0; i < nCards; i++) {
        const c = this.cards[i]!;
        edge(2 + i * 2 + o, k, c.position.x, c.position.y, BIG_CHUNK.size + pad * 2, BIG_CHUNK.size + pad * 2, c.position.z + z);
      }
    }
    for (let i = 2 + nCards * 2; i < this.edges.length; i++) this.edges[i]!.visible = false;
    // 下じき（バー ＋ アイコンの うしろ）
    const iconH = HP_BAR.iconHeight;
    const pad = HP_BAR.underlayPad;
    const left = x0 - (s.icon ? iconH + HP_BAR.iconGap : 0) - pad;
    const right = total / 2 + pad;
    const h = Math.max(s.icon ? iconH : 0, HP_BAR.barHeight, stackH) + pad * 2;
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
      im.position.set(x0 - HP_BAR.iconGap - iconH / 2, 0, 0.03);
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

  /** 見えている 大きな塊の色（うしろ → 手前）（テスト用） */
  get bigCards(): number[] {
    return this.cards.filter((c) => c.visible).map((c) => (c.material as THREE.MeshBasicMaterial).color.getHex());
  }

  /** 見えている 長方形の数 */
  get rectCount(): number {
    return this.rects.filter((r) => r.visible).length;
  }
}
