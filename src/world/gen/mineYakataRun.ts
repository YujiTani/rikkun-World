import { YAKATA_TEXT } from '../../ui/yakataText';
import type { BlockId } from '../../contracts';
import { chestBlockId, chestBlockInfo } from '../blocks/chestBlock';
import { giveChest, type ChestPorts, type ChestWorld } from './mineHookShaft';
import { foeSpots, type YakataPlan } from './mineYakataPlan';
import type { YakataPorts } from './mineYakataPorts';
import { LOOK_LIST, YAKATA_TABLE as T } from './mineYakataConfig';
import type { Box3, Yakata } from './mineYakataTypes';
import type { SaveBlockOverride } from '../../save/saveOverride';
import type { Pt } from './mineShaftTypes';

/**
 * やかたの 挑戦の 係（MINE-1F §4.7・§5）: あけた コマの はじまり・毎ステップの 見まわり・かち・まけ・保存の 置きかえ。
 * 状態は このセッションの 中だけ おぼえる〔保存した 世界を 開くと「まだ」。かった 宝箱は あいた まま なので「かった」〕。
 */

/** 門から 大広間の 中へ 押し出す 長さ〔マス〕 */
const PUSH_OUT = 2;

export type YakataStateName = 'mada' | 'chosen' | 'katta';
export interface YakataStateInfo {
  state: YakataStateName;
  left: number;
  foes: number[];
  floating: { item: string; count: number }[] | null;
}

/** 宝箱を さわった ときの 言葉〔6 歳向け: ひらがな・カタカナ〕 */
const SAY = {
  locked: YAKATA_TEXT.chestLocked,
  empty: 'からっぽ だよ',
  afterLose: YAKATA_TEXT.afterLose,
} as const;

export interface RunDeps {
  world: ChestWorld | undefined;
  chest: ChestPorts | undefined;
  ports: YakataPorts | undefined;
  /** (x, y, z) の 宝箱の やかた〔計画から〕 */
  planAtChest(x: number, y: number, z: number): YakataPlan | null;
  /** (x, y, z) を ふくむ やかたの 箱〔先読みずみの 区画だけ〕 */
  builtReady(x: number, y: number, z: number): { yakata: Yakata; box: Box3 } | null;
  /** (x, y, z) を ふくむ やかたの 箱〔なければ 計画を すすめて さがす〕 */
  builtAt(x: number, y: number, z: number): { yakata: Yakata; box: Box3 } | null;
}

interface Run {
  y: Yakata;
  who: 1 | 2;
  members: Set<1 | 2>;
  ids: number[];
  floating: { item: string; count: number }[];
  plan: YakataPlan;
  lastLeft: number;
}

const ALL_LOOK_IDS: ReadonlySet<string> = new Set(LOOK_LIST.flatMap((l) => Object.values(T.lookBlocks[l])));
const HALL_PAD_Y = 3;

const gateOf = (y: Yakata): Pt[] => {
  const out: Pt[] = [];
  for (let k = 0; k < T.gate.height; k++) for (let x = y.gate.x0; x <= y.gate.x1; x++) for (let z = y.gate.z0; z <= y.gate.z1; z++) out.push({ x, y: y.gate.y + k, z });
  return out;
};

/** 門の 絵の 飾りの 箱〔まん中の 下・はば・奥行き・高さ〕 */
const gateBox = (y: Yakata): { x: number; y: number; z: number; w: number; d: number; h: number } => ({
  x: (y.gate.x0 + y.gate.x1 + 1) / 2,
  y: y.gate.y,
  z: (y.gate.z0 + y.gate.z1 + 1) / 2,
  w: y.gate.x1 - y.gate.x0 + 1,
  d: y.gate.z1 - y.gate.z0 + 1,
  h: T.gate.height,
});
/** うかぶ 中身の 場所: 上の 段の 宝箱の まわり〔宝箱の 2 マスと その 前〕。最大 4 つ */
const FLOAT_MAX = 4;
function floatCells(y: Yakata, items: readonly { item: string }[]): { item: string; x: number; y: number; z: number }[] {
  const cs = y.chest.cells;
  const dx = Math.sign(y.hall.x0 + y.hall.x1 - (y.gate.x0 + y.gate.x1)) || 0; // 門から 大広間の むき〔前の 逆〕
  const dz = Math.sign(y.hall.z0 + y.hall.z1 - (y.gate.z0 + y.gate.z1)) || 0;
  const spots = [cs[0]!, cs[1]!, { x: cs[0]!.x - (Math.abs(dx) > Math.abs(dz) ? dx : 0), z: cs[0]!.z - (Math.abs(dx) > Math.abs(dz) ? 0 : dz) }, { x: cs[1]!.x - (Math.abs(dx) > Math.abs(dz) ? dx : 0), z: cs[1]!.z - (Math.abs(dx) > Math.abs(dz) ? 0 : dz) }];
  return items.slice(0, FLOAT_MAX).map((it, i) => ({ item: it.item, x: spots[i]!.x + 0.5, y: y.chest.y, z: spots[i]!.z + 0.5 }));
}

