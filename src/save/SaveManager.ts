import type { BlockId, Inventory, PlayerState, ScreenSettings, SpawnPoint, Vec3 } from '../contracts';
import { BLOCK_TYPES, blockIdFromIndex } from '../world/blocks/blockTypes';

/** localStorage と同じ形（テストでは偽物を渡す） */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 保存と読みこみに必要な世界の窓口（ArrayVoxelWorld がそのまま合う） */
export interface SaveWorld {
  readonly size: { x: number; y: number; z: number };
  /** ブロックの番号（BLOCK_TYPES の順）。範囲外は -1 */
  getIndex(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  isSolid(x: number, y: number, z: number): boolean;
}

/** プレイヤーの位置と向きの出し入れ（PlayerController と CameraRig をつなぐ） */
export interface SavePlayer {
  get(): PlayerState;
  set(v: { position: Vec3; velocity: Vec3; yawDeg: number; pitchDeg: number }): void;
  isThirdPerson(): boolean;
  setThirdPerson(third: boolean): void;
}

/** おとしもの ぶくろの出し入れ（M3 §2.10）。ticksLeft 以外が変わったときだけ「変わった」と数える */
export interface SaveBags {
  serialize(): Array<{ ticksLeft: number } & Record<string, unknown>>;
  deserialize(data: unknown): void;
}

/** 1 日の時刻の出し入れ（TimeOfDayImpl が合う） */
export interface SaveClock {
  dayTick(): number;
  day(): number;
  set(dayTick: number): void;
  setDay(day: number): void;
}

export interface SaveDeps {
  world: SaveWorld;
  seed: number;
  /** 島を作った直後の世界（snapshotWorld で取る）。これとちがうマスだけ保存する */
  baseline: Uint8Array;
  inventory: Inventory;
  player: SavePlayer;
  spawn: () => SpawnPoint;
  /** null = 保存しない（?nosave=1） */
  store: KeyValueStore | null;
  /** 今までに更新した回数 */
  tick: () => number;
  settings: Pick<ScreenSettings, 'saveIntervalTicks'>;
  /** M3: おとしもの ぶくろ。なければ保存しない */
  bags?: SaveBags;
  /** 時刻と何日目。なければ保存しない */
  clock?: SaveClock;
}

export interface SaveInfo {
  enabled: boolean;
  lastSavedTick: number | null;
  lastMs: number;
  changedBlocks: number;
  bytes: number;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY_PREFIX = 'rikkun-world-save-v1-';
export const saveKey = (seed: number): string => `${SAVE_KEY_PREFIX}${seed}`;

/** 体の箱（M1-02 §4.1）。置き直しの重なり判定用 */
const BODY = { halfWidth: 0.3, height: 1.8 } as const;
const EPS = 1e-4;

/** 世界のブロック番号を全部写し取る（島を作った直後に呼ぶ） */
export function snapshotWorld(world: SaveWorld): Uint8Array {
  const { x: sx, y: sy, z: sz } = world.size;
  const out = new Uint8Array(sx * sy * sz);
  let i = 0;
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) out[i++] = world.getIndex(x, y, z);
  return out;
}

/** 体の箱が、ブロックと重なる・世界の横や下の外に出るなら false（上にはみ出すのは OK） */
export function isBodyPlaceable(world: SaveWorld, p: Vec3): boolean {
  if (![p.x, p.y, p.z].every(Number.isFinite)) return false;
  const x0 = Math.floor(p.x - BODY.halfWidth + EPS);
  const x1 = Math.floor(p.x + BODY.halfWidth - EPS);
  const z0 = Math.floor(p.z - BODY.halfWidth + EPS);
  const z1 = Math.floor(p.z + BODY.halfWidth - EPS);
  const y0 = Math.floor(p.y + EPS);
  const y1 = Math.floor(p.y + BODY.height - EPS);
  if (x0 < 0 || z0 < 0 || y0 < 0 || x1 >= world.size.x || z1 >= world.size.z) return false;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) if (world.isSolid(x, y, z)) return false;
  return true;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * 自動セーブ（M2 §2.7・§4.4）。島との差分・持ち物・プレイヤーを localStorage に保存する。
 * 子どもには何も見せない。失敗しても遊びは続ける。
 */
export class SaveManager {
  private lastBody: string | null = null;
  private lastCheckTick = 0;
  private lastTimeKey = '';
  private infoState: SaveInfo;

