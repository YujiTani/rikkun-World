import type { Inventory, ItemId, Vec3 } from '../../contracts';
import { TOWN_ITEM } from '../../content/items/ids';
import { OFUDA_TUNING } from './vendorTable';

/**
 * かえりの おふだの 係（TOWN-1 1E。docs/design/TOWN-1-shop.md §2.10・§4.7・AC32、TOWN-1.md §5）。画面・three なし。
 * 手に もって つかう → ため（chargeSteps）→ ひろば（`town.info().plaza`）の そばの 立てる マスへ うつり、おふだが 1 まい へる。
 * ため の 間に 歩いても・たたかれても やめない。やられたら うつらず へらない。わかない はんいの 中では つかえない（へらない・ふきだし）。
 * 2 人の ときは つかった 人 だけ うつる。
 */

type Who = 1 | 2;
const OFUDA: ItemId = TOWN_ITEM.kaeri_ofuda;

export interface OfudaPorts {
  /** その 人の もちもの（2P が いなければ null） */
  inventory(who: Who): Pick<Inventory, 'held' | 'count' | 'remove'> | null;
  /** その 人の 足もと（いなければ null） */
  pos(who: Who): Vec3 | null;
  alive(who: Who): boolean;
  /** わかない はんいの 中か（街が なければ false） */
  inSafe(x: number, z: number): boolean;
  /** もどる 所（街が なければ null） */
  plaza(): Vec3 | null;
  /** その マスに 体が 入れる（空気） */
  open(x: number, y: number, z: number): boolean;
  /** その マスの 上に 立てる（かたい ブロック） */
  ground(x: number, y: number, z: number): boolean;
  /** その マス（足もと y・頭 y+1）に who 以外の 人・妖怪・動物の 体が かかる */
  bodyAt(who: Who, x: number, y: number, z: number): boolean;
  /** その 人を うつす（足もと。速さは 0） */
  move(who: Who, to: Vec3): void;
  /** ため が はじまった・うつった・つかえなかった（見た目・音・ふきだし。なくても よい） */
  started?(who: Who): void;
  arrived?(who: Who, at: Vec3): void;
  refused?(who: Who): void;
}

/** 行き先の しらべ（体の 2 マスが あいて いて 足もとが かたい・ほかの 体が ない） */
export interface OfudaDestPorts {
  open(x: number, y: number, z: number): boolean;
  ground(x: number, y: number, z: number): boolean;
  body(x: number, y: number, z: number): boolean;
}

/** ひろばの まわりの さがす じゅん（近い 順。同じ きょりは z → x の 順。1 回 だけ 作る） */
const RING: readonly (readonly [number, number])[] = (() => {
  const r = OFUDA_TUNING.searchRadius - 1;
  const out: [number, number, number][] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dz) <= r) out.push([dx, dz, Math.hypot(dx, dz)]);
  out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return out.map(([dx, dz]) => [dx, dz] as const);
})();
/** 高さの さがす じゅん（ひろばの 高さ → 1 上 → 1 下 → …） */
const RISE: readonly number[] = (() => {
  const out = [0];
  for (let d = 1; d <= OFUDA_TUNING.searchRise; d++) out.push(d, -d);
  return out;
})();

/** ひろばの そばの 立てる マス（足もとの まん中）。どこも なければ ひろば */
export function ofudaDest(plaza: Vec3, p: OfudaDestPorts): Vec3 {
  const cx = Math.floor(plaza.x);
  const cz = Math.floor(plaza.z);
  const cy = Math.floor(plaza.y);
  for (const [dx, dz] of RING) {
    const x = cx + dx;
    const z = cz + dz;
    for (const dy of RISE) {
      const y = cy + dy;
      if (p.ground(x, y - 1, z) && p.open(x, y, z) && p.open(x, y + 1, z) && !p.body(x, y, z)) return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  return { x: plaza.x, y: plaza.y, z: plaza.z };
}

export class OfudaService {
  /** ため の のこり（ステップ。ためて いなければ null）[1P, 2P] */
  private readonly charge: [number | null, number | null] = [null, null];

  constructor(private readonly ports: OfudaPorts) {}

  /** 窓口 `ofuda.state(p)` */
  state(who: Who): { charging: number | null } {
    return { charging: this.charge[who - 1]! };
  }

  /** ため の すすみ 0〜1（ためて いなければ null。光の 強さ） */
  progress(who: Who): number | null {
    const c = this.charge[who - 1]!;
    return c === null ? null : 1 - c / OFUDA_TUNING.chargeSteps;
  }

  /** 手に もって つかう（右クリック）。もって いない・もう ためて いる・やられて いる ときは 何も しない */
  use(who: Who): void {
    const inv = this.ports.inventory(who);
    const at = this.ports.pos(who);
    if (!inv || !at || inv.held()?.item !== OFUDA || this.charge[who - 1] !== null || !this.ports.alive(who)) return;
    if (this.ports.plaza() === null) return; // 街の ない 世界
    if (this.ports.inSafe(at.x, at.z)) {
      this.ports.refused?.(who); // 「もう まちに いるよ」（へらない）
      return;
    }
    this.charge[who - 1] = OFUDA_TUNING.chargeSteps;
    this.ports.started?.(who);
  }

  /** 2P が やめた など: ため を やめる */
  cancel(who: Who): void {
    this.charge[who - 1] = null;
  }

  /** 毎ステップ（世界が 動いて いる 間） */
  step(): void {
    this.stepOne(1);
    this.stepOne(2);
  }

  private stepOne(who: Who): void {
    const c = this.charge[who - 1];
    if (c === null) return;
    const inv = this.ports.inventory(who);
    if (!inv || !this.ports.alive(who)) {
      this.charge[who - 1] = null; // やられた ＝ うつらない・へらない
      return;
    }
    if (c > 1) {
      this.charge[who - 1] = c - 1;
      return;
    }
    this.charge[who - 1] = null;
    const plaza = this.ports.plaza();
    if (!plaza || inv.remove(OFUDA, 1) < 1) return;
    const to = ofudaDest(plaza, {
      open: (x, y, z) => this.ports.open(x, y, z),
      ground: (x, y, z) => this.ports.ground(x, y, z),
      body: (x, y, z) => this.ports.bodyAt(who, x, y, z),
    });
    this.ports.move(who, to);
    this.ports.arrived?.(who, to);
  }
}
