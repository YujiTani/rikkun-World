import * as THREE from 'three';
import { LIGHT_CONFIG } from '../../world/light/config';
import type { TimeOfDay, YokaiInfo } from '../../contracts';
import type { StaggerBook } from '../stagger';
import { titleLabel } from '../title';
import { applyDollBrightness } from './brightness';
import { DEG, type Ent, type YokaiField } from './entity';
import { HP_BAR, HpBar, hpBarState, type HpBarState } from './hpBar';
import type { YokaiManagerOptions } from './managerTypes';

/**
 * 見た目の係: 頭の上の体力バー・名前・よろけアイコン、暗さ（明るさ）、画面やテストの窓口に見せる情報。
 * 妖怪の動きは決めない（Ent を読んで、model と HpBar を動かすだけ）。
 */
export class YokaiPresenter {
  private lastBrightness = 1;

  constructor(
    private readonly group: THREE.Group,
    private readonly f: YokaiField,
    private readonly time: Pick<TimeOfDay, 'dollBrightness'>,
    private readonly opts: Pick<YokaiManagerOptions, 'light' | 'lightMin'>,
    private readonly stag: Pick<StaggerBook, 'ids' | 'hasDouble'>,
  ) {}

  /** 暗さ（暗くしないものは brightness.ts が除く）。光があれば足もとの光、なければ時刻だけ */
  applyLight(): void {
    const light = this.opts.light;
    if (light) {
      const min = this.opts.lightMin ?? LIGHT_CONFIG.yokaiMin;
      for (const e of this.f.ents) {
        const bb = Math.max(min, light.brightness(e.x, e.y + 0.5, e.z));
        if (bb !== e.bright) {
          e.bright = bb;
          applyDollBrightness(e.model, e.kind, bb, e.stage);
        }
      }
    } else {
      const b = this.time.dollBrightness();
      if (b !== 1 || this.lastBrightness !== 1) {
        for (const e of this.f.ents) applyDollBrightness(e.model, e.kind, b, e.stage);
      }
      this.lastBrightness = b;
    }
  }

  /** 体力のバーを 出す ステップの のこりを へらし、出ているものを 描きなおす */
  tickMarks(): void {
    for (const e of this.f.ents) {
      if (e.marksLeft > 0) e.marksLeft--;
      if (e.state === 'dying' || e.state === 'leaving') {
        e.marks?.hide();
        continue;
      }
      if (e.title === 'none' && !e.marks?.shown) continue;
      this.refreshBar(e);
    }
  }

  showMarks(e: Ent): void {
    e.marksLeft = HP_BAR.ticks;
    this.refreshBar(e);
  }

  barStateOf(e: Ent): HpBarState {
    const dist = Math.hypot(this.f.px - e.x, this.f.pz - e.z);
    return hpBarState(e.hp, e.maxHp, e.title, dist, e.marksLeft);
  }

  refreshBar(e: Ent): void {
    const s = this.barStateOf(e);
    if (!s.visible) {
      e.marks?.hide();
      return;
    }
    e.marks ??= new HpBar();
    if (e.marks.group.parent !== this.group) this.group.add(e.marks.group);
    e.marks.show(s);
    this.placeMarks(e);
  }

  private placeMarks(e: Ent): void {
    const m = e.marks!;
    m.group.position.set(e.x, e.y + e.dims.marksHeight, e.z);
    // プレイヤーの方を向く（板が見える向き）
    m.group.rotation.y = Math.atan2(this.f.px - e.x, this.f.pz - e.z);
  }

  nameVisible(e: Ent): boolean {
    if (e.title === 'none' || e.state === 'dying' || e.state === 'leaving') return false;
    return Math.hypot(this.f.px - e.x, this.f.pz - e.z) <= HP_BAR.titleRange;
  }

  // ---------------------------------------------------------------- 窓口に見せる情報

  infoOf(e: Ent): YokaiInfo {
    let yawDeg = (e.yaw / DEG) % 360;
    if (yawDeg < 0) yawDeg += 360;
    return {
      id: e.id,
      kind: e.kind,
      position: { x: e.x, y: e.y, z: e.z },
      yawDeg,
      hp: e.hp,
      maxHp: e.maxHp,
      state: e.state,
      attackTick: e.state === 'attack' ? e.attackSteps : 0,
      scale: e.state === 'dying' || e.state === 'leaving' ? e.model.scale : e.appearScale,
      name: e.model.displayName,
      title: e.title,
      m: e.m,
      attack: e.attack,
    };
  }

