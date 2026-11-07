import { SEA_Y } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { isFurnKind, K_TANSU } from '../blocks/houseBlocks';
import { SkyDarkness } from '../light/skyDarkness';
import { WorldLight } from '../light/WorldLight';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { cheb, ID, inSpan, type BokenShaft, type DeadEnd, type Tables } from './mineBokenKit';
import { SHAFT_CONFIG } from './mineShaftConfig';
import { GenCols, WALK_LIMIT, isBodyIndex, isSolidIndex, ptKey, standable, stepTo, walkDist, walkProblems, type Box3, type OldCols, type PathCell, type Pt } from './mineShaftKit';
import { heightAt } from './terrain';

/** MINE-1E を ブロックで しらべる 道具〔E3・E4・E7・E8・E9・E10。約束は mineBokenKit.ts の 冒頭〕。直した ほうが よい 所を 文で 返す〔空なら 合格〕 */

const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SIX: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// ------------------------------------------------------------------ ほった あと

/** 生成した 列に「ほった あと」〔ひび・くずれた いしを 空気に した 世界〕を かさねて 読む */
export class DugCols extends GenCols {
  constructor(
    seed: number,
    readonly dug: ReadonlySet<string>,
    oldCols?: OldCols,
  ) {
    super(seed, oldCols);
  }
  override at(x: number, y: number, z: number): number {
    return this.dug.has(`${x},${y},${z}`) ? BLOCK_INDEX.air : super.at(x, y, z);
  }
  override lit(box: Box3, margin = 16): WorldLight {
    const w = new ArrayVoxelWorld({ x: 0, z: 0 });
    for (let cz = (box.z0 - margin) >> 4; cz <= (box.z1 + margin) >> 4; cz++) for (let cx = (box.x0 - margin) >> 4; cx <= (box.x1 + margin) >> 4; cx++) w.loadColumn(this.chunk(cx, cz));
    for (const k of this.dug) {
      const [x, y, z] = k.split(',').map(Number) as [number, number, number];
      w.setBlock(x, y, z, 'air');
    }
    const l = new WorldLight(w, new SkyDarkness());
    l.update();
    l.flush();
    return l;
  }
}

/** 行きどまり ぜんぶ〔えだ道の おわり・迷路の 行きどまり〕 */
export const deadEndsOf = (s: BokenShaft): DeadEnd[] => [...(s.branches ?? []).map((b) => b.end), ...(s.maze?.deadEnds ?? [])];

/** ほった あと: ひびの いし・くずれた いしの マスぜんぶ */
export function dugSetOf(s: BokenShaft): Set<string> {
  const out = new Set<string>();
  for (const e of deadEndsOf(s)) for (const p of e.hibi) out.add(ptKey(p));
  for (const b of s.branches ?? []) for (const p of b.rubble) out.add(ptKey(p));
  return out;
}

// ------------------------------------------------------------------ 道の 空気の 高さ・箱

/** 道の 足の マスから 上へ 空気で あるべき 高さ〔いちばん 下の へやは 5・ひびの 通り道は 2・ほかは 4〕 */
const airHeightE = (c: PathCell): number => (c.part === 'room' ? 5 : (c.part as string) === 'hibi' ? 2 : 4);

/** 箱・区画・天井の 上の 石〔R4 と 同じ 数: SHAFT_CONFIG.cover〕 */
export function boxProblems(s: BokenShaft, path: readonly PathCell[], seed: number): string[] {
  const bad: string[] = [];
  const b = s.box;
  const size = s.style?.size ?? 0;
  if (b.x1 - b.x0 + 1 > size || b.z1 - b.z0 + 1 > size) bad.push(`箱 ${b.x1 - b.x0 + 1}×${b.z1 - b.z0 + 1} が 広さ ${size} より 大きい`);
  if (Math.floor(b.x0 / 256) !== Math.floor(b.x1 / 256) || Math.floor(b.z0 / 256) !== Math.floor(b.z1 / 256)) bad.push('箱が 区画の 中に ない');
  if (b.x0 % 256 < 2 || b.z0 % 256 < 2 || 255 - (b.x1 % 256) < 2 || 255 - (b.z1 % 256) < 2) bad.push('箱が 区画の ふちから 2 マス 内がわに ない');
  const C = SHAFT_CONFIG.cover;
  const e = s.entrance;
  for (const c of path) {
    if (c.x < b.x0 || c.x > b.x1 || c.z < b.z0 || c.z > b.z1) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) が 箱の 外`);
    if (Math.hypot(c.x - e.x, c.z - e.z) <= C.roofedWithin) continue;
    const roof = c.y + airHeightE(c);
    const ground = heightAt(seed, c.x, c.z);
    const need = ground <= SEA_Y - 1 ? C.sea : C.ground;
    if (ground - roof < need) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}): 天井 y ${roof} の 上 ${ground - roof} マス〔${need} 以上〕`);
  }
  return bad.slice(0, 6);
}

