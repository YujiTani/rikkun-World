// 建てた 家の 記録（HOUSE-1C PR-1 #340。仕様 docs/design/HOUSE-1.md §2.11・§2.13・AC52）と、戸を とおった ときの 名前の 帯（§2.13・AC34）。DOM・three なし。
// 記録は 戸の マスで おぼえる（戸が こわれると 消える）。この PR では 保存しない（建築の 手順と 保存は PR-2）。
// 名前の 帯は 毎ステップ 世界を 読まない: プレイヤーの 足もとの マスが かわった ときだけ 戸の マスの 表を 1 回 引く（毎ステップ 引く 数は 高々 1 件）。
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

/** 名前の 帯を 出して おく 長さ（ステップ。3 秒） */
export const BAND_STEPS = 180;

/** 戸の マス (x, z) → 表の 番号（x・z は ±百万 の はんい） */
const keyOf = (x: number, z: number): number => (x + 1048576) * 2097152 + (z + 1048576);

export class HouseBook {
  private readonly recs: HouseRec[] = [];
  private readonly byDoor = new Map<number, HouseRec>();
  private nextId = 1;
  /** 名前の 帯: のこり ステップ（0 ＝ 出て いない）と 出して いる 字 */
  private band = { ticks: 0, text: '' };
  private prevX = Number.NaN;
  private prevZ = Number.NaN;
  /** 毎ステップの しらべで 引いた 記録の 数（テスト用。1 ステップで 高々 1） */
  lookups = 0;

  add(r: Omit<HouseRec, 'id'>): HouseRec {
    const rec: HouseRec = { ...r, id: this.nextId++, door: { ...r.door }, outer: { ...r.outer } };
    this.recs.push(rec);
    this.byDoor.set(keyOf(rec.door.x, rec.door.z), rec);
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
    const rec = this.byDoor.get(keyOf(x, z));
    if (!rec || rec.door.y !== y) return;
    const d = doorInfo(now);
    if (d && !d.top) {
      rec.doorOpen = d.open;
      return;
    }
    this.byDoor.delete(keyOf(x, z));
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
   * 1 ステップ。プレイヤーが 外から 戸の マスに 入った（足もとの マスが かわって、さっきは 戸の すぐ 外がわ〔南〕の 列〔横 1 マス まで〕）とき だけ 帯を 出す。
   * 中を 歩く・出る・テレポート〔さっきの マスから 1 マス より 遠い〕・かべの あなから 入る ときは 出さない。
   */
  step(p: Vec3): void {
    if (this.band.ticks > 0) this.band.ticks--;
    const cx = Math.floor(p.x);
    const cz = Math.floor(p.z);
    if (cx === this.prevX && cz === this.prevZ) return;
    const px = this.prevX;
    const pz = this.prevZ;
    this.prevX = cx;
    this.prevZ = cz;
    if (Math.abs(cx - px) > 1 || Math.abs(cz - pz) > 1) return; // はじめて・テレポート
    this.lookups++;
    const rec = this.byDoor.get(keyOf(cx, cz));
    if (!rec || cz !== pz - 1 || Math.abs(p.y - rec.door.y) > 1.5) return; // 外（南）から 北へ 入った
    this.band = { ticks: BAND_STEPS, text: rec.name };
  }

  /** 窓口 `ui.houseNameBand()`。出て いなければ null */
  nameBand(): { text: string; ticksLeft: number } | null {
    return this.band.ticks > 0 ? { text: this.band.text, ticksLeft: this.band.ticks } : null;
  }

  view(r: HouseRec): HouseView {
    return { id: r.id, name: r.name, number: r.number, outer: { ...r.outer }, door: { ...r.door }, doorOpen: r.doorOpen };
  }
}