  constructor(private readonly d: SaveDeps) {
    this.infoState = { enabled: d.store !== null, lastSavedTick: null, lastMs: 0, changedBlocks: 0, bytes: 0 };
  }

  info(): SaveInfo {
    return { ...this.infoState };
  }

  /** 起動のとき: 保存があれば世界・持ち物・プレイヤーを戻す。戻したら true */
  load(): boolean {
    this.lastCheckTick = this.d.tick();
    const store = this.d.store;
    if (!store) return false;
    try {
      const raw = store.getItem(saveKey(this.d.seed));
      if (raw === null) return false;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (!data || data.version !== SAVE_VERSION || data.seed !== this.d.seed) return false;
      const blocks = data.blocks;
      if (!Array.isArray(blocks) || blocks.length % 2 !== 0) return false;
      const { x: sx, y: sy, z: sz } = this.d.world.size;
      const total = sx * sy * sz;
      // 先に全部しらべる（途中でこわれていたら何も変えない）
      for (let k = 0; k < blocks.length; k += 2) {
        const i = blocks[k];
        const v = blocks[k + 1];
        if (!Number.isInteger(i) || i < 0 || i >= total) return false;
        if (!Number.isInteger(v) || v < 0 || v >= BLOCK_TYPES.length) return false;
      }
      for (let k = 0; k < blocks.length; k += 2) {
        const i = blocks[k] as number;
        const x = i % sx;
        const z = Math.floor(i / sx) % sz;
        const y = Math.floor(i / (sx * sz));
        this.d.world.setBlock(x, y, z, blockIdFromIndex(blocks[k + 1] as number));
      }
      try {
        this.d.inventory.deserialize(data.inventory);
      } catch {
        this.d.inventory.clear();
      }
      this.restorePlayer(data.player);
      try {
        this.d.bags?.deserialize(data.bags);
      } catch {
        this.d.bags?.deserialize([]);
      }
      this.restoreTime(data.time);
      this.lastBody = this.makeBody().body;
      this.lastTimeKey = this.timeKey();
      this.infoState.changedBlocks = blocks.length / 2;
      return true;
    } catch {
      return false; // こわれた保存は使わない（次の保存で上書き）
    }
  }

  /** すぐ保存する */
  now(): void {
    this.write(true);
  }

  /** 前の保存から何か変わっていれば保存する（ロックが外れたとき・画面を閉じたとき・ページを閉じるとき） */
  saveIfChanged(): void {
    this.write(false);
  }

  /** 毎ステップ呼ぶ。`currentTick` はこのステップが終わったあとの tick */
  update(currentTick: number): void {
    if (!this.d.store) return;
    if (currentTick - this.lastCheckTick < this.d.settings.saveIntervalTicks) return;
    this.lastCheckTick = currentTick;
    this.write(false);
  }

  /** 今のシードの保存を消す（遊んでいる世界はそのまま） */
  clear(): void {
    const store = this.d.store;
    if (!store) return;
    try {
      store.removeItem(saveKey(this.d.seed));
    } catch {
      /* 何もしない */
    }
    this.lastBody = null;
    this.infoState.lastSavedTick = null;
    this.infoState.bytes = 0;
    this.infoState.changedBlocks = 0;
  }

  /** ページを閉じる・かくれるときに保存する。戻り値で解除 */
  bindPageEvents(win: Window, doc: Document): () => void {
    const onHide = () => this.write(false, true);
    const onVisibility = () => {
      if (doc.hidden) onHide();
    };
    win.addEventListener('pagehide', onHide);
    doc.addEventListener('visibilitychange', onVisibility);
    return () => {
      win.removeEventListener('pagehide', onHide);
      doc.removeEventListener('visibilitychange', onVisibility);
    };
  }

  private timeKey(): string {
    const c = this.d.clock;
    return c ? `${c.day()}:${c.dayTick()}` : '';
  }