// ------------------------------------------------------------------ E3 形と 安全

/**
 * 足の マス〔ひび・くずれた いしは ほった あと〕の 上 N マスが 空気・下 2 マス 固い・まわり 1 マスが 口・出口 いがい 固い。
 * `g` は `DugCols`〔ほった あと〕を わたす
 */
export function safetyProblemsE(g: GenCols, s: BokenShaft, path: readonly PathCell[]): string[] {
  const bad: string[] = [];
  const open = new Set<string>();
  for (const c of path) for (let k = 0; k < airHeightE(c); k++) open.add(ptKey({ x: c.x, y: c.y + k, z: c.z }));
  const chestCells = new Set<string>([...(s.chest?.cells ?? []), ...deadEndsOf(s).flatMap((e) => e.chest?.cells ?? [])].map(ptKey));
  const mouths: Pt[] = [s.entrance, ...s.sides.flatMap((d) => [d.from, d.to]), ...(s.branches ?? []).flatMap((b) => [b.from, b.to]), ...(s.maze ? [s.maze.entrance] : [])];
  const nearMouth = (p: Pt): boolean => mouths.some((m) => Math.abs(m.x - p.x) <= 2 && Math.abs(m.z - p.z) <= 2 && Math.abs(m.y - p.y) <= 6);
  const solidAt = (p: Pt): boolean => open.has(ptKey(p)) || nearMouth(p) || chestCells.has(ptKey(p)) || isSolidIndex(g.at(p.x, p.y, p.z));
  for (const c of path) {
    const h = airHeightE(c);
    for (let k = chestCells.has(ptKey(c)) ? 1 : 0; k < h; k++) if (!isBodyIndex(g.at(c.x, c.y + k, c.z))) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) の 上 ${k} マス目が 体の 通る マスでない: ${g.id(c.x, c.y + k, c.z)}`);
    for (const d of [1, 2]) if (!isSolidIndex(g.at(c.x, c.y - d, c.z))) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) の 下 ${d} マスが 固くない: ${g.id(c.x, c.y - d, c.z)}`);
    if (c.part === 'entrance') continue;
    for (let k = 0; k < h; k++) {
      for (const [dx, dz] of FOUR) {
        const p = { x: c.x + dx, y: c.y + k, z: c.z + dz };
        if (!solidAt(p)) bad.push(`かべ (${p.x}, ${p.y}, ${p.z}) が 固くない: ${g.id(p.x, p.y, p.z)}（${c.part} の となり）`);
      }
    }
    const top = { x: c.x, y: c.y + h, z: c.z };
    if (!solidAt(top)) bad.push(`天井 (${top.x}, ${top.y}, ${top.z}) が 固くない: ${g.id(top.x, top.y, top.z)}`);
  }
  return bad;
}

