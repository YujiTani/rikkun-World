import { InventoryImpl } from '../../inventory/Inventory';
import type { ItemId } from '../../contracts';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { genColumn, type Pt } from './mineShaftKit';
import {
  hookF,
  tableOf,
  yakataSample,
  type MineHookF,
  type Look,
  type Yakata,
  type YakataEvent,
  type YakataPlayer,
  type YakataPorts,
  type YakataSampleRow,
  type YakataTable,
  type YakataYokaiRow,
  type YokaiKindId,
} from './mineYakataKit';
import { yakataBox, gateCells } from './mineYakataReport';

/**
 * MINE-1F の 挑戦の 係を テストする 道具〔F4・F5・F6・F7・F8・F12・F13 の ユニットが 使う〕。約束は mineYakataKit.ts の 冒頭。
 *   やかた 1 つの 列だけ 読みこんだ 世界・本物の 窓口〔`createMineHook`〕・うその 妖怪〔`FakeYokai`〕・本物の 持ち物〔2 人ぶん〕。
 */

/** うその 妖怪の 係: `YakataPorts.yokai` の とおりに 動く。たおす〔`kill`〕・たおさずに 消す〔`vanish`〕・ふつうの 妖怪を 足す〔`addOrdinary`〕 */
export class FakeYokai {
  private nextId = 100;
  readonly rows: YakataYokaiRow[] = [];
  readonly spawned: { id: number; kind: YokaiKindId; title: string; x: number; y: number; z: number; opts: { title: string; free: boolean; graceSteps: number } }[] = [];
  readonly left: number[] = [];
  spawn(kind: YokaiKindId, x: number, y: number, z: number, opts: { title: 'oyabun' | 'taisho'; free: true; graceSteps: number }): number {
    const id = this.nextId++;
    this.rows.push({ id, kind, title: opts.title, x, y, z });
    this.spawned.push({ id, kind, title: opts.title, x, y, z, opts: { ...opts } });
    return id;
  }
  list(): YakataYokaiRow[] {
    return this.rows.map((r) => ({ ...r }));
  }
  leave(ids: readonly number[]): void {
    for (const id of ids) {
      const i = this.rows.findIndex((r) => r.id === id);
      if (i >= 0) {
        this.rows.splice(i, 1);
        this.left.push(id);
      }
    }
  }
  addOrdinary(kind: YokaiKindId, x: number, y: number, z: number): number {
    const id = this.nextId++;
    this.rows.push({ id, kind, title: 'none', x, y, z });
    return id;
  }
  /** たおす〔プレイヤーが たおした〕 */
  kill(id: number): void {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) this.rows.splice(i, 1);
  }
  /** たおさずに 消える〔列が 読めなく なった など〕 */
  vanish(id: number): void {
    this.kill(id);
  }
  alive(id: number): boolean {
    return this.rows.some((r) => r.id === id);
  }
}

export interface YakataRig {
  row: YakataSampleRow;
  y: Yakata;
  T: YakataTable;
  seed: number;
  world: ArrayVoxelWorld;
  hook: MineHookF;
  yokai: FakeYokai;
  inv: [InventoryImpl, InventoryImpl];
  drops: { who: 1 | 2; item: ItemId; count: number }[];
  says: string[];
  telops: ItemId[];
  opened: number[];
  events: YakataEvent[];
  players: YakataPlayer[];
  /** 今 あける 人〔`run` の あいだ〕 */
  who: () => 1 | 2;
  /** その 人を あるマスに 立たせる〔足〕 */
  stand(who: 1 | 2, p: Pt): void;
  /** 右クリック〔宝箱の どちらの マスでも〕 */
  open(who?: 1 | 2, cell?: 0 | 1): void;
  step(n?: number): void;
  eventsOf<K extends YakataEvent['type']>(type: K): Extract<YakataEvent, { type: K }>[];
  clearEvents(): void;
  /** 今 出て いる 二つ名の 妖怪 */
  foes(): YakataYokaiRow[];
  /** 持ち物の ぜんぶ〔item → 数〕 */
  bag(who?: 1 | 2): Map<string, number>;
}

const bagOf = (inv: InventoryImpl): Map<string, number> => {
  const m = new Map<string, number>();
  for (const s of inv.slots()) if (s) m.set(s.item, (m.get(s.item) ?? 0) + s.count);
  return m;
};

