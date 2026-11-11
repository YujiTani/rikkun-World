// 建てた 家の 記録（HOUSE-1C PR-1 #340。仕様 docs/design/HOUSE-1.md §2.11・§2.13・AC52）と、戸を とおった ことの 見はり（§3.3・AC26）。DOM・three なし。
// 記録は 戸の マス (x, y, z) で おぼえる（戸が こわれると 消える）。この PR では 保存しない（建築の 手順と 保存は PR-2）。
// 見はりは 毎ステップ 世界を 読まない: プレイヤーの 足もとの マスが かわった ときだけ 戸の マスの 表を 引く（毎ステップ 引く 数は 高々 1 件）。
// 名前の 帯そのものは 上の 帯の 列（ui/celebrate の TopBandModel）が 出す。ここは「外 → 戸 → 中」に 入った 家を 知らせる だけ。
import type { Vec3 } from '../contracts';
import { doorInfo } from '../world/blocks/houseBlocks';
import type { Blueprint } from './editor/blueprint';
import { houseShape } from './shape';

/** 建てた 家の 形（場所ごとの しゅるいを 引く もと。HOUSE-2B。古い セーブには ない） */
export interface HouseSpec {
  /** 外の 箱の 北西の すみ・床の 段 */
  at: Vec3;
  w: Blueprint['w'];
  d: Blueprint['d'];
  windows: number;
  roof: Blueprint['roof'];
  wall: Blueprint['wall'];
  windowKind: Blueprint['windowKind'];
  door: Blueprint['door'];
  deco: Blueprint['deco'];
  light: Blueprint['light'];
}

/** 場所 1 つの しゅるい（見た目の 係が 引く）。rx・ry・rz ＝ 外の 箱の 北西・床の 段からの ずれ、ow・od・h ＝ 家の 箱 */
export interface LookCell {
  look: string;
  rx: number;
  ry: number;
  rz: number;
  ow: number;
  od: number;
  h: number;
}

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
  /** 建てた 形（HOUSE-2B。場所ごとの しゅるい〔lookAt〕を 引く もと） */
  spec?: HouseSpec;
}

/** 窓口 `houses()` の 1 件（記録の 中身から 前・後ろの 文字を のぞいた もの） */
export type HouseView = Omit<HouseRec, 'front' | 'back' | 'spec'>;

/** 戸の 下の マス (x, y, z) → 表の 番号（x・z は ±百万、y は 0〜255 の はんい） */
/** 見はりの おぼえ 1 人分: 前の マスと、外（南）から 戸の マスに 入った 家（つぎの 1 歩で 中〔北〕へ 行けば 帯。ほかへ 行けば わすれる） */
interface Watch {
  prevX: number;
  prevZ: number;
  via: HouseRec | null;
}
const newWatch = (): Watch => ({ prevX: Number.NaN, prevZ: Number.NaN, via: null });

const keyOf = (x: number, y: number, z: number): number => ((x + 1048576) * 2097152 + (z + 1048576)) * 256 + y;

export class HouseBook {
  private readonly recs: HouseRec[] = [];
  private readonly byDoor = new Map<number, HouseRec>();
  private nextId = 1;
  /** 場所ごとの しゅるいの おぼえ（記録ごと。spec から 作る。保存は しない） */
  private readonly looks = new WeakMap<HouseRec, Array<string | undefined>>();
  /** 見はりの おぼえ（人ごと。1P の 動きが 2P の 判定を こわさない。[0] ＝ 1P、[1] ＝ 2P） */
  private readonly watch: [Watch, Watch] = [newWatch(), newWatch()];
  /** 毎ステップの しらべで 引いた 記録の 数（テスト用。1 ステップで 高々 1） */
  lookups = 0;

  add(r: Omit<HouseRec, 'id'>): HouseRec {
    const rec: HouseRec = { ...r, id: this.nextId++, door: { ...r.door }, outer: { ...r.outer } };
    if (r.spec) rec.spec = { ...r.spec, at: { ...r.spec.at }, deco: [...r.spec.deco] };
    this.recs.push(rec);
    this.byDoor.set(keyOf(rec.door.x, rec.door.y, rec.door.z), rec);
    return rec;
  }

  list(): readonly HouseRec[] {
    return this.recs;
  }

  /** 保存（HOUSE-1C PR-2。記録の 写し。次の 番号は 持たない: 読みこむ とき 一番 大きい id の 次から） */
  serialize(): HouseRec[] {
    return this.recs.map((r) => ({ ...r, door: { ...r.door }, outer: { ...r.outer }, ...(r.spec ? { spec: { ...r.spec, at: { ...r.spec.at }, deco: [...r.spec.deco] } } : {}) }));
  }

