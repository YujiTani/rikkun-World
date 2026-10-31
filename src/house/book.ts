// 建てた 家の 記録（HOUSE-1C PR-1 #340。仕様 docs/design/HOUSE-1.md §2.11・§2.13・AC52）と、戸を とおった ことの 見はり（§3.3・AC26）。DOM・three なし。
// 記録は 戸の マス (x, y, z) で おぼえる（戸が こわれると 消える）。この PR では 保存しない（建築の 手順と 保存は PR-2）。
// 見はりは 毎ステップ 世界を 読まない: プレイヤーの 足もとの マスが かわった ときだけ 戸の マスの 表を 引く（毎ステップ 引く 数は 高々 1 件）。
// 名前の 帯そのものは 上の 帯の 列（ui/celebrate の TopBandModel）が 出す。ここは「外 → 戸 → 中」に 入った 家を 知らせる だけ。
import type { Vec3 } from '../contracts';
import { doorInfo } from '../world/blocks/houseBlocks';

export interface HouseRec {
  id: number;
  /** 前の 文字 ＋ 後ろの 文字（建てた ときの せっけいずの 名前。なまえを かえる で かわる） */
  name: string;
  front: string;
  back: string;
  /** せっけいずの 番号 */
  number: number;
  /** 外の 寸法（中の よこ・たて ＋ 2） */
  outer: { w: number; d: number };
  /** 戸の 下の マス */
  door: Vec3;
  doorOpen: boolean;
}

/** 窓口 `houses()` の 1 件（記録の 中身から 前・後ろの 文字を のぞいた もの） */
export type HouseView = Omit<HouseRec, 'front' | 'back'>;

/** 戸の 下の マス (x, y, z) → 表の 番号（x・z は ±百万、y は 0〜255 の はんい） */
const keyOf = (x: number, y: number, z: number): number => ((x + 1048576) * 2097152 + (z + 1048576)) * 256 + y;

export class HouseBook {
  private readonly recs: HouseRec[] = [];
  private readonly byDoor = new Map<number, HouseRec>();
  private nextId = 1;
  private prevX = Number.NaN;
  private prevZ = Number.NaN;
  /** 外（南）から 戸の マスに 入った 家（つぎの 1 歩で 中〔北〕へ 行けば 帯。ほかへ 行けば わすれる） */
  private via: HouseRec | null = null;
  /** 毎ステップの しらべで 引いた 記録の 数（テスト用。1 ステップで 高々 1） */
  lookups = 0;

  add(r: Omit<HouseRec, 'id'>): HouseRec {
    const rec: HouseRec = { ...r, id: this.nextId++, door: { ...r.door }, outer: { ...r.outer } };
    this.recs.push(rec);
    this.byDoor.set(keyOf(rec.door.x, rec.door.y, rec.door.z), rec);
    return rec;
  }

  list(): readonly HouseRec[] {
    return this.recs;
  }

  get(id: number): HouseRec | null {
    return this.recs.find((r) => r.id === id) ?? null;
  }

  count(): number {
    return this.recs.length;
  }

  /** なまえを かえた。新しい 名前（前の 文字 ＋ 後ろの 文字） */
  rename(id: number, front: string, back: string): boolean {
    const r = this.get(id);
    if (!r) return false;
    r.front = front;
    r.back = back;
    r.name = front + back;
    return true;
  }

  /** 戸の 下の マスの 外の 変化（blockWatch から）。しまった・あいた 戸なら doorOpen を 合わせ、戸で なくなったら 記録を 消す */
  cellChanged(x: number, y: number, z: number, now: string): void {
    const rec = this.byDoor.get(keyOf(x, y, z));
    if (!rec) return;
    const d = doorInfo(now);
    if (d && !d.top) {
      rec.doorOpen = d.open;
      return;
    }
    this.byDoor.delete(keyOf(x, y, z));
    this.recs.splice(this.recs.indexOf(rec), 1);
  }

  /** 箱 (x0, y0, z0)〜(x1, y1, z1) を ぜんぶ now に した（fill）。箱の 中に 戸の 下の マスが ある 記録だけ しらべなおす */
  boxFilled(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, now: string): void {
    const lo = (a: number, b: number): number => Math.min(a, b);
    const hi = (a: number, b: number): number => Math.max(a, b);
    for (const r of [...this.recs]) {
      const d = r.door;
      if (d.x >= lo(x0, x1) && d.x <= hi(x0, x1) && d.y >= lo(y0, y1) && d.y <= hi(y0, y1) && d.z >= lo(z0, z1) && d.z <= hi(z0, z1)) this.cellChanged(d.x, d.y, d.z, now);
    }
  }

  /**
   * 1 ステップ。プレイヤーが「外（南）→ 戸の マス → 中（すぐ 北）」と 通った 家を 返す（名前の 帯を 出す 合図）。ほかは null。
   * 戸の マスに 入って すぐ 外へ もどる・中を 歩く・出る・テレポート〔さっきの マスから 1 マス より 遠い〕・かべの あなから 入る ときは 返さない。
   */
  step(p: Vec3): HouseRec | null {
    const cx = Math.floor(p.x);
    const cz = Math.floor(p.z);
    if (cx === this.prevX && cz === this.prevZ) return null;
    const px = this.prevX;
    const pz = this.prevZ;
    this.prevX = cx;
    this.prevZ = cz;
    const via = this.via;
    this.via = null;
    if (Math.abs(cx - px) > 1 || Math.abs(cz - pz) > 1) return null; // はじめて・テレポート
    this.lookups++;
    if (via && cx === via.door.x && cz === via.door.z - 1) return via; // 外 → 戸 → 中
    const rec = this.doorBelow(cx, p.y, cz);
    if (rec && cz === pz - 1) this.via = rec; // 外（南）から 戸の マスへ
    return null;
  }

  /** (x, z) の 柱で、足の 高さ y の ちかく〔±1.5〕に 戸の 下の マスが ある 家 */
  private doorBelow(x: number, y: number, z: number): HouseRec | null {
    const fy = Math.floor(y + 1e-6);
    for (const yy of [fy, fy - 1, fy + 1]) {
      const rec = this.byDoor.get(keyOf(x, yy, z));
      if (rec && Math.abs(y - rec.door.y) <= 1.5) return rec;
    }
    return null;
  }

  view(r: HouseRec): HouseView {
    return { id: r.id, name: r.name, number: r.number, outer: { ...r.outer }, door: { ...r.door }, doorOpen: r.doorOpen };
  }
}