/** 作った ときの 明るさ〔足の マス ぜんぶ ブロックの 光 6 以上・妖怪が 出る 暗さでない。ほった あとで 見る〕 */
export function lightProblemsE(g: GenCols, s: BokenShaft, path: readonly PathCell[]): string[] {
  const bad: string[] = [];
  const light = g.lit(s.box);
  const chestCells = new Set<string>([...(s.chest?.cells ?? []), ...deadEndsOf(s).flatMap((e) => e.chest?.cells ?? [])].map(ptKey));
  for (const c of path) {
    if (chestCells.has(ptKey(c))) continue;
    if (g.id(c.x, c.y, c.z) === 'start_torch') bad.push(`こわれない たいまつ (${c.x}, ${c.y}, ${c.z})`);
    const l = light.blockLight(c.x, c.y, c.z);
    if (l < 6) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) の ブロックの 光 ${l}（6 以上）`);
    if (light.isDarkForSpawn(c.x, c.y, c.z)) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) は 妖怪が 出る 暗さ`);
  }
  return bad;
}

// ------------------------------------------------------------------ E4 もどれる

/** to へ 歩いて 行ける マス〔帰り。stepTo の さかさ〕と 歩数 */
function walkRev(g: GenCols, to: Pt, box: Box3): Map<string, number> & { capped?: boolean } {
  const dist: Map<string, number> & { capped?: boolean } = new Map();
  if (!standable(g, to.x, to.y, to.z)) return dist;
  dist.set(ptKey(to), 0);
  let frontier: Pt[] = [to];
  while (frontier.length > 0) {
    const next: Pt[] = [];
    for (const b of frontier) {
      const d = dist.get(ptKey(b))!;
      for (const [dx, dz] of FOUR) {
        const x = b.x - dx;
        const z = b.z - dz;
        if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) continue;
        for (const y of [b.y, b.y + 1, b.y - 1]) {
          const k = `${x},${y},${z}`;
          if (dist.has(k) || !standable(g, x, y, z)) continue;
          const t = stepTo(g, { x, y, z }, dx, dz);
          if (!t || t.x !== b.x || t.y !== b.y || t.z !== b.z) continue;
          dist.set(k, d + 1);
          next.push({ x, y, z });
        }
      }
    }
    if (dist.size >= WALK_LIMIT) {
      dist.capped = true;
      return dist;
    }
    frontier = next;
  }
  return dist;
}

/** 入口と 行き来 できる 道さがし 1 組〔入口から 行ける 集まり F と 入口へ もどれる 集まり R〕 */
export interface Reach {
  fwd: Map<string, number> & { capped?: boolean };
  rev: Map<string, number> & { capped?: boolean };
  ok(p: Pt): boolean;
}
export function reachOf(g: GenCols, s: BokenShaft): Reach {
  const box: Box3 = { x0: s.box.x0 - 12, x1: s.box.x1 + 12, z0: s.box.z0 - 12, z1: s.box.z1 + 12 };
  const from = { x: s.entrance.x, y: s.entrance.y, z: s.entrance.z };
  const fwd = walkDist(g, from, box);
  const rev = walkRev(g, from, box);
  return { fwd, rev, ok: (p) => fwd.has(ptKey(p)) && rev.has(ptKey(p)) };
}

/** 道の 足の マスの 集まり〔部分ごと〕 */
const cellsOf = (path: readonly PathCell[], part: string): PathCell[] => path.filter((c) => (c.part as string) === part);

/** C4 の まま〔横穴の 先・いちばん 下の へやの 宝箱の 前〕＋ 1E の 道〔階・えだ道・行きどまりの へや・迷路・キャンプ・かくしべや〕が 入口と 行き来 できる */
export function walkProblemsE(g: GenCols, s: BokenShaft, path: PathCell[], reach: Reach): string[] {
  const bad: string[] = [...walkProblems(g, s, path)];
  const need = (what: string, p: Pt): void => {
    if (!reach.ok(p)) bad.push(`入口と ${what} (${p.x}, ${p.y}, ${p.z}) が 行き来 できない`);
  };
  for (const f of s.floors ?? []) {
    need('上り口', f.up);
    if (f.down) need('下り口', f.down);
    const a = f.main[0];
    const z = f.main[f.main.length - 1];
    if (a) need('本道の はし', a);
    if (z) need('本道の はし', z);
  }
  for (const e of deadEndsOf(s)) {
    need('行きどまり', e.at);
    if (e.room) need('へやの 床', { x: (e.room.x0 + e.room.x1) >> 1, y: e.room.y, z: (e.room.z0 + e.room.z1) >> 1 });
  }
  for (const c of cellsOf(path, 'maze')) need('迷路の ます', c);
  for (const c of cellsOf(path, 'camp')) need('キャンプあとの 床', c);
  for (const c of cellsOf(path, 'kakushi')) need('かくしべやの 床', c);
  return bad;
}