  /** 読みこむ（前の 記録は すてる）。形が おかしい 1 件は とばす。キーが ない（前の セーブ）なら 家なし */
  restore(raw: unknown): void {
    this.recs.length = 0;
    this.byDoor.clear();
    this.nextId = 1;
    this.watch[0] = newWatch();
    this.watch[1] = newWatch();
    if (!Array.isArray(raw)) return;
    const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
    for (const x of raw as unknown[]) {
      const r = x as Partial<Record<keyof HouseRec, unknown>> | null;
      const door = r?.door as Record<string, unknown> | undefined;
      const outer = r?.outer as Record<string, unknown> | undefined;
      if (!r || !int(r.id) || !int(r.number) || typeof r.front !== 'string' || typeof r.back !== 'string' || !door || !int(door.x) || !int(door.y) || !int(door.z) || !outer || !int(outer.w) || !int(outer.d)) continue;
      const rec: HouseRec = { id: r.id, name: r.front + r.back, front: r.front, back: r.back, number: r.number, outer: { w: outer.w, d: outer.d }, door: { x: door.x, y: door.y, z: door.z }, doorOpen: r.doorOpen === true };
      const spec = parseSpec(r.spec);
      if (spec) rec.spec = spec;
      this.recs.push(rec);
      this.byDoor.set(keyOf(rec.door.x, rec.door.y, rec.door.z), rec);
      this.nextId = Math.max(this.nextId, rec.id + 1);
    }
  }

  /** 世界の 場所 (x, y, z) が どの 家の どの しゅるいか（家の 記録が なければ・箱の 外・床や 家具の マスは null） */
  cellOf(x: number, y: number, z: number): LookCell | null {
    for (const r of this.recs) {
      const s = r.spec;
      if (!s) continue;
      const rx = x - s.at.x;
      const ry = y - s.at.y;
      const rz = z - s.at.z;
      const ow = s.w + 2;
      const od = s.d + 2;
      if (rx < 0 || rz < 0 || rx >= ow || rz >= od || ry < 0) continue;
      let looks = this.looks.get(r);
      if (!looks) {
        looks = houseShape({ ...s, furniture: [] }).cells.map((c) => c.look);
        this.looks.set(r, looks);
      }
      const h = looks.length / (ow * od);
      if (ry >= h) continue;
      const look = looks[(ry * od + rz) * ow + rx];
      return look === undefined ? null : { look, rx, ry, rz, ow, od, h };
    }
    return null;
  }

  /** 世界の 場所の しゅるいの id（例 `kawara_shiro`）。記録に ない 場所は null（手で 置いた ブロック。案の 記録は 2C） */
  lookAt(x: number, y: number, z: number): string | null {
    return this.cellOf(x, y, z)?.look ?? null;
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
  step(p: Vec3, who: 1 | 2 = 1): HouseRec | null {
    const w = this.watch[who - 1]!;
    const cx = Math.floor(p.x);
    const cz = Math.floor(p.z);
    if (cx === w.prevX && cz === w.prevZ) return null;
    const px = w.prevX;
    const pz = w.prevZ;
    w.prevX = cx;
    w.prevZ = cz;
    const via = w.via;
    w.via = null;
    if (Math.abs(cx - px) > 1 || Math.abs(cz - pz) > 1) return null; // はじめて・テレポート
    this.lookups++;
    if (via && cx === via.door.x && cz === via.door.z - 1) return via; // 外 → 戸 → 中
    const rec = this.doorBelow(cx, p.y, cz);
    if (rec && cz === pz - 1) w.via = rec; // 外（南）から 戸の マスへ
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

/** 保存の spec を 読む（形が おかしければ null＝ 場所ごとの しゅるいは 引かない） */
function parseSpec(raw: unknown): HouseSpec | null {
  const r = raw as Record<string, unknown> | null;
  const at = r?.at as Record<string, unknown> | undefined;
  const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  const str = (v: unknown): v is string => typeof v === 'string';
  if (!r || !at || !int(at.x) || !int(at.y) || !int(at.z) || !int(r.w) || !int(r.d) || !int(r.windows) || !str(r.roof) || !str(r.wall) || !str(r.windowKind) || !str(r.door) || !str(r.light) || !Array.isArray(r.deco) || !r.deco.every(str)) return null;
  return { at: { x: at.x, y: at.y, z: at.z }, w: r.w as HouseSpec['w'], d: r.d as HouseSpec['d'], windows: r.windows, roof: r.roof as HouseSpec['roof'], wall: r.wall as HouseSpec['wall'], windowKind: r.windowKind as HouseSpec['windowKind'], door: r.door as HouseSpec['door'], deco: r.deco as HouseSpec['deco'], light: r.light as HouseSpec['light'] };
}