  /** 古い保存（time なし）や こわれた値は 昼の始まり */
  private restoreTime(raw: unknown): void {
    const c = this.d.clock;
    if (!c) return;
    const t = raw as { day?: unknown; dayTick?: unknown } | null | undefined;
    const day = Number(t?.day);
    const tick = Number(t?.dayTick);
    if (t && Number.isInteger(day) && day >= 0 && Number.isFinite(tick) && tick >= 0) {
      c.setDay(day);
      c.set(tick);
    } else {
      c.setDay(0);
      c.set(0);
    }
  }

  private restorePlayer(raw: unknown): void {
    const p = raw as Partial<Record<'x' | 'y' | 'z' | 'yaw' | 'pitch', unknown>> & { third?: unknown };
    const pos = { x: Number(p?.x), y: Number(p?.y), z: Number(p?.z) };
    const yaw = Number(p?.yaw);
    const pitch = Number(p?.pitch);
    const zero = { x: 0, y: 0, z: 0 };
    if (p && isBodyPlaceable(this.d.world, pos) && Number.isFinite(yaw) && Number.isFinite(pitch)) {
      this.d.player.set({ position: pos, velocity: zero, yawDeg: yaw, pitchDeg: pitch });
    } else {
      const s = this.d.spawn();
      this.d.player.set({ position: { x: s.x, y: s.y, z: s.z }, velocity: zero, yawDeg: s.yawDeg, pitchDeg: s.pitchDeg });
    }
    this.d.player.setThirdPerson(p?.third === true);
  }

  /** 島とちがうマス・持ち物・プレイヤー（tick なし）を文字にする */
  private makeBody(): { body: string; full: string; changed: number } {
    const { world, baseline } = this.d;
    const { x: sx, y: sy, z: sz } = world.size;
    const blocks: number[] = [];
    let i = 0;
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++, i++) {
          const v = world.getIndex(x, y, z);
          if (v !== baseline[i]) blocks.push(i, v);
        }
    const st = this.d.player.get();
    const bagsFull = this.d.bags?.serialize() ?? [];
    // 比べるときは のこりステップを入れない（毎ステップ変わるため）
    const bagsKey = bagsFull.map((b) => ({ ...b, ticksLeft: 0 }));
    const make = (bags: unknown) => JSON.stringify({
      version: SAVE_VERSION,
      seed: this.d.seed,
      blocks,
      inventory: this.d.inventory.serialize(),
      player: {
        x: round(st.position.x),
        y: round(st.position.y),
        z: round(st.position.z),
        yaw: round(st.yawDeg),
        pitch: round(st.pitchDeg),
        third: this.d.player.isThirdPerson(),
      },
      bags,
    });
    return { body: make(bagsKey), full: make(bagsFull), changed: blocks.length / 2 };
  }

  private write(force: boolean, flushTime = false): void {
    const store = this.d.store;
    if (!store) return;
    const t0 = performance.now();
    this.lastCheckTick = this.d.tick(); // 「前の保存から 600 ステップ」の数え始め
    try {
      const { body, full, changed } = this.makeBody();
      const timeKey = this.timeKey();
      if (!force && body === this.lastBody && !(flushTime && timeKey !== this.lastTimeKey)) return;
      const tick = this.d.tick();
      const c = this.d.clock;
      const timeText = c ? `,"time":{"day":${c.day()},"dayTick":${c.dayTick()}}` : '';
      const text = `${full.slice(0, -1)}${timeText},"tick":${tick}}`;
      this.lastTimeKey = timeKey;
      store.setItem(saveKey(this.d.seed), text);
      this.lastBody = body;
      this.infoState = {
        enabled: true,
        lastSavedTick: tick,
        lastMs: performance.now() - t0,
        changedBlocks: changed,
        bytes: text.length,
      };
    } catch {
      // 容量いっぱいなど: 保存せずに遊び続ける。子どもには何も出さない
      this.infoState.lastMs = performance.now() - t0;
    }
  }
}

/** 住所の ?reset=1 / ?nosave=1 */
export function parseSaveOptions(search: string): { reset: boolean; nosave: boolean } {
  const q = new URLSearchParams(search);
  const on = (name: string) => {
    const v = q.get(name);
    return v !== null && v !== '0' && v !== 'false';
  };
  return { reset: on('reset'), nosave: on('nosave') };
}

/** 住所から reset を消した新しい住所（再読みこみでまた消えないように） */
export function stripResetParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('reset');
  return url.pathname + url.search + url.hash;
}