/** 門の 内がわ〔大広間の 側〕の 立つ 場所: 門の まん中から 大広間の まん中へ 2 マス */
function pushOut(y: Yakata, footY: number): { x: number; y: number; z: number } {
  const gx = (y.gate.x0 + y.gate.x1 + 1) / 2;
  const gz = (y.gate.z0 + y.gate.z1 + 1) / 2;
  const hx = (y.hall.x0 + y.hall.x1 + 1) / 2;
  const hz = (y.hall.z0 + y.hall.z1 + 1) / 2;
  const alongX = Math.abs(hx - gx) >= Math.abs(hz - gz);
  return { x: alongX ? gx + Math.sign(hx - gx) * PUSH_OUT : gx, y: footY, z: alongX ? gz : gz + Math.sign(hz - gz) * PUSH_OUT };
}

export function createYakataRun(d: RunDeps) {
  const runs = new Map<string, Run>();
  const won = new Set<string>();
  const pendingSay = new Set<string>();
  /** 人ごとに 今 入って いる 大広間 */
  const inHall = new Map<1 | 2, string | null>();
  /** 人ごとに 今 いる やかた〔大広間か 横穴。場面の 材料〕 */
  const nearOf = new Map<1 | 2, Yakata | null>();

  const inHallRect = (y: Yakata, p: { x: number; y: number; z: number }): boolean =>
    Math.floor(p.x) >= y.hall.x0 && Math.floor(p.x) <= y.hall.x1 && Math.floor(p.z) >= y.hall.z0 && Math.floor(p.z) <= y.hall.z1 && p.y >= y.hall.y - 1 && p.y < y.hall.y + T.hall.height + HALL_PAD_Y;

  const inPassage = (y: Yakata, p: { x: number; y: number; z: number }): boolean => {
    if (p.y < y.hall.y - 1 || p.y >= y.hall.y + T.passage.height + HALL_PAD_Y) return false;
    const half = Math.floor(T.passage.width / 2);
    for (const c of y.passage) if (Math.abs(Math.floor(p.x) - c.x) <= half && Math.abs(Math.floor(p.z) - c.z) <= half) return true;
    return false;
  };

  const chestOpen = (y: Yakata): boolean => {
    const c = y.chest.cells[0]!;
    const info = d.world ? chestBlockInfo(d.world.getBlock(c.x, c.y, c.z)) : null;
    return info?.open === true;
  };

  function stateOf(y: Yakata): YakataStateName {
    if (runs.has(y.id)) return 'chosen';
    return won.has(y.id) || chestOpen(y) ? 'katta' : 'mada';
  }

  function setChest(y: Yakata, open: boolean): void {
    if (!d.world?.setBlock) return;
    y.chest.cells.forEach((c, i) => d.world!.setBlock!(c.x, c.y, c.z, chestBlockId(4, open, i === 1) as BlockId));
  }
  function setGate(y: Yakata, closed: boolean): void {
    if (!d.world?.setBlock) return;
    const id = (closed ? T.lookBlocks[y.look].kabe : 'air') as BlockId;
    for (const c of gateOf(y)) d.world.setBlock(c.x, c.y, c.z, id);
  }

  /** その 妖怪は 生きて いるか〔`has` が なければ 一覧から〕 */
  const isAlive = (id: number): boolean => {
    const y = d.ports?.yokai;
    if (!y) return false;
    return y.has ? y.has(id) : y.list().some((q) => q.id === id);
  };
  function alive(r: Run): number[] {
    return r.ids.filter(isAlive);
  }
  /** 生きて いる 数〔毎ステップ。何も 作らない〕 */
  function aliveCount(r: Run): number {
    let n = 0;
    for (const id of r.ids) if (isAlive(id)) n++;
    return n;
  }

  function start(plan: YakataPlan, who: 1 | 2): void {
    const ports = d.ports;
    if (!ports) return;
    const y = plan.yakata;
    const players = ports.players();
    const me = players.find((p) => p.who === who);
    const members = new Set<1 | 2>([who]);
    const gateCells = gateOf(y);
    const onGate = (p: { x: number; y: number; z: number }): boolean => gateCells.some((c) => c.x === Math.floor(p.x) && c.z === Math.floor(p.z) && Math.floor(p.y) === c.y);
    for (const p of players) if (inHallRect(y, p) || onGate(p)) members.add(p.who); // 大広間・門に いた 人 みんな〔§5〕
    // 大広間の ふつうの 妖怪は そっと 去る〔二つ名の 妖怪は まだ いない〕
    const leave = ports.yokai.list().filter((q) => q.title !== 'oyabun' && q.title !== 'taisho' && inHallRect(y, q)).map((q) => q.id);
    if (leave.length > 0) ports.yokai.leave(leave);
    setChest(y, true);
    setGate(y, true);
    // 門の マスに いた 人は 大広間の 中へ 押し出す〔門に うまらない〕
    const gate = gateOf(y);
    for (const p of players) {
      if (!gate.some((c) => c.x === Math.floor(p.x) && c.z === Math.floor(p.z) && Math.floor(p.y) >= c.y && Math.floor(p.y) < c.y + T.gate.height)) continue;
      ports.movePlayer?.(p.who, pushOut(y, p.y));
    }
    const ox = me ? me.x : y.chest.x + 0.5;
    const oz = me ? me.z : y.chest.z + 0.5;
    const away = T.spawn.awayFromOpener;
    const spots = foeSpots(y, (p) => Math.hypot(p.x + 0.5 - ox, p.z + 0.5 - oz) <= away) ?? foeSpots(y, () => false) ?? [];
    const ids = plan.foes.map((f, i) => {
      const at = spots[i] ?? f.at;
      return ports.yokai.spawn(f.kind, at.x + 0.5, at.y, at.z + 0.5, { title: f.rank, free: true, graceSteps: T.graceSteps });
    });
    const run: Run = { y, who, members, ids, floating: plan.chestPreview.map((i) => ({ ...i })), plan, lastLeft: ids.length };
    runs.set(y.id, run);
    ports.emit({ type: 'gate', what: 'close', gate: gateBox(y) });
    ports.emit({ type: 'float', cells: floatCells(y, plan.chestPreview) });
    ports.emit({ type: 'sfx', name: 'yakataGateClose' });
    ports.emit({ type: 'sfx', name: 'titleAppear' });
    ports.emit({ type: 'notice', text: 'start' });
    ports.emit({ type: 'start', who, foes: ids.slice() });
    ports.emit({ type: 'count', left: ids.length });
  }

  function win(r: Run): void {
    const ports = d.ports!;
    runs.delete(r.y.id);
    won.add(r.y.id);
    setGate(r.y, false);
    ports.emit({ type: 'gate', what: 'open', gate: gateBox(r.y) });
    ports.emit({ type: 'float', cells: null });
    ports.emit({ type: 'sfx', name: 'yakataGateOpen' });
    ports.emit({ type: 'sfx', name: 'fanfare' });
    if (d.chest) {
      const chest = d.chest;
      ports.run(r.who, () => giveChest(chest, r.plan.chestPreview as { item: never; count: number }[], 4));
    }
    ports.emit({ type: 'celebrate', what: 'confetti' });
    ports.emit({ type: 'celebrate', what: 'fireworks' });
    ports.emit({ type: 'win', who: r.who });
    ports.emit({ type: 'notice', text: 'win' });
    ports.emit({ type: 'achievement', kind: 'won' });
  }

  function lose(r: Run): void {
    const ports = d.ports!;
    runs.delete(r.y.id);
    const rest = alive(r);
    if (rest.length > 0) ports.yokai.leave(rest);
    setChest(r.y, false);
    setGate(r.y, false);
    pendingSay.add(r.y.id);
    ports.emit({ type: 'gate', what: 'open', gate: gateBox(r.y) });
    ports.emit({ type: 'float', cells: null });
    ports.emit({ type: 'lose' });
    ports.emit({ type: 'sfx', name: 'yakataGateOpen' });
  }

  function watch(r: Run, players: ReturnType<YakataPorts['players']>): void {
    const left = aliveCount(r);
    if (left === 0) return win(r);
    for (const p of players) if (p.dead) r.members.delete(p.who); // やられた 人は 復活しても なかまに もどらない〔中に だれも いなければ まけ〕
    if (r.members.size === 0 || !players.some((p) => r.members.has(p.who) && !p.dead)) return lose(r);
    if (left !== r.lastLeft) {
      r.lastLeft = left;
      d.ports!.emit({ type: 'count', left });
    }
  }

  return {
    /** 右クリック。やかたの 宝箱なら true〔ふつうの 宝箱の あけかたは しない〕 */
    open(x: number, y: number, z: number, who: 1 | 2 = 1): boolean {
      const plan = d.planAtChest(x, y, z);
      if (!plan || !d.chest) return false;
      const st = stateOf(plan.yakata);
      if (st === 'chosen') d.chest.say(SAY.locked);
      else if (st === 'katta') d.chest.say(SAY.empty);
      else start(plan, who);
      return true;
    },
    /** 毎ステップ〔妖怪の 更新の あと〕 */
    step(): void {
      const ports = d.ports;
      if (!ports) return;
      const players = ports.players();
      for (const p of players) {
        const b = d.builtReady(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        nearOf.set(p.who, b && (inHallRect(b.yakata, p) || inPassage(b.yakata, p)) ? b.yakata : null);
        const now = b && inHallRect(b.yakata, p) ? b.yakata.id : null;
        if (now !== (inHall.get(p.who) ?? null)) {
          inHall.set(p.who, now);
          if (now) {
            ports.emit({ type: 'enter', who: p.who });
            ports.emit({ type: 'achievement', kind: 'found' });
          }
        }
      }
      for (const r of runs.values()) watch(r, players); // 終わった 挑戦を 消しながら 回って よい〔Map〕
      if (pendingSay.size > 0 && players.length > 0 && players.every((p) => !p.dead)) {
        pendingSay.clear();
        ports.emit({ type: 'say', text: SAY.afterLose });
      }
    },
    state(id: string, y: Yakata | null): YakataStateInfo {
      const r = runs.get(id);
      if (r) {
        const ids = alive(r);
        return { state: 'chosen', left: ids.length, foes: ids, floating: r.floating.map((i) => ({ ...i })) };
      }
      return { state: y ? stateOf(y) : 'mada', left: 0, foes: [], floating: null };
    },
    /** 場面の 材料: だれかが やかたに いる・挑戦の 間・かった あと〔その やかたの 中の 人だけ〕 */
    stage(): { present: boolean; chosen: boolean; katta: boolean } {
      let present = false;
      let katta = false;
      for (const y of nearOf.values()) {
        if (!y) continue;
        present = true;
        if (stateOf(y) === 'katta') katta = true; // 読みこみ なおしても かった やかたは 鳴らさない
      }
      return { present, chosen: runs.size > 0, katta };
    },
    /** その 人〔1 = 1P・2 = 2P〕は 挑戦の 間の なかまか〔自動の 出現を しない〕 */
    quiet(who: 1 | 2): boolean {
      for (const r of runs.values()) if (r.members.has(who)) return true;
      return false;
    },
    /** その マスの ブロックは 今 こわせないか */
    locked(x: number, y: number, z: number): boolean {
      if (!d.world) return false;
      const b = d.builtAt(x, y, z);
      if (!b || stateOf(b.yakata) === 'katta') return false;
      return ALL_LOOK_IDS.has(String(d.world.getBlock(x, y, z)));
    },
    /** 保存に だけ 別の ブロックで 書く マス〔挑戦の 間の 門と 宝箱〕 */
    saveOverrides(): SaveBlockOverride[] {
      const out: SaveBlockOverride[] = [];
      for (const r of runs.values()) {
        for (const c of gateOf(r.y)) out.push({ x: c.x, y: c.y, z: c.z, live: T.lookBlocks[r.y.look].kabe, save: 'air' });
        r.y.chest.cells.forEach((c, i) => out.push({ x: c.x, y: c.y, z: c.z, live: chestBlockId(4, true, i === 1), save: chestBlockId(4, false, i === 1) }));
      }
      return out;
    },
  };
}