// ------------------------------------------------------------------ E7 行きどまりの くじ

const AIR_ROOM = (g: GenCols, r: { x0: number; y: number; z0: number; x1: number; z1: number }, h: number): string[] => {
  const bad: string[] = [];
  for (let x = r.x0; x <= r.x1; x++) {
    for (let z = r.z0; z <= r.z1; z++) {
      for (let k = 0; k < h; k++) if (!isBodyIndex(g.at(x, r.y + k, z))) bad.push(`へやの (${x}, ${r.y + k}, ${z}) が 体の 通る マスでない: ${g.id(x, r.y + k, z)}`);
      if (!isSolidIndex(g.at(x, r.y - 1, z))) bad.push(`へやの 床の 下 (${x}, ${r.y - 1}, ${z}) が 固くない`);
    }
  }
  return bad;
};

/** へやの 空気に ふれる 石〔かべ・天井・床〕の うち ids の ブロックの 数〔同じ ブロックは 1 回〕 */
function visibleIn(g: GenCols, r: { x0: number; y: number; z0: number; x1: number; z1: number }, h: number, ids: readonly string[]): Record<string, number> {
  const seen = new Set<string>();
  const out: Record<string, number> = {};
  for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
    for (let z = r.z0 - 1; z <= r.z1 + 1; z++) {
      for (let y = r.y - 1; y <= r.y + h; y++) {
        const id = g.id(x, y, z);
        if (!ids.includes(id)) continue;
        const touches = SIX.some(([dx, dy, dz]) => {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          return nx >= r.x0 && nx <= r.x1 && nz >= r.z0 && nz <= r.z1 && ny >= r.y && ny < r.y + h;
        });
        const key = ptKey({ x, y, z });
        if (touches && !seen.has(key)) {
          seen.add(key);
          out[id] = (out[id] ?? 0) + 1;
        }
      }
    }
  }
  return out;
}

const countIds = (g: GenCols, c: Pt, rx: number, ry0: number, ry1: number, ids: readonly string[]): number => {
  let n = 0;
  for (let x = c.x - rx; x <= c.x + rx; x++) for (let z = c.z - rx; z <= c.z + rx; z++) for (let y = c.y + ry0; y <= c.y + ry1; y++) if (ids.includes(g.id(x, y, z))) n++;
  return n;
};

