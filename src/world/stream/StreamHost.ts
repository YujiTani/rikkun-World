import type { BlockId, ChunkColumn } from '../../contracts';
import type { PendingColumn } from '../../save/streamRestore';
import { applyPendingColumn } from '../../save/streamRestore';
import type { WorldGenInfo } from '../gen/populate';
import { regionRect } from '../gen/region';
import type { WorldRenderer } from '../render/WorldRenderer';
import type { ChunkedVoxelWorld } from '../VoxelWorld';
import { ChunkStream, type StreamInfo, type StreamIO } from './ChunkStream';
import { colKey } from './ring';

/** プレイヤーを どこへ どう立たせるか */
export interface StandPoint {
  x: number;
  /** null = そろったとき 地面の上（groundHeight + 1） */
  y: number | null;
  z: number;
  yawDeg?: number;
  pitchDeg?: number;
}

/** 立たせる場所（y が 決まったもの） */
export interface PlacedPoint {
  x: number;
  y: number;
  z: number;
  yawDeg?: number;
  pitchDeg?: number;
}

export interface StreamHostDeps {
  world: ChunkedVoxelWorld;
  renderer: WorldRenderer;
  io: StreamIO;
  info: WorldGenInfo;
  seed: number;
  /** 新しい世界のとき true: 置きもの（ふるい畑・やせいの やさい）を R が生成ずみになったとき 1 回だけ書く（K5） */
  newWorld: boolean;
  applyPlacement: () => void;
  /** 保険（pagehide）のマス。列を読みこんだとき当てる（K6） */
  pending?: Map<number, PendingColumn>;
  /** 立たせる（プレイヤーを動かす。main が つなぐ） */
  placePlayer: (p: PlacedPoint) => void;
  /** 列を読みこんだコマに 1 回（農業の数えなおし） */
  onColumnsLoaded?: () => void;
  onReady?: (kind: 'boot' | 'wait') => void;
  now?: () => number;
}

/**
 * ストリーミングの つなぎ（ChunkStream と 世界・光・メッシュ・保存・置きもの・プレイヤーの位置）。VOX-D §8。
 * 起動・テレポート・遠くへもどる は「中心を変えて 輪を作りなおし、そろったら 立たせる」の 1 つの道すじ。
 */
export class StreamHost {
  readonly stream: ChunkStream;
  private stand: StandPoint | null = null;
  private placed: boolean;
  private rescanNeeded = false;
  private firstReady = false;
  private readonly holdCols = new Set<number>();
  private readonly regionCols: { cx: number; cz: number }[] = [];

  constructor(private readonly d: StreamHostDeps) {
    this.placed = !d.newWorld;
    // R（G1）と そのまわり 1 列は、置きものを書くまで 光・メッシュを待つ（S4・K5）
    const R = regionRect(d.seed);
    for (let cz = R.z0 >> 4; cz <= (R.z1 - 1) >> 4; cz++) for (let cx = R.x0 >> 4; cx <= (R.x1 - 1) >> 4; cx++) this.regionCols.push({ cx, cz });
    for (let cz = (R.z0 >> 4) - 1; cz <= ((R.z1 - 1) >> 4) + 1; cz++) for (let cx = (R.x0 >> 4) - 1; cx <= ((R.x1 - 1) >> 4) + 1; cx++) this.holdCols.add(colKey(cx, cz));
    const pending = d.pending;
    this.stream = new ChunkStream({
      world: {
        loadColumn: (c: ChunkColumn) => d.world.loadColumn(c),
        unloadColumn: (cx, cz) => {
          d.renderer.noteUnloaded(cx, cz);
          return d.world.unloadColumn(cx, cz);
        },
        column: (cx, cz) => d.world.column(cx, cz),
        isSaveDirty: (cx, cz) => d.world.isSaveDirty(cx, cz),
        requeueSaveDirty: (l) => d.world.requeueSaveDirty(l),
      },
      light: d.renderer.streamLight(),
      mesh: d.renderer.streamMesh(),
      io: d.io,
      now: d.now,
      holdLight: (cx, cz) => !this.placed && this.holdCols.has(colKey(cx, cz)),
      onLoaded: (cx, cz) => {
        this.rescanNeeded = true;
        const k = colKey(cx, cz);
        const p = pending?.get(k);
        if (p !== undefined) {
          applyPendingColumn(d.world, p);
          pending!.delete(k);
        }
      },
      required: pending ? () => [...pending.values()].map((p) => ({ cx: p.cx, cz: p.cz })) : undefined,
      onReady: (kind) => this.onReady(kind),
    });
  }

  private onReady(kind: 'boot' | 'wait'): void {
    const s = this.stand;
    this.stand = null;
    if (s !== null) {
      const y = s.y ?? this.d.info.groundHeight(Math.floor(s.x), Math.floor(s.z)) + 1;
      this.d.placePlayer({ ...s, y });
    }
    this.firstReady = true;
    this.d.onReady?.(kind);
  }

  /** 起動のあと 1 回でも そろったか（`__rikkun.ready` の元） */
  get everReady(): boolean {
    return this.firstReady;
  }

  /** 立たせる場所が決まっていて待っているか（その間は 中心を プレイヤーに ついていかせない） */
  get waiting(): boolean {
    return this.stand !== null || !this.stream.ready;
  }

  /** 起動: この中心から 近い順に作る。プレイヤーは すでに その位置にいる */
  boot(cx: number, cz: number): void {
    this.stream.restart(cx, cz, 'boot');
  }

  /** テレポート・遠くへもどる: (x, z) の列を中心に 輪を作りなおし、そろったら立たせる */
  goTo(p: StandPoint, force = false): void {
    const cx = Math.floor(p.x) >> 4;
    const cz = Math.floor(p.z) >> 4;
    if (!force && this.stream.ready && this.stream.isAreaReady(cx, cz)) {
      // もう読みこまれている（近くの もどり）: すぐ立たせる。カードは出ない
      this.stream.setCenter(cx, cz);
      const y = p.y ?? this.d.info.groundHeight(Math.floor(p.x), Math.floor(p.z)) + 1;
      this.d.placePlayer({ ...p, y });
      return;
    }
    this.stand = p;
    this.stream.restart(cx, cz, 'wait');
  }

  /** 毎コマ（固定ステップ）。px, pz = プレイヤーの位置 */
  update(px: number, pz: number): void {
    if (this.stream.ready && this.stand === null) this.stream.setCenter(Math.floor(px) >> 4, Math.floor(pz) >> 4);
    this.stream.update();
    if (!this.placed) this.tryPlace();
    if (this.rescanNeeded) {
      this.rescanNeeded = false;
      this.d.onColumnsLoaded?.();
    }
  }

  /** R の列が ぜんぶ 生成ずみになったら 置きものを 1 回だけ書く（K5） */
  private tryPlace(): void {
    for (const c of this.regionCols) if (!this.stream.isGenerated(c.cx, c.cz)) return;
    this.placed = true;
    this.d.applyPlacement();
  }

  info(): StreamInfo {
    return this.stream.info();
  }

  /** 置きものを 書いたか（新しい世界のとき。そうでなければ 最初から true） */
  get placementDone(): boolean {
    return this.placed;
  }
}

export type { BlockId };
