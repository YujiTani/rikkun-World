import type { LightField } from '../../contracts';
import { SECTION_SIZE } from '../../contracts';
import { columnKey, type ArrayVoxelWorld, type ChangeBox } from '../VoxelWorld';
import { sectionToArray } from '../sections';
import { COUNT_LIGHT_TOTAL_MAX, type FrameClock } from '../frameClock';
import { GADGET_TUNING } from '../../content/items/gadgetTuning';
import { LANTERN } from '../blocks/blockTypes';
import { LIGHT_CONFIG as C } from './config';
import { combinedBrightness, isDarkForSpawn } from './curve';
import { EMIT, OPAQ, TRIV, spreadLight } from './lightSpread';
import { skyDarkness, type SkyDarkness } from './skyDarkness';

/**
 * 世界の光（マイクラと同じ仕組み）を セクション（16³）ごとに持つ（VOX-C。docs/design/VOX-plan.md §4）。
 * - 空の光: 上から まっすぐ 15。はっぱ・みず は 1 弱め、固いブロックの下は 0。横には 1 マスごとに 1 弱まって広がる。
 * - ブロックの光: たいまつ 14 から 1 マスごとに 1 弱まって広がる。
 * - セクションの持ち方は 3 つ:
 *   ① 空だけ 15・明かり 0（1 バイトの目印 UNI）  ② 見えない・全部ふさがり（null = 持たない。読むと 0）
 *   ③ ふつう = Uint8Array(4096)。1 マス 1 バイト = 空 4 ビット（上）| 明かり 4 ビット（下）
 * - セクション S の光は、まわり 3×3×3 のセクションの ブロックだけから計算して S の中だけ書く（順番に関係なく同じ答え）。
 * - ブロックが変わったら、15 マス以内にかかるセクションを「作り直し待ち」に入れ、1 コマに BUDGET 個ずつ計算する。
 *   光が変わったセクション（と、ふちのとなり）は、描画側に作り直しを伝える（world.markSectionDirty）。
 * - ぜんぶ光を通さないブロックのセクション（VOX-A の isSectionHidden より少し広い。光は 0 のまま）は計算せず、持たない。
 *   ただし 光る 固い ブロック〔ほたるいし。MINE-1B〕を ふくむ セクションは 持つ。
 *   となりをほっても そのセクション自身の光は 0 のまま。ほった側のセクションは 作り直し待ちで計算される。
 * - 読みこんだばかりの列は 計算されるまで isSectionReady / isColumnLit が false。描画側はそれまでメッシュを作らない。
 */

/** 1 セクションを計算するときの 3×3×3 の 1 辺（マス）。はじめにまとめて計算するときは もっと大きい */
const R3 = SECTION_SIZE * 3;
/** はじめにまとめて計算する 1 かたまり: 横 TILE×TILE 列、たて SLAB セクション */
const TILE = 4;
const SLAB = 4;
/** 1 コマに計算するセクションの数（VOX-plan §4 順番待ち） */
const BUDGET = 2;
/** 自明なセクションをまとめて片づける時間の上限（ミリ秒） */
const TIME_BUDGET_MS = 3;
/** 空 15・明かり 0 のセクションの目印（長さ 1。中身は読まない） */
const UNI = new Uint8Array(1);
const UNI_BYTE = 0xf0;
/** 読みこんでいないマス（ブロックの番号の外）。光を通さない */
const UNKNOWN = 255;

type Entry = Uint8Array | null | undefined;

/** 列の「いちばん上の 光に関わるブロック」の高さ（-1 = 無い）× 256 と、その最大 */
type Tops = Int16Array;

export class WorldLight implements LightField {
  private readonly sy: number;
  private readonly nSections: number;
  private readonly lights = new Map<number, Entry[]>();
  private readonly tops = new Map<number, Tops>();
  /** 作り直し待ち: セクションの鍵 → 先に計算したい順（0 = 変えたセクション自身、1 = まわり、2 = 読みこみ） */
  private readonly pending = new Map<number, number>();
  private lastKey = NaN;
  private lastArr: Entry[] | undefined;
  private viewerX = 0;
  private viewerZ = 0;
  /** 手動: 列の出入りで まわりを作り直さない。光は lightColumn で 1 列ずつ計算する（ChunkStream が呼ぶ。VOX-D） */
  private manual = false;
  /** ちょうちん（ITEM-FX-1）の場所。妖怪が湧かない はんい（立方体）の中心。collect() が 世界の変化に そろえる */
  private readonly lanterns = new Map<string, { x: number; y: number; z: number }>();
  /** 最後の update() で計算し直したマスの数（計測・テスト用） */
  lastRecomputeCells = 0;
  /** 最後の update() / flush() で ブロックの光を 書いた マスの 数（光る マス ＋ 広げた マス。空の光は 数えない）。MINE-1B B12「光を 広げた マスの 数」の 窓口 */
  lastSpreadCells = 0;
  /** 最初の全部の光の計算にかかったミリ秒（M5 AC14。世界を作る時間と合わせて 2,500 以下） */
  readonly initMs: number;