/** 行きどまり 1 つの 中身〔E7〕。`orig` ＝ 作った ままの 列・`dug` ＝ ほった あと */
export function deadEndProblems(orig: GenCols, dug: GenCols, e: DeadEnd, T: Tables, depth: 'asai' | 'nakahodo' | 'fukai'): string[] {
  const bad: string[] = [];
  const at = `行きどまり ${e.kind} (${e.at.x}, ${e.at.y}, ${e.at.z})`;
  const R = T.shape.room;
  const ores = T.dead.ores[depth];
  const hibi = e.kind === 'hibi_naka' || e.kind === 'hibi_oo';
  const roomed = e.kind === 'oo' || e.kind === 'naka' || hibi;
  if (!standable(dug, e.at.x, e.at.y, e.at.z)) bad.push(`${at}: 足の マスに 立てない`);
  if (roomed !== (e.room !== null)) bad.push(`${at}: へやの ありなしが 種類と 合わない`);
  if (e.room) {
    const r = e.room;
    if (r.x1 - r.x0 + 1 !== R.floor || r.z1 - r.z0 + 1 !== R.floor) bad.push(`${at}: へやが ${R.floor}×${R.floor} でない`);
    bad.push(...AIR_ROOM(dug, r, R.height).slice(0, 3).map((m) => `${at}: ${m}`));
  }
  if (e.kind === 'oo' || e.kind === 'hibi_oo') {
    const c = e.chest;
    if (!c) bad.push(`${at}: 宝箱が ない`);
    else {
      if (c.cells.length !== 2) bad.push(`${at}: 宝箱が 2 マスでない`);
      for (const p of c.cells) if (!orig.id(p.x, p.y, p.z).startsWith('takarabako')) bad.push(`${at}: 宝箱の マス (${p.x}, ${p.y}, ${p.z}) が ${orig.id(p.x, p.y, p.z)}`);
      if (e.room && !c.cells.every((p) => p.x >= e.room!.x0 && p.x <= e.room!.x1 && p.z >= e.room!.z0 && p.z <= e.room!.z1 && p.y === e.room!.y)) bad.push(`${at}: 宝箱が へやの 床に ない`);
    }
  } else if (e.chest) bad.push(`${at}: 宝箱の ない 種類に 宝箱が ある`);
  if (e.kind === 'naka' || e.kind === 'hibi_naka') {
    // きらきら: その 層の いい 鉱石が 表の 数 以上 見える
    const r = e.room;
    if (r) {
      const seen = visibleIn(orig, r, R.height, Object.keys(ores.naka));
      for (const [ore, n] of Object.entries(ores.naka)) {
        if ((seen[ore] ?? 0) < n) bad.push(`${at}: ${ore} が 見える数 ${seen[ore] ?? 0} < ${n}`);
        if ((e.ores[ore] ?? 0) < n) bad.push(`${at}: 計画の ${ore} が ${e.ores[ore] ?? 0} < ${n}`);
      }
    }
  }
  if (e.kind === 'atari') {
    const total = Object.values(e.ores).reduce((a, b) => a + b, 0);
    if (!inSpan(total, T.dead.atariCount)) bad.push(`${at}: 見える 鉱石 ${total} こ〔${T.dead.atariCount.join('〜')}〕`);
    for (const ore of Object.keys(e.ores)) if (!ores.atari.includes(ore)) bad.push(`${at}: ${ore} は その 層の あたりの 鉱石でない`);
    const seen = countIds(orig, e.at, 3, 0, 3, ores.atari);
    if (seen < T.dead.atariCount[0]) bad.push(`${at}: 道の おわりに 見える 鉱石が ${seen} こ`);
  }
  if (e.kind === 'hazure') {
    if (e.hibi.length > 0) bad.push(`${at}: はずれに ひびが ある`);
    const marks = countIds(orig, e.at, 4, 0, 3, [ID.waku, ID.hashigoX, ID.hashigoZ]);
    if (marks < 1) bad.push(`${at}: こわれた わく か たおれた はしごが 近くに ない`);
    const keys = countIds(orig, e.at, 6, -1, 4, [ID.hibi, ID.kuzure]);
    if (keys > 0) bad.push(`${at}: はずれに ひび・くずれた いしが ある`);
  }
  if (hibi) bad.push(...hibiProblems(orig, e, T, at));
  return bad;
}

