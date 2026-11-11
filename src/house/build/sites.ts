// 建てられる 場所を さがす（HOUSE-1C PR-2 #340。仕様 §4.7・決め 8・AC19）。DOM・three なし。上空の 視点に 入る ときに 1 回 だけ 世界を 読む（毎ステップ 読まない）。
import type { BlockId } from '../../contracts';
import { KATAME_TSUCHI } from '../../world/blocks/buildBlocks';
import { isVanishingFlora } from '../../world/blocks/flora';
import { KEEP_OUT, SITE } from './tuning';

export interface SiteWorld {
  getBlock(x: number, y: number, z: number): BlockId | 'outside';
}
export interface Site {
  /** 外の 箱の 北西（−x・−z）の すみ。y ＝ 床の 段の 高さ */
  x: number;
  y: number;
  z: number;
}
/** 使われて いる 場所（建築中の 家）。この 箱と 重なる 場所は 数えない */
export interface UsedBox {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
}

/** はじめの 家の 箱の 高さ（床 1 ＋ 中 3 ＋ やね 1）。KEEP_OUT.levels ＋ 1 */
const DEFAULT_H = KEEP_OUT.levels + 1;

const clear = (id: BlockId | 'outside'): boolean => id === 'air' || isVanishingFlora(id);

/** 北西の すみ (x, y, z)・外の 大きさ outW×outD の 場所に 建てられるか。戸は まえ（南）の かべの 外 doorX（箱の 北西からの ずれ）に ある */
/** h ＝ 家の 箱の 高さ（houseBox の h。はじめは いつもの 5）。しらべる 段は 床の 上 1 〜 h − 1 */
export function siteOk(world: SiteWorld, x: number, y: number, z: number, outW: number, outD: number, doorX: number, h = DEFAULT_H): boolean {
  for (let dz = 0; dz < outD; dz++) for (let dx = 0; dx < outW; dx++) if (world.getBlock(x + dx, y, z + dz) !== KATAME_TSUCHI) return false;
  for (let up = 1; up <= h - 1; up++) for (let dz = 0; dz < outD; dz++) for (let dx = 0; dx < outW; dx++) if (!clear(world.getBlock(x + dx, y + up, z + dz))) return false;
  // 戸の 前の 外 1 マスの 床の 段の 上 2 段（出られない 家に ならない ように）
  for (let up = 1; up <= SITE.doorFrontClear; up++) if (!clear(world.getBlock(x + doorX, y + up, z + outD))) return false;
  return true;
}

const overlaps = (s: Site, outW: number, outD: number, u: UsedBox): boolean =>
  s.x < u.x + u.w && u.x < s.x + outW && s.z < u.z + u.d && u.z < s.z + outD && Math.abs(s.y - u.y) <= KEEP_OUT.levels;

/**
 * プレイヤー（足もとの 列 px・pz・floor 高さ py）の まわり（横 searchHoriz・上下 searchVert）の 場所を ぜんぶ。近い 順。
 * まず かためた つちの 長方形だけ 速く 見つけて（段ごとの 表）から、上の 空気と 戸の 前を しらべる
 */
export function findSites(world: SiteWorld, px: number, py: number, pz: number, outW: number, outD: number, doorX: number, used: readonly UsedBox[] = [], limit = 400, h = DEFAULT_H): Site[] {
  const H = SITE.searchHoriz;
  const x0 = px - H;
  const z0 = pz - H;
  const cols = 2 * H + outW + 1;
  const rows = 2 * H + outD + 1;
  const found: Site[] = [];
  for (let y = py - SITE.searchVert; y <= py + SITE.searchVert; y++) {
    // かためた つちの 表（1 = かためた つち）と その 累計（長方形の 中が ぜんぶ かためた つち かを 一度に 見る）
    const sum = new Int32Array((cols + 1) * (rows + 1));
    let any = false;
    for (let j = 0; j < rows; j++) {
      let run = 0;
      for (let i = 0; i < cols; i++) {
        const hit = world.getBlock(x0 + i, y, z0 + j) === KATAME_TSUCHI ? 1 : 0;
        if (hit) any = true;
        run += hit;
        sum[(j + 1) * (cols + 1) + i + 1] = sum[j * (cols + 1) + i + 1]! + run;
      }
    }
    if (!any) continue;
    for (let j = 0; j + outD <= rows; j++) {
      for (let i = 0; i + outW <= cols; i++) {
        const nx = x0 + i;
        const nz = z0 + j;
        if (Math.abs(nx - px) > H || Math.abs(nz - pz) > H) continue;
        const area = sum[(j + outD) * (cols + 1) + i + outW]! - sum[j * (cols + 1) + i + outW]! - sum[(j + outD) * (cols + 1) + i]! + sum[j * (cols + 1) + i]!;
        if (area !== outW * outD) continue;
        const s: Site = { x: nx, y, z: nz };
        if (used.some((u) => overlaps(s, outW, outD, u))) continue;
        if (siteOk(world, nx, y, nz, outW, outD, doorX, h)) found.push(s);
      }
    }
  }
  const d2 = (s: Site): number => (s.x + outW / 2 - px) ** 2 + (s.z + outD / 2 - pz) ** 2 + (s.y - py) ** 2 * 4;
  found.sort((a, b) => d2(a) - d2(b) || a.y - b.y || a.z - b.z || a.x - b.x);
  return found.slice(0, limit);
}