  // 計算用の置き場（毎回 new しない）
  private blk = new Uint8Array(R3 ** 3);
  private sky = new Uint8Array(R3 ** 3);
  private block = new Uint8Array(R3 ** 3);
  private colTop = new Int16Array(R3 * R3);
  private colOk = new Uint8Array(R3 * R3);
  /** 今の計算の 箱の大きさ（横 rx × rz、たて ry） */
  private rx = R3;
  private rz = R3;
  private readonly skyQ: number[] = [];
  private readonly blockQ: number[] = [];
  private ry = 0;
  private readonly out = new Uint8Array(SECTION_SIZE ** 3);

  constructor(
    private readonly world: ArrayVoxelWorld,
    private readonly darkness: SkyDarkness = skyDarkness,
    private readonly clock: FrameClock = 'time',
  ) {
    this.sy = world.size.y;
    this.nSections = Math.ceil(this.sy / SECTION_SIZE);
    const t0 = performance.now();
    this.world.takeChangeBoxes();
    this.world.takeColumnEvents();
    this.computeAll();
    this.initMs = performance.now() - t0;
    for (const c of this.world.loadedColumns()) this.scanLanterns(c.cx, c.cz);
  }

  // ------------------------------------------------------------ 読み出し

  private entries(cx: number, cz: number): Entry[] | undefined {
    const k = columnKey(cx, cz);
    if (k === this.lastKey) return this.lastArr;
    this.lastKey = k;
    this.lastArr = this.lights.get(k);
    return this.lastArr;
  }