/** ひびの 通り道: はば 1・高さ 2・おく 2〜4・ぜんぶ ひびの いし・床が へやと 同じ 高さ・手前の たいまつ ちょうど 1 本 */
function hibiProblems(g: GenCols, e: DeadEnd, T: Tables, at: string): string[] {
  const bad: string[] = [];
  const H = T.shape.hibi;
  if (!inSpan(e.hibi.length, H.cells)) bad.push(`${at}: ひびの いしが ${e.hibi.length} こ〔${H.cells.join('〜')}〕`);
  for (const p of e.hibi) if (g.id(p.x, p.y, p.z) !== ID.hibi) bad.push(`${at}: ひびの マス (${p.x}, ${p.y}, ${p.z}) が ${g.id(p.x, p.y, p.z)}`);
  const cols = new Map<string, Pt[]>();
  for (const p of e.hibi) (cols.get(`${p.x},${p.z}`) ?? cols.set(`${p.x},${p.z}`, []).get(`${p.x},${p.z}`)!).push(p);
  if (cols.size === 0) return [...bad, `${at}: ひびの マスが ない`];
  if (!inSpan(cols.size, H.depth)) bad.push(`${at}: ひびの おくゆき ${cols.size}〔${H.depth.join('〜')}〕`);
  for (const [k, ps] of cols) {
    const ys = ps.map((p) => p.y).sort((a, b) => a - b);
    if (ps.length !== H.height || ys[0] !== e.at.y || ys[ys.length - 1] !== e.at.y + H.height - 1) bad.push(`${at}: ひびの 列 ${k} が 足と 頭の ${H.height} マスでない`);
  }
  const first = e.hibi.reduce((best, p) => (cheb(p, e.at) < cheb(best, e.at) ? p : best), e.hibi[0]!);
  if (cheb(first, e.at) !== 1) bad.push(`${at}: ひびの はじまりが 行きどまりの 足の マスの となりでない`);
  const dx = Math.sign(first.x - e.at.x);
  const dz = Math.sign(first.z - e.at.z);
  const xs = [...cols.keys()].map((k) => k.split(',').map(Number) as [number, number]);
  const line = dx !== 0 ? new Set(xs.map(([, z]) => z)).size === 1 : new Set(xs.map(([x]) => x)).size === 1;
  if (!line) bad.push(`${at}: ひびの 通り道が まっすぐでない`);
  if (e.room && e.room.y !== e.at.y) bad.push(`${at}: かくしべやの 床が 行きどまりの 床と 同じ 高さでない`);
  // たいまつ: つきあたり〔ひびの はじまり〕から 手前へ torchBefore の はば・左右 2 マス・高さ 4 の 中に ちょうど torches 本
  let torches = 0;
  for (let along = H.torchBefore[0]; along <= H.torchBefore[1]; along++) {
    for (let side = -2; side <= 2; side++) {
      const x = first.x - dx * along + (dx !== 0 ? 0 : side);
      const z = first.z - dz * along + (dz !== 0 ? 0 : side);
      for (let y = e.at.y; y <= e.at.y + 3; y++) if (g.id(x, y, z) === ID.torch) torches++;
    }
  }
  if (torches !== H.torches) bad.push(`${at}: つきあたりの ${H.torchBefore.join('〜')} マス手前の たいまつ ${torches} 本〔ちょうど ${H.torches}〕`);
  return bad;
}

/** E8: かくしべやは とじて いる〔作った ままの 世界で、へやの 空気から 6 方向に ひろげて へやの 中に とどまる〕 */
export function closedProblems(orig: GenCols, e: DeadEnd, T: Tables): string[] {
  if (!e.room) return [];
  const r = e.room;
  const H = T.shape.room.height;
  const inside = (x: number, y: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y >= r.y && y < r.y + H;
  const seen = new Set<string>();
  const stack: Pt[] = [];
  for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) for (let y = r.y; y < r.y + H; y++) if (isBodyIndex(orig.at(x, y, z)) || orig.id(x, y, z) === 'water') stack.push({ x, y, z });
  const bad: string[] = [];
  for (const p of stack) seen.add(ptKey(p));
  while (stack.length > 0) {
    const a = stack.pop()!;
    for (const [dx, dy, dz] of SIX) {
      const n = { x: a.x + dx, y: a.y + dy, z: a.z + dz };
      const k = ptKey(n);
      if (seen.has(k)) continue;
      const id = orig.id(n.x, n.y, n.z);
      if (!(isBodyIndex(orig.at(n.x, n.y, n.z)) || id === 'water')) continue;
      if (!inside(n.x, n.y, n.z)) {
        bad.push(`へやの 空気が (${n.x}, ${n.y}, ${n.z}) ${id} で そとと つながる`);
        if (bad.length >= 3) return bad;
        continue;
      }
      seen.add(k);
      stack.push(n);
    }
  }
  for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) for (const d of [1, 2]) if (!isSolidIndex(orig.at(x, r.y - d, z))) return [...bad, `かくしべやの 床の 下 ${d} マスが 固くない (${x}, ${r.y - d}, ${z})`];
  return bad;
}

// ------------------------------------------------------------------ E9 迷路