  /** ねらい の しるし（顔）を 置く 場所: 体力 の バー の すぐ 上。二つ名 の 名前 が 出て いる ときは `titled` */
  markAnchor(id: number): { x: number; y: number; z: number; titled: boolean } | null {
    const e = this.f.ents.find((q) => q.id === id);
    if (!e || e.remove || e.state === 'dying' || e.state === 'leaving') return null;
    return { x: e.x, y: e.y + e.dims.marksHeight + HP_BAR.barHeight * 0.75 + 0.1, z: e.z, titled: this.nameVisible(e) };
  }

  /** 体力のバーの 状態（テスト窓口 hud.hpBar 用）。いない id は null */
  hpBarInfo(id: number): HpBarState | null {
    const e = this.f.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    return this.barStateOf(e);
  }

  /** テスト窓口 yokai.palette 用: 色の段階・暗さ・いまの材料の色（テクスチャなし）・ぬりかべの もよう（2 色のテクスチャ）の色 */
  paletteInfo(id: number): { stage: 1 | 2 | 3; brightness: number; colors: number[]; textureColors: number[] } | null {
    const e = this.f.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    const colors = new Set<number>();
    const tex = new Set<number>();
    e.model.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const mm = m as THREE.MeshBasicMaterial;
        const data = (mm.map?.image as { data?: Uint8Array } | undefined)?.data;
        if (!mm.map) colors.add(mm.color.getHex());
        else if (data) {
          const own = new Set<number>();
          for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 0) own.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
          if (own.size <= 2 && !own.has(0x222222)) for (const c of own) tex.add(c);
        }
      }
    });
    return { stage: e.stage, brightness: e.bright, colors: [...colors], textureColors: [...tex] };
  }

  /** テスト窓口 yokai.marks 用: 頭の印・ヌシの光 */
  marksInfo(id: number): {
    mark: 'none' | 'hachimaki' | 'crown';
    markColors: number[];
    markOnHead: boolean;
    glow: null | { flames: number; visible: boolean; color: number; opacity: number; additive: boolean };
  } | null {
    const e = this.f.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    const n = e.model.nickInfo();
    let glow = null;
    if (n.glow) {
      // PROTOTYPE: 光の箱 → 青い ひとだま。flames = 個数、additive = false、color/opacity は 板 1 まいの もの
      const mesh = n.glow.children[0]?.children[0] as THREE.Mesh | undefined;
      const mat = mesh?.material as THREE.MeshBasicMaterial | undefined;
      glow = { flames: n.glow.children.length, visible: n.glow.visible, color: mat?.color.getHex() ?? 0, opacity: mat?.opacity ?? 0, additive: mat?.blending === THREE.AdditiveBlending };
    }
    return { mark: n.kind, markColors: n.markColors, markOnHead: n.markOnHead, glow };
  }

  /** 頭の上の名前（テスト窓口 hud.nameplate 用）。いない id は null。二つ名なしは visible = false */
  nameplateInfo(id: number): { visible: boolean; text: string } | null {
    const e = this.f.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    return { visible: this.nameVisible(e), text: titleLabel(e.model.displayName, e.title) };
  }

  /** 画面に出す名前の一覧（二つ名の妖怪で 16 ブロック以内。バーの上に置く） */
  nameplates(out: { id: number; text: string; x: number; y: number; z: number; dist: number }[] = []): typeof out {
    out.length = 0;
    for (const e of this.f.ents) {
      if (!this.nameVisible(e)) continue;
      out.push({
        id: e.id,
        text: titleLabel(e.model.displayName, e.title),
        x: e.x,
        y: e.y + e.dims.marksHeight + HP_BAR.barHeight * 0.75 + 0.1,
        z: e.z,
        dist: Math.hypot(this.f.px - e.x, this.f.pz - e.z),
      });
    }
    return out;
  }

  /** 画面の よろけアイコン用: 2 倍が のこっている 妖怪。頭の上の 位置（名前・バーより 上） */
  staggerIcons(out: { id: number; x: number; y: number; z: number; titled: boolean }[] = []): typeof out {
    out.length = 0;
    for (const id of this.stag.ids()) {
      const e = this.f.ents.find((q) => q.id === id);
      if (!e || e.state === 'dying' || e.state === 'leaving' || e.remove || !this.stag.hasDouble(id)) continue;
      out.push({ id, x: e.x, y: e.y + e.dims.marksHeight + HP_BAR.barHeight * 0.75 + 0.1, z: e.z, titled: e.title !== 'none' });
    }
    return out;
  }

  /** 窓口 `hud.staggerIcon(id)`: いない id は null。アイコンは 2 倍が のこっている あいだ 見える */
  staggerIconInfo(id: number): { visible: boolean } | null {
    const e = this.f.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    return { visible: e.state !== 'dying' && e.state !== 'leaving' && this.stag.hasDouble(id) };
  }
}