  /** 1 マスの 1 バイト（空 | 明かり）。読みこんでいない列・まだ計算していない所は 空 15 */
  private cell(x: number, y: number, z: number): number {
    const arr = this.entries(x >> 4, z >> 4);
    if (arr === undefined) return UNI_BYTE;
    const e = arr[y >> 4];
    if (e === undefined) return UNI_BYTE;
    if (e === null) return 0;
    if (e.length === 1) return UNI_BYTE;
    return e[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)];
  }

  skyLight(x: number, y: number, z: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y >= this.sy) return C.maxLevel;
    if (y < 0) return 0;
    return this.cell(x, y, z) >> 4;
  }

  blockLight(x: number, y: number, z: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= this.sy) return 0;
    return this.cell(x, y, z) & 15;
  }

  /** 今の時刻をふくめた明るさ（空の光 - 夜の弱まり と ブロックの光 の大きいほう） */
  level(x: number, y: number, z: number): number {
    return Math.max(this.skyLight(x, y, z) - this.darkness.value, this.blockLight(x, y, z), 0);
  }

  /** 見た目の明るさ 0〜1（ブロックの光は 3 だんかい）。人形・妖怪・落とし物の明るさに使う */
  brightness(x: number, y: number, z: number): number {
    return combinedBrightness(this.skyLight(x, y, z), this.darkness.value, this.blockLight(x, y, z));
  }

  /** 妖怪が出てよい暗い所か（空の光 7 以下で、たいまつの 8 マス以内ではない） */
  isDarkForSpawn(x: number, y: number, z: number): boolean {
    // ちょうちん: 立方体の はんい（水平も 上下も）の中は 光とは かんけいなく 湧かない（ITEM-FX-1）
    if (this.lanterns.size > 0) {
      const R = GADGET_TUNING.lantern.noSpawnRadius;
      const fx = Math.floor(x);
      const fy = Math.floor(y);
      const fz = Math.floor(z);
      for (const l of this.lanterns.values()) if (Math.abs(fx - l.x) <= R && Math.abs(fy - l.y) <= R && Math.abs(fz - l.z) <= R) return false;
    }
    return isDarkForSpawn(this.skyLight(x, y, z), this.darkness.value, this.blockLight(x, y, z));
  }

  /** メッシュ用の読み出し（世界の中の整数の座標だけ） */
  skyAt(x: number, y: number, z: number): number {
    if (y >= this.sy) return C.maxLevel;
    if (y < 0) return 0;
    return this.cell(x, y, z) >> 4;
  }
  blockAt(x: number, y: number, z: number): number {
    if (y < 0 || y >= this.sy) return 0;
    return this.cell(x, y, z) & 15;
  }

  /** 1 マスの (空の光 << 4) | ブロックの光（世界の外の高さ: 上は空 15、下は 0）。メッシュ用。整数の座標だけ */
  packedAt(x: number, y: number, z: number): number {
    if (y >= this.sy) return UNI_BYTE;
    if (y < 0) return 0;
    return this.cell(x, y, z);
  }

  /** セクションの形（テスト・計測用）。'uniform' = 空 15 だけ、'dark' = 持たない、'full' = 4096 バイト、'pending' = まだ */
  sectionKind(cx: number, sy: number, cz: number): 'uniform' | 'dark' | 'full' | 'pending' | 'none' {
    const arr = this.lights.get(columnKey(cx, cz));
    if (arr === undefined) return 'none';
    const e = arr[sy];
    if (e === undefined) return 'pending';
    if (e === null) return 'dark';
    return e.length === 1 ? 'uniform' : 'full';
  }

  /** 光が持っているメモリの目安（バイト。セクションの配列 + 高さ地図） */
  memoryBytes(): number {
    let n = 0;
    for (const arr of this.lights.values()) for (const e of arr) if (e) n += e.length;
    n += this.tops.size * 512;
    return n;
  }

  /** 作り直し待ちのセクションの数 */
  pendingCount(): number {
    return this.pending.size;
  }

  /** 近いセクションを先に計算するための、見ている場所（描画の setViewer が伝える） */
  setViewer(x: number, z: number): void {
    this.viewerX = x;
    this.viewerZ = z;
  }

  // ------------------------------------------------------------ 更新

  /** 手動のモード（VOX-D）。列を読みこんでも まわりを作り直さず、捨てた列の光だけ捨てる。光は lightColumn で計算する */
  setManual(on: boolean): void {
    this.manual = on;
  }

  /** この列が 光を計算ずみか（全セクション） */
  isLitColumn(cx: number, cz: number): boolean {
    const arr = this.lights.get(columnKey(cx, cz));
    if (arr === undefined) return false;
    for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) return false;
    return true;
  }

  /**
   * 1 列ぶん（全セクション）の光を、いま計算する（手動のモード。まわり 8 列が生成ずみのとき）。
   * 光は 列を捨てるまで持つ。ブロックを変えたときの作り直しは ふつうの update。
   */
  lightColumn(cx: number, cz: number): void {
    this.collect();
    if (!this.world.column(cx, cz)) return;
    for (let s = 0; s < this.nSections; s++) this.pending.delete(columnKey(cx, cz) * 1024 + s);
    this.computeTile(cx, cz, 1, 1, 0, this.nSections - 1, false);
  }

  /**
   * ブロックが変わっていたら、まわり（15 マス以内）のセクションを作り直し待ちに入れ、BUDGET 個だけ計算する。
   * 毎コマ呼んでよい（変化が無ければすぐ終わる）。
   */
  update(): void {
    this.collect();
    this.lastRecomputeCells = 0;
    this.lastSpreadCells = 0;
    if (this.pending.size === 0) return;
    // 数えるのは「ほんとうに計算した」セクションだけ。ふさがり・空だけは ただで片づける（時間の上限つき）
    const t0 = performance.now();
    let real = 0;
    let calls = 0;
    const count = this.clock === 'count';
    // count: 時間は見ない。ただで片づけるものもふくめて 64 回まで
    while (real < BUDGET && this.pending.size > 0 && (count ? calls < COUNT_LIGHT_TOTAL_MAX : performance.now() - t0 < TIME_BUDGET_MS)) {
      calls++;
      const key = this.pickNext();
      if (key < 0) break;
      this.pending.delete(key);
      const before = this.lastRecomputeCells;
      this.computeKey(key);
      if (this.lastRecomputeCells !== before) real++;
    }
  }

  /**
   * このセクションの光は 計算ずみか（契約 VOX-C。contracts.ts の LightField 参照）。
   * 読みこんだばかり・まだ計算していないセクションは false。作り直し待ちでも 前の値があれば true。
   */
  isSectionReady(cx: number, sy: number, cz: number): boolean {
    const arr = this.lights.get(columnKey(cx, cz));
    return arr !== undefined && arr[sy] !== undefined;
  }

  /** この列と、まわり 8 列（読みこんである分）の光が ぜんぶ計算ずみか。メッシュ作りはこれが true になってから */
  isColumnLit(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.world.column(cx + dx, cz + dz)) continue;
        const arr = this.lights.get(columnKey(cx + dx, cz + dz));
        if (arr === undefined) return false;
        for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) return false;
      }
    }
    return true;
  }

  /** 作り直し待ちを ぜんぶ計算する（テスト・起動時用） */
  flush(): void {
    this.collect();
    this.lastRecomputeCells = 0;
    this.lastSpreadCells = 0;
    while (this.pending.size > 0) {
      const key = this.pickNext();
      this.pending.delete(key);
      this.computeKey(key);
    }
  }

  /** ちょうちんの記録を、この列の 今の 中身に そろえる（読みこんだ とき・捨てた とき） */
  private scanLanterns(cx: number, cz: number): void {
    for (const [k, l] of this.lanterns) if (l.x >> 4 === cx && l.z >> 4 === cz) this.lanterns.delete(k);
    const col = this.world.column(cx, cz);
    if (!col) return;
    for (let s = 0; s < col.sections.length; s++) {
      const sec = col.sections[s];
      if (sec.kind === 'uniform') continue;
      if (sec.kind === 'palette' && !sec.palette.includes(LANTERN)) continue;
      const arr = sectionToArray(sec);
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] !== LANTERN) continue;
        const x = cx * 16 + (i & 15);
        const z = cz * 16 + ((i >> 4) & 15);
        const y = s * 16 + (i >> 8);
        this.lanterns.set(`${x},${y},${z}`, { x, y, z });
      }
    }
  }

  /** 変わった箱の中の ちょうちんの 記録を そろえる */
  private syncLanternBox(b: ChangeBox): void {
    for (const [k, l] of this.lanterns) if (l.x >= b.x0 && l.x <= b.x1 && l.y >= b.y0 && l.y <= b.y1 && l.z >= b.z0 && l.z <= b.z1) this.lanterns.delete(k);
    for (let y = Math.max(0, b.y0); y <= Math.min(this.sy - 1, b.y1); y++) {
      for (let z = b.z0; z <= b.z1; z++) {
        for (let x = b.x0; x <= b.x1; x++) if (this.world.getIndex(x, y, z) === LANTERN) this.lanterns.set(`${x},${y},${z}`, { x, y, z });
      }
    }
  }

  private collect(): void {
    const events = this.world.takeColumnEvents();
    for (const e of events) {
      this.scanLanterns(e.cx, e.cz);
      const k = columnKey(e.cx, e.cz);
      this.lights.delete(k);
      this.tops.delete(k);
      this.lastKey = NaN;
      if (this.manual) {
        // 捨てた列の光だけ捨てる（となりの光は そのまま）。読みこんだ列は lightColumn が来るまで 光なし
        for (let s = 0; s < this.nSections; s++) this.pending.delete(k * 1024 + s);
        continue;
      }
      // この列が 出入りした: まわり 3×3 の列の ぜんぶのセクションを作り直す
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!this.world.column(e.cx + dx, e.cz + dz)) continue;
          for (let s = 0; s < this.nSections; s++) this.enqueue(e.cx + dx, s, e.cz + dz, 2);
        }
      }
    }
    for (const b of this.world.takeChangeBoxes()) {
      this.syncLanternBox(b);
      this.enqueueBox(b);
    }
  }

  private enqueue(cx: number, sy: number, cz: number, prio: number): void {
    const key = columnKey(cx, cz) * 1024 + sy;
    const p = this.pending.get(key);
    if (p === undefined || prio < p) this.pending.set(key, prio);
  }

  private enqueueBox(b: ChangeBox): void {
    const r = C.maxLevel;
    // 高さ地図: 変わった列は作り直し
    for (let cz = b.z0 >> 4; cz <= b.z1 >> 4; cz++) for (let cx = b.x0 >> 4; cx <= b.x1 >> 4; cx++) this.tops.delete(columnKey(cx, cz));
    const sy0 = Math.max(0, Math.floor((b.y0 - r) / SECTION_SIZE));
    const sy1 = Math.min(this.nSections - 1, Math.floor((b.y1 + r) / SECTION_SIZE));
    for (let cz = (b.z0 - r) >> 4; cz <= (b.z1 + r) >> 4; cz++) {
      for (let cx = (b.x0 - r) >> 4; cx <= (b.x1 + r) >> 4; cx++) {
        if (!this.world.column(cx, cz)) continue;
        const inX = cx >= b.x0 >> 4 && cx <= b.x1 >> 4 && cz >= b.z0 >> 4 && cz <= b.z1 >> 4;
        for (let s = sy0; s <= sy1; s++) {
          const own = inX && s >= Math.floor(b.y0 / SECTION_SIZE) && s <= Math.floor(b.y1 / SECTION_SIZE);
          this.enqueue(cx, s, cz, own ? 0 : 1);
        }
      }
    }
  }

  /** 先に計算するセクションの鍵（順: 変えた所 → まわり → 読みこみ、同じなら 見ている場所に近い順） */
  private pickNext(): number {
    let best = -1;
    let bp = Infinity;
    let bd = Infinity;
    const vx = this.viewerX;
    const vz = this.viewerZ;
    for (const [key, p] of this.pending) {
      if (p > bp) continue;
      const colK = Math.floor(key / 1024);
      const cx = Math.floor(colK / 65536) - 32768;
      const cz = (colK % 65536) - 32768;
      const dx = cx * 16 + 8 - vx;
      const dz = cz * 16 + 8 - vz;
      const d = dx * dx + dz * dz;
      if (p < bp || (p === bp && d < bd)) {
        best = key;
        bp = p;
        bd = d;
      }
    }
    return best;
  }

  private computeKey(key: number): void {
    const colK = Math.floor(key / 1024);
    const cx = Math.floor(colK / 65536) - 32768;
    const cz = (colK % 65536) - 32768;
    this.computeTile(cx, cz, 1, 1, key % 1024, key % 1024, true);
  }

  // ------------------------------------------------------------ 計算

  private columnTops(cx: number, cz: number): Tops | null {
    const k = columnKey(cx, cz);
    let t = this.tops.get(k);
    if (t) return t;
    const col = this.world.column(cx, cz);
    if (!col) return null;
    t = new Int16Array(257).fill(-1);
    let left = 256;
    for (let s = col.sections.length - 1; s >= 0 && left > 0; s--) {
      const sec = col.sections[s];
      if (sec.kind === 'uniform') {
        if (TRIV[sec.block] === 1) continue;
        for (let i = 0; i < 256; i++) if (t[i] < 0) (t[i] = s * 16 + 15), left--;
        continue;
      }
      if (sec.kind === 'palette') {
        let any = false;
        for (const b of sec.palette) if (TRIV[b] === 0) any = true;
        if (!any) continue;
      }
      const arr = sectionToArray(sec);
      for (let i = 0; i < 256; i++) {
        if (t[i] >= 0) continue;
        for (let ly = 15; ly >= 0; ly--) {
          if (TRIV[arr[ly * 256 + i]] === 0) {
            t[i] = s * 16 + ly;
            left--;
            break;
          }
        }
      }
    }
    let m = -1;
    for (let i = 0; i < 256; i++) if (t[i] > m) m = t[i];
    t[256] = m;
    this.tops.set(k, t);
    return t;
  }

  private setEntry(cx: number, cz: number, sy: number, e: Entry): Entry {
    const k = columnKey(cx, cz);
    let arr = this.lights.get(k);
    if (!arr) {
      arr = new Array<Entry>(this.nSections).fill(undefined);
      this.lights.set(k, arr);
      this.lastKey = NaN;
    }
    const old = arr[sy];
    arr[sy] = e;
    return old;
  }

  /** 読みこんである列ぜんぶを、かたまり（TILE×TILE 列 × SLAB セクション）ごとに計算する */
  private computeAll(): void {
    const cols = this.world.loadedColumns();
    const byTile = new Map<string, { cx: number; cz: number }>();
    for (const c of cols) byTile.set(`${Math.floor(c.cx / TILE)},${Math.floor(c.cz / TILE)}`, { cx: Math.floor(c.cx / TILE) * TILE, cz: Math.floor(c.cz / TILE) * TILE });
    for (const t of byTile.values()) this.computeTile(t.cx, t.cz, TILE, TILE, 0, this.nSections - 1, false);
    // 大きな置き場は 手放す（ふだんの 1 セクションぶんに戻す）
    if (this.blk.length > R3 ** 3) {
      this.blk = new Uint8Array(R3 ** 3);
      this.sky = new Uint8Array(R3 ** 3);
      this.block = new Uint8Array(R3 ** 3);
      this.colTop = new Int16Array(R3 * R3);
      this.colOk = new Uint8Array(R3 * R3);
    }
  }

  /** そのセクションが ぜんぶ 光を通さないブロックで、光る ブロック〔ほたるいし MINE-1B〕も 無いか（光は 0 のまま） */
  private allOpaque(cx: number, sy: number, cz: number): boolean {
    const sec = this.world.section(cx, sy, cz);
    if (sec === undefined) return false;
    if (sec.kind === 'uniform') return OPAQ[sec.block] >= 15 && EMIT[sec.block] === 0;
    if (sec.kind === 'palette') {
      for (const b of sec.palette) if (OPAQ[b] < 15 || EMIT[b] > 0) return false;
      return true;
    }
    const d = sec.data;
    for (let i = 0; i < d.length; i++) if (OPAQ[d[i]] < 15 || EMIT[d[i]] > 0) return false;
    return true;
  }

  /**
   * 横 tw×td 列、セクション s0〜s1 の光を計算して書く。まわり 1 セクションぶんのブロックだけを読む
   * （1 つのセクションを計算するときは tw=td=1, s0=s1）。
   */
  private computeTile(cx0: number, cz0: number, tw: number, td: number, s0: number, s1: number, markDirty: boolean): void {
    const world = this.world;
    s1 = Math.min(s1, this.nSections - 1);
    // 1. 光の計算がいらないセクションを先に決める（ふさがり = 持たない、空だけ = 1 バイト）
    const need: { cx: number; sy: number; cz: number }[] = [];
    for (let cz = cz0; cz < cz0 + td; cz++) {
      for (let cx = cx0; cx < cx0 + tw; cx++) {
        if (!world.column(cx, cz)) continue;
        let maxTop = -1;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const t = this.columnTops(cx + dx, cz + dz);
            if (t && t[256] > maxTop) maxTop = t[256];
          }
        }
        for (let sy = s0; sy <= s1; sy++) {
          const prev = this.lights.get(columnKey(cx, cz))?.[sy];
          let fixed: Entry | 0 = 0;
          if (this.allOpaque(cx, sy, cz)) fixed = null; // 見えないセクションもここ（VOX-plan §6）
          else if (maxTop < sy * SECTION_SIZE - SECTION_SIZE) fixed = UNI;
          if (fixed === 0) need.push({ cx, sy, cz });
          else {
            const old = this.setEntry(cx, cz, sy, fixed);
            if (markDirty && (old !== fixed || prev === undefined)) this.markChanged(cx, sy, cz, old, fixed);
          }
        }
      }
    }
    if (need.length === 0) return;

    // 2. たて SLAB セクションずつ、まわりをふくめた箱を作って計算する
    for (let a = s0; a <= s1; a += SLAB) {
      const b = Math.min(a + SLAB - 1, s1);
      const part = need.filter((n) => n.sy >= a && n.sy <= b);
      if (part.length === 0) continue;
      this.loadRegion(cx0, cz0, tw, td, a, b);
      const yMin = Math.max(0, (a - 1) * SECTION_SIZE);
      this.lightRegion(cx0, cz0, tw, td, yMin);
      for (const n of part) this.extract(n.cx, n.sy, n.cz, cx0, cz0, yMin, markDirty);
    }
  }

  /** 計算した箱から セクションの中だけ取り出して書く */
  private extract(cx: number, sy: number, cz: number, cx0: number, cz0: number, yMin: number, markDirty: boolean): void {
    const { sky, block, rx, rz } = this;
    const out = this.out;
    const oy = sy * SECTION_SIZE - yMin;
    const ox = (cx - cx0 + 1) * SECTION_SIZE;
    const oz = (cz - cz0 + 1) * SECTION_SIZE;
    let all0 = true;
    let allF = true;
    for (let ly = 0; ly < SECTION_SIZE; ly++) {
      for (let lz = 0; lz < SECTION_SIZE; lz++) {
        const ri = ((oy + ly) * rz + oz + lz) * rx + ox;
        const oi = (ly * 16 + lz) * 16;
        for (let lx = 0; lx < SECTION_SIZE; lx++) {
          const v = (sky[ri + lx] << 4) | block[ri + lx];
          out[oi + lx] = v;
          if (v !== 0) all0 = false;
          if (v !== UNI_BYTE) allF = false;
        }
      }
    }
    this.lastRecomputeCells += out.length;
    const prev = this.lights.get(columnKey(cx, cz))?.[sy];
    if (allF || all0) {
      const e = allF ? UNI : null;
      const old = this.setEntry(cx, cz, sy, e);
      if (markDirty) this.markChanged(cx, sy, cz, old, e);
    } else if (prev instanceof Uint8Array && prev.length === out.length) {
      if (markDirty) this.markChanged(cx, sy, cz, prev, out);
      prev.set(out);
    } else {
      const e = out.slice();
      const old = this.setEntry(cx, cz, sy, e);
      if (markDirty) this.markChanged(cx, sy, cz, old, e);
    }
  }

  /**
   * 光が変わったセクションを 描画側に知らせる（old: 前の持ち方。undefined = まだ無かった）。
   * 作り直すのは そのセクションと、変わったマスが ふちから 2 マス以内のときの となりのセクションだけ
   * （面の光は 前のマスと その角のまわりを読むので 2 マス先まで届く）。
   */
  private markChanged(cx: number, sy: number, cz: number, old: Entry, now: Entry): void {
    if (old === now) return;
    const w = this.world;
    // となりのセクション 27 通り（3×3×3）のうち、作り直しが要るもの
    let need = 0;
    if (old === undefined) {
      need = (1 << 27) - 1; // はじめて計算した: まわりのセクションの面の光も 読みなおす
    } else {
      const oa = old === null ? 0 : old.length === 1 ? UNI_BYTE : -1;
      const na = now === null ? 0 : (now as Uint8Array).length === 1 ? UNI_BYTE : -1;
      if (oa >= 0 && oa === na) return;
      let changed = false;
      for (let i = 0; i < 4096; i++) {
        const a = oa >= 0 ? oa : (old as Uint8Array)[i];
        const b = na >= 0 ? na : (now as Uint8Array)[i];
        if (a === b) continue;
        changed = true;
        const lx = i & 15;
        const lz = (i >> 4) & 15;
        const ly = i >> 8;
        const ax = lx < 2 ? -1 : lx > 13 ? 1 : 0;
        const ay = ly < 2 ? -1 : ly > 13 ? 1 : 0;
        const az = lz < 2 ? -1 : lz > 13 ? 1 : 0;
        if (ax === 0 && ay === 0 && az === 0) continue;
        for (const dx of ax === 0 ? [0] : [0, ax]) {
          for (const dy of ay === 0 ? [0] : [0, ay]) {
            for (const dz of az === 0 ? [0] : [0, az]) need |= 1 << ((dx + 1) + (dy + 1) * 3 + (dz + 1) * 9);
          }
        }
      }
      if (!changed) return;
    }
    w.markSectionDirty(cx, sy, cz);
    if (need === 0) return;
    for (let k = 0; k < 27; k++) {
      if ((need & (1 << k)) === 0 || k === 13) continue;
      w.markSectionDirty(cx + (k % 3) - 1, sy + (((k / 3) | 0) % 3) - 1, cz + ((k / 9) | 0) - 1);
    }
  }

  /** 箱（横 tw+2 × td+2 列、セクション a-1〜b+1）のブロックの番号を blk に写す（読みこんでいない所は UNKNOWN） */
  private loadRegion(cx0: number, cz0: number, tw: number, td: number, a: number, b: number): void {
    const { world } = this;
    const yMin = Math.max(0, (a - 1) * SECTION_SIZE);
    const yMax = Math.min(this.sy - 1, (b + 2) * SECTION_SIZE - 1);
    const ry = yMax - yMin + 1;
    const rx = (tw + 2) * SECTION_SIZE;
    const rz = (td + 2) * SECTION_SIZE;
    this.rx = rx;
    this.rz = rz;
    this.ry = ry;
    const n = rx * rz * ry;
    if (this.blk.length < n) {
      this.blk = new Uint8Array(n);
      this.sky = new Uint8Array(n);
      this.block = new Uint8Array(n);
      this.colTop = new Int16Array(rx * rz);
      this.colOk = new Uint8Array(rx * rz);
    }
    const blk = this.blk;
    for (let ns = Math.max(0, a - 1); ns <= Math.min(this.nSections - 1, b + 1); ns++) {
      const ly0 = ns * SECTION_SIZE - yMin;
      const rows = Math.min(SECTION_SIZE, ry - ly0);
      for (let dz = 0; dz < td + 2; dz++) {
        for (let dx = 0; dx < tw + 2; dx++) {
          const sec = world.section(cx0 - 1 + dx, ns, cz0 - 1 + dz);
          const bx = dx * SECTION_SIZE;
          const bz = dz * SECTION_SIZE;
          if (sec === undefined || sec.kind === 'uniform') {
            const v = sec === undefined ? UNKNOWN : sec.block;
            for (let ly = 0; ly < rows; ly++) {
              for (let lz = 0; lz < SECTION_SIZE; lz++) {
                const o = ((ly0 + ly) * rz + bz + lz) * rx + bx;
                blk.fill(v, o, o + SECTION_SIZE);
              }
            }
          } else {
            const d = sectionToArray(sec);
            for (let ly = 0; ly < rows; ly++) {
              for (let lz = 0; lz < SECTION_SIZE; lz++) {
                const o = ((ly0 + ly) * rz + bz + lz) * rx + bx;
                const s = (ly * 16 + lz) * 16;
                blk.set(d.subarray(s, s + SECTION_SIZE), o);
              }
            }
          }
        }
      }
    }
  }

  /** blk から 空・明かりを計算して this.sky / this.block に入れる */
  private lightRegion(cx0: number, cz0: number, tw: number, td: number, yMin: number): void {
    const { world, blk, sky, block, colTop, colOk, skyQ, blockQ, ry, rx, rz } = this;
    const RL = rx * rz;
    const n = ry * RL;
    sky.fill(0, 0, n);
    block.fill(0, 0, n);
    const yMax = yMin + ry - 1;
    const wx0 = (cx0 - 1) * SECTION_SIZE;
    const wz0 = (cz0 - 1) * SECTION_SIZE;

    // 列ごとの高さ
    for (let dcz = 0; dcz < td + 2; dcz++) {
      for (let dcx = 0; dcx < tw + 2; dcx++) {
        const t = this.columnTops(cx0 - 1 + dcx, cz0 - 1 + dcz);
        const bx = dcx * SECTION_SIZE;
        const bz = dcz * SECTION_SIZE;
        for (let lz = 0; lz < SECTION_SIZE; lz++) {
          for (let lx = 0; lx < SECTION_SIZE; lx++) {
            const ci = (bz + lz) * rx + bx + lx;
            colOk[ci] = t ? 1 : 0;
            colTop[ci] = t ? t[lz * 16 + lx] : -1;
          }
        }
      }
    }

    // 1. 空の光: 高さより上は 15、そこから下へ 光を通さなくなるまで 1 マスずつ弱める
    for (let z = 0; z < rz; z++) {
      for (let x = 0; x < rx; x++) {
        const ci = z * rx + x;
        if (colOk[ci] === 0) continue;
        const top = colTop[ci];
        const from = Math.max(top + 1, yMin);
        for (let y = from; y <= yMax; y++) sky[(y - yMin) * RL + ci] = 15;
        // 15 のうち、まわりの高い列に面しているマスだけ 広げる元にする
        let nt = -1;
        if (x > 0 && colOk[ci - 1] === 1 && colTop[ci - 1] > nt) nt = colTop[ci - 1];
        if (x < rx - 1 && colOk[ci + 1] === 1 && colTop[ci + 1] > nt) nt = colTop[ci + 1];
        if (z > 0 && colOk[ci - rx] === 1 && colTop[ci - rx] > nt) nt = colTop[ci - rx];
        if (z < rz - 1 && colOk[ci + rx] === 1 && colTop[ci + rx] > nt) nt = colTop[ci + rx];
        const upTo = Math.min(nt, yMax);
        for (let y = from; y <= upTo; y++) skyQ.push((y - yMin) * RL + ci);
        // 高さから下
        if (top >= 0) {
          let s = 15;
          for (let y = Math.min(top, this.sy - 1); y >= yMin; y--) {
            const op = y > yMax ? OPAQ[world.getIndex(wx0 + x, y, wz0 + z)] : OPAQ[blk[(y - yMin) * RL + ci]];
            s = s > op ? s - op : 0;
            if (y <= yMax) {
              const i = (y - yMin) * RL + ci;
              sky[i] = s;
              if (s > 1) skyQ.push(i);
            }
            if (s === 0) break;
          }
        }
      }
    }

    // 2. ブロックの光のもと（たいまつ）
    for (let i = 0; i < n; i++) {
      const e = EMIT[blk[i]];
      if (e > 0) {
        block[i] = e;
        this.lastSpreadCells++;
        if (e > 1) blockQ.push(i);
      }
    }

    // 3. 1 マスごとに 1 弱めて広げる
    spreadLight(sky, skyQ, blk, rx, rz, ry);
    this.lastSpreadCells += spreadLight(block, blockQ, blk, rx, rz, ry);
  }
}