export interface MazeGraph {
  cells: Pt[][];
  open: (i: number, j: number, k: number, l: number) => boolean;
  degree: (i: number, j: number) => number;
}
/** 迷路の ます〔i: x・j: z〕と、となりあう ますの あいだの かべの 穴〔かべの まん中の マスが 道〕から グラフを 作る */
export function mazeGraph(s: BokenShaft, path: readonly PathCell[]): MazeGraph | null {
  const m = s.maze;
  if (!m) return null;
  const floor = new Set(cellsOf(path, 'maze').map(ptKey));
  const center = (i: number, j: number): Pt => ({ x: m.box.x0 + 2 + 4 * i, y: m.y, z: m.box.z0 + 2 + 4 * j });
  const cells: Pt[][] = Array.from({ length: m.grid }, (_, i) => Array.from({ length: m.grid }, (_, j) => center(i, j)));
  const open = (i: number, j: number, k: number, l: number): boolean => {
    const a = cells[i]?.[j];
    const b = cells[k]?.[l];
    if (!a || !b) return false;
    return floor.has(ptKey({ x: (a.x + b.x) / 2, y: m.y, z: (a.z + b.z) / 2 })) && floor.has(ptKey(a)) && floor.has(ptKey(b));
  };
  const degree = (i: number, j: number): number => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => open(i, j, i + di!, j + dj!)).length;
  return { cells, open, degree };
}

// ------------------------------------------------------------------ E10 キャンプあと

const AIR_ROOM_CAMP = (g: GenCols, r: { x0: number; y: number; z0: number; x1: number; z1: number }, h: number, furniture: readonly Pt[]): string[] => {
  const furn = new Set(furniture.map(ptKey));
  const bad: string[] = [];
  for (let x = r.x0; x <= r.x1; x++) {
    for (let z = r.z0; z <= r.z1; z++) {
      if (!isSolidIndex(g.at(x, r.y - 1, z))) bad.push(`キャンプの 床の 下 (${x}, ${r.y - 1}, ${z}) が 固くない`);
      for (let k = 0; k < h; k++) if (!isBodyIndex(g.at(x, r.y + k, z)) && !(k === 0 && furn.has(ptKey({ x, y: r.y, z })))) bad.push(`キャンプの (${x}, ${r.y + k}, ${z}) が 体の 通る マスでない: ${g.id(x, r.y + k, z)}`);
    }
  }
  return bad.slice(0, 4);
};

/** キャンプあとの へや: 床 5×5・高さ 4・段差 0・たんす・ちょうちん・ふとん・たきびの あと */
export function campProblems(g: GenCols, s: BokenShaft, T: Tables): string[] {
  const c = s.camp;
  if (!c) return [];
  const bad: string[] = [];
  const r = c.room;
  const R = T.shape.camp;
  if (r.x1 - r.x0 + 1 !== R.floor || r.z1 - r.z0 + 1 !== R.floor) bad.push(`キャンプの 床が ${R.floor}×${R.floor} でない`);
  bad.push(...AIR_ROOM_CAMP(g, r, R.height, [c.tansu, c.lantern, c.takibi, ...c.futon]));
  if (!isFurnKind(g.id(c.tansu.x, c.tansu.y, c.tansu.z), K_TANSU)) bad.push(`たんすの マス (${c.tansu.x}, ${c.tansu.y}, ${c.tansu.z}) が ${g.id(c.tansu.x, c.tansu.y, c.tansu.z)}`);
  if (g.id(c.lantern.x, c.lantern.y, c.lantern.z) !== ID.lantern) bad.push(`ちょうちんの マスが ${g.id(c.lantern.x, c.lantern.y, c.lantern.z)}`);
  if (g.id(c.takibi.x, c.takibi.y, c.takibi.z) !== ID.takibi) bad.push(`たきびの あとの マスが ${g.id(c.takibi.x, c.takibi.y, c.takibi.z)}`);
  if (c.futon.length === 0) bad.push('ふとんが ない');
  for (const p of c.futon) if (!g.id(p.x, p.y, p.z).startsWith('futon')) bad.push(`ふとんの マス (${p.x}, ${p.y}, ${p.z}) が ${g.id(p.x, p.y, p.z)}`);
  return bad;
}