/** やかたの ある 列〔大広間・横穴・まわり〕だけ 読みこんだ 世界と 窓口を 作る */
export function makeRig(row: YakataSampleRow, o: { twoPlayers?: boolean } = {}): YakataRig {
  const T = tableOf(row.seed);
  const y = row.yakata;
  const b = yakataBox(y, T);
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  for (let cz = (b.z0 - 4) >> 4; cz <= (b.z1 + 4) >> 4; cz++) for (let cx = (b.x0 - 4) >> 4; cx <= (b.x1 + 4) >> 4; cx++) world.loadColumn(genColumn(row.seed, cx, cz));
  const yokai = new FakeYokai();
  const inv: [InventoryImpl, InventoryImpl] = [new InventoryImpl(), new InventoryImpl()];
  const drops: YakataRig['drops'] = [];
  const says: string[] = [];
  const telops: ItemId[] = [];
  const opened: number[] = [];
  const events: YakataEvent[] = [];
  const hall = y.hall;
  const players: YakataPlayer[] = [{ who: 1, x: hall.x0 + 8.5, y: hall.y, z: hall.z0 + 8.5, dead: false }];
  if (o.twoPlayers) players.push({ who: 2, x: hall.x0 + 8.5, y: hall.y, z: hall.z0 + 7.5, dead: false });
  let cur: 1 | 2 = 1;
  const chest = {
    add: (item: ItemId, count: number): number => inv[cur - 1].add(item, count),
    drop: (item: ItemId, count: number): void => void drops.push({ who: cur, item, count }),
    say: (t: string): void => void says.push(t),
    telop: (item: ItemId): void => void telops.push(item),
    opened: (tier: number): void => void opened.push(tier),
  };
  const ports: YakataPorts = {
    players: () => players.map((p) => ({ ...p })),
    yokai,
    run: (who, fn) => {
      const prev = cur;
      cur = who;
      try {
        fn();
      } finally {
        cur = prev;
      }
    },
    emit: (e) => void events.push(e),
  };
  const hook = hookF(row.seed, { world, chest, yakata: ports });
  const rig: YakataRig = {
    row,
    y,
    T,
    seed: row.seed,
    world,
    hook,
    yokai,
    inv,
    drops,
    says,
    telops,
    opened,
    events,
    players,
    who: () => cur,
    stand(who, p) {
      const pl = players.find((q) => q.who === who)!;
      pl.x = p.x + 0.5;
      pl.y = p.y;
      pl.z = p.z + 0.5;
    },
    open(who = 1, cell = 0) {
      const c = y.chest.cells[cell]!;
      ports.run(who, () => hook.open(c.x, c.y, c.z, who));
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) hook.yakataStep();
    },
    eventsOf: (type) => events.filter((e): e is never => e.type === type) as never,
    clearEvents: () => void events.splice(0, events.length),
    foes: () => yokai.list().filter((r) => r.title === 'oyabun' || r.title === 'taisho'),
    bag: (who = 1) => bagOf(inv[who - 1]),
  };
  return rig;
}

/** 門の 12 マスの ブロック id の 並び */
export const gateIds = (r: YakataRig): string[] => gateCells(r.y, r.T).map((c) => String(r.world.getBlock(c.x, c.y, c.z)));
export const lookBlocks = (r: YakataRig): { kabe: string; yuka: string; dan: string; taimatsu: string } => r.T.lookBlocks[r.y.look];

/** あける 立ち場所の 候補〔祭壇の 前の まん中・下の 段・大広間の 床の 遠い 所・横〕 */
export function openSpots(r: YakataRig): Pt[] {
  const y = r.y;
  const c = y.chest.cells;
  const front = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[y.chest.front];
  const cx = c.reduce((s, p) => s + p.x, 0) / c.length;
  const cz = c.reduce((s, p) => s + p.z, 0) / c.length;
  const at = (k: number, lat: number): Pt => ({ x: Math.round(cx + front[0] * k - front[1] * lat), y: y.hall.y, z: Math.round(cz + front[1] * k + front[0] * lat) });
  const upper = { ...at(1, 0), y: y.altar.y + 1 };
  const lower = { ...at(2, 0), y: y.altar.y };
  return [upper, lower, at(5, 0), at(5, 3), at(5, -3)];
}

/** うすい 標本: A・B の やかたを 1 つずつ〔シード 1 つに 2 つまで〕 */
export function pickBoth(): YakataSampleRow[] {
  return yakataSample((all) => (['maou', 'otera'] as Look[]).every((l) => all.some((r) => r.yakata.look === l)), { perSeed: 2 });
}
export const oneOf = (rows: readonly YakataSampleRow[], look: Look): YakataSampleRow | undefined => rows.find((r) => r.yakata.look === look);
