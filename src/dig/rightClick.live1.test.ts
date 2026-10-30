import { describe, expect, it } from 'vitest';
import type { AnimalApi, AnimalHintKind, BlockId, ItemId, ItemStack, LockStatus, PlayerState, SwingResult, Vec3 } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/**
 * LIVE-1 版 3.2 §2.3 のふりわけ（00・0・0b・8b）、§2.8 のだっこ、左クリックを止める。
 * A の AnimalApi は にせもの（答えを決めて、呼ばれたことを log に残す）。
 */
interface Opts {
  held: ItemId | null;
  count?: number;
  /** ねらうブロック（5,10,6）。null = 何もない */
  target?: BlockId | null;
  /** にせ の rayHit の 距離（null = 当たらない） */
  hitDistance?: number | null;
  friend?: boolean;
  preview?: 'feed' | 'animalFull' | 'animalPet' | null;
  feed?: 'ate' | 'full' | 'pet' | 'friendFull' | null;
  pet?: 'wild' | 'friend' | null;
  swing?: SwingResult;
  putDown?: boolean;
  carrying?: boolean;
  /** carryHold が 'lifted' を 返す ステップ数 */
  liftAt?: number;
}

function rig(o: Opts) {
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => (blocks.set(key(x, y, z), id), true),
    isSolid: (x: number, y: number, z: number) => {
      const b = blocks.get(key(x, y, z));
      return !!b && b !== 'air' && b !== 'water';
    },
  };
  for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) blocks.set(key(x, 8, z), 'stone');
  if (o.target !== null) blocks.set(key(5, 10, 6), o.target ?? 'stone');
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const input = { enabled: true };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => input.enabled };
  const actions = new ActionState();
  const real = new InventoryImpl();
  // 'mushi'・'mushi_ami' は アイテム表（B）に まだ 無い 間 は 仮物 の 持ち物 で 確かめる
  const fake: ItemStack | null = o.held === 'mushi' || o.held === 'mushi_ami' ? { item: o.held, count: o.count ?? 3 } : null;
  if (o.held && !fake) real.setSlot(0, { item: o.held, count: o.count ?? 3 });
  real.select(0);
  const inv = fake
    ? (Object.assign(Object.create(real), {
        held: () => fake,
        selected: () => 0,
        consumeHeld: () => ((fake.count -= 1), true),
      }) as InventoryImpl)
    : real;
  const log: string[] = [];
  const hints: AnimalHintKind[] = [];
  const st = { hit: o.hitDistance === undefined ? 1.5 : o.hitDistance, carrying: o.carrying ?? false, holdCalls: [] as number[], putSpots: [] as Vec3[], swingBlocks: [] as Vec3[] };
  // LIVE-2 の 窓口 は このテスト では 使わない（C が 必要に なったら 足す）
  const animals: AnimalApi = {
    rayHit: () => (st.hit === null ? null : { id: 7, distance: st.hit }),
    preview: (_id, held) => (o.preview !== undefined ? o.preview : held?.item === 'mushi' ? 'feed' : 'animalPet'),
    feed: (id, item) => (log.push(`feed ${id} ${item}`), o.feed === undefined ? 'ate' : o.feed),
    pet: (id) => (log.push(`pet ${id}`), o.pet === undefined ? 'friend' : o.pet),
    isFriend: () => o.friend ?? false,
    emitHint: (h) => void hints.push(h),
    forEachVisible: () => {},
    swingNet: (b) => (st.swingBlocks.push({ ...b }), log.push('swing'), o.swing ?? { caught: true, reason: 'chance' }),
    carryHold: (id, ticks) => {
      st.holdCalls.push(ticks);
      if (!(o.friend ?? false)) return ticks >= 40 ? 'wild' : 'wait';
      if (ticks >= (o.liftAt ?? 40)) {
        st.carrying = true;
        log.push(`carry ${id}`);
        return 'lifted';
      }
      return 'wait';
    },
    putDown: (spot) => {
      st.putSpots.push({ ...spot });
      log.push('putDown');
      const ok = o.putDown ?? true;
      if (ok) st.carrying = false;
      return ok;
    },
    carrying: () => (st.carrying ? 7 : null),
    ...({} as Omit<AnimalApi, 'rayHit' | 'preview' | 'isFriend' | 'emitHint' | 'feed' | 'pet' | 'isFull' | 'swingNet' | 'carryHold' | 'putDown' | 'carrying' | 'forEachVisible'>),
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, {
    animals,
    armor: { canEquip: (i) => i === 'kabuto', tryEquip: (i) => (log.push(`armor ${i}`), inv.consumeHeld(), true) },
    storage: {
      isTansu: (x, y, z) => world.getBlock(x, y, z) === 'tansu',
      open: (x, y, z) => (log.push(`tansu ${x},${y},${z}`), true),
      placed: () => {},
      broken: () => 0,
    },
    farm: {
      crop: () => null,
      soil: () => null,
      settings: () => ({}) as never,
      till: () => false,
      noteTillPress: () => {},
      plant: () => false,
      harvest: () => ({ ok: false, reason: 'none' }),
      onBlockBroken: () => [],
      grassSeed: () => null,
      eatHeal: (i) => (i === 'tomato' ? 2 : 0),
      noteEat: (i, h) => void log.push(`eat ${i} ${h}`),
      noteHint: (h) => void log.push(`hint ${h}`),
      ripen: () => false,
    },
    vitals: { hp: () => 5, maxHp: () => 10, heal: (n) => n },
  });
  dig.update();
  actions.endFrame();
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  return { dig, actions, inv, log, hints, st, world, step, blocks, input };
}
type Rig = ReturnType<typeof rig>;

const LINE = { held: null, heldIsPickaxe: false, heldIsBlade: false };
const hintOf = (r: Rig, held: ItemId | null = r.inv.held()?.item ?? null, extra: { carryProgress?: number } = {}) =>
  actionHintLines(r.dig.previewRightClick(), r.dig.previewLeftClick(), { ...LINE, held, ...extra });

/** 押して、n ステップ すすめる（はなさない） */
function hold(r: Rig, n: number): void {
  r.actions.press('secondary');
  r.step(n);
}
function release(r: Rig): void {
  r.actions.release('secondary');
  r.step(1);
}
function tap(r: Rig): void {
  hold(r, 1);
  release(r);
}

describe('00 だっこ中 → おろす（AC13・AC18・AC19）', () => {
  it('だっこ中の 案内 は 「おろす」。どんな 持ち物 でも 同じ・置かない・たべない・たんす も ひらかない', () => {
    for (const held of [null, 'dirt', 'tomato', 'kabuto', 'mushi', 'mushi_ami'] as const) {
      const r = rig({ held, carrying: true, hitDistance: null, target: 'tansu' });
      expect(r.dig.previewRightClick(), String(held)).toEqual({ kind: 'putDown', item: null });
      expect(hintOf(r).right, String(held)).toEqual({ icon: 'chicken', word: 'おろす' });
      const n = r.inv.held()?.count;
      tap(r);
      expect(r.log, String(held)).toEqual(['putDown']);
      expect(r.inv.held()?.count, String(held)).toBe(n);
      expect(r.blocks.get('4,10,6') ?? 'air').toBe('air');
    }
  });
  it('ブロックを ねらっていれば その 置く 所（ブロックを 置く なら 入る マス）の まん中 へ', () => {
    const r = rig({ held: 'dirt', carrying: true, hitDistance: null });
    tap(r);
    expect(r.st.putSpots).toEqual([{ x: 4.5, y: 10, z: 6.5 }]);
  });
  it('何も ねらっていなければ 前 1.5 マス・足の 高さ の マス', () => {
    const r = rig({ held: null, carrying: true, hitDistance: null, target: null });
    tap(r);
    expect(r.st.putSpots).toEqual([{ x: 4.5, y: 9, z: 6.5 }]);
  });
  it('おろせない（false）→ 合図 cantPutHere・だっこ は つづく', () => {
    const r = rig({ held: null, carrying: true, hitDistance: null, putDown: false });
    tap(r);
    expect(r.hints).toEqual(['cantPutHere']);
    expect(r.st.carrying).toBe(true);
  });
  it('押しつづけ の くりかえし では おろさない・ほか の 段 へ 進まない（つち を 置かない）', () => {
    const r = rig({ held: 'dirt', carrying: true, hitDistance: null, target: 'stone' });
    hold(r, 90);
    release(r);
    expect(r.log).toEqual(['putDown']);
    expect(r.inv.held()?.count).toBe(3);
    expect(r.blocks.get('4,10,6') ?? 'air').toBe('air');
  });
  it('だっこ中の 左クリック は 何も しない（ほらない）', () => {
    const r = rig({ held: null, carrying: true, hitDistance: null, target: 'dirt' });
    r.actions.press('primary');
    r.step(120);
    r.actions.release('primary');
    r.step(1);
    expect(r.world.getBlock(5, 10, 6)).toBe('dirt');
    expect(r.dig.state().active).toBe(false);
  });
  it('だっこして いなければ 左クリック は 今 まで どおり ほる', () => {
    const r = rig({ held: null, carrying: false, hitDistance: null, target: 'dirt' });
    r.actions.press('primary');
    r.step(40);
    expect(r.dig.state().ready).toBe(true); // 0.5 かたさ = 30 ステップ で ひび が MAX（そのあと もう 1 押し）
  });
});

describe('0 なかま は はなした しゅんかん（AC12）', () => {
  it('なかま + むし: 押した ステップ では 何も 起きない・5 ステップ 後 に はなす と はなした ステップ に あげる（むし −1）', () => {
    const r = rig({ held: 'mushi', friend: true });
    hold(r, 5);
    expect(r.log).toEqual([]);
    expect(r.inv.held()?.count).toBe(3);
    release(r);
    expect(r.log).toEqual(['feed 7 mushi']);
    expect(r.inv.held()?.count).toBe(2);
  });
  it('なかま + トマト: はなした ステップ に なでる', () => {
    const r = rig({ held: 'tomato', friend: true, preview: 'animalPet' });
    hold(r, 5);
    expect(r.log).toEqual([]);
    release(r);
    expect(r.log).toEqual(['pet 7']);
    expect(r.inv.held()?.count).toBe(3);
  });
  it('同じ ステップ で 押して はなす 短い タップ も 1 回 あげる', () => {
    const r = rig({ held: 'mushi', friend: true });
    r.actions.press('secondary');
    r.actions.release('secondary');
    r.step(2);
    expect(r.log).toEqual(['feed 7 mushi']);
  });
  it('40 ステップ 押しつづけ → だっこ だけ。あげない・なでない・むし は へらない・はなしても 何も 起きない', () => {
    const r = rig({ held: 'mushi', friend: true });
    hold(r, 39);
    expect(r.st.carrying).toBe(false);
    r.step(1);
    expect(r.st.carrying).toBe(true);
    r.step(30);
    release(r);
    expect(r.log).toEqual(['carry 7']);
    expect(r.inv.held()?.count).toBe(3);
  });
  it('だっこ した あとも 押しつづけ では おろさない。はなして 押し直す と おろす', () => {
    const r = rig({ held: 'mushi', friend: true });
    hold(r, 60);
    expect(r.st.carrying).toBe(true);
    release(r);
    expect(r.log).toEqual(['carry 7']);
    tap(r);
    expect(r.log).toEqual(['carry 7', 'putDown']);
  });
  it('とちゅうで ねらい が はずれた → だっこ も あげる も 起きない', () => {
    const r = rig({ held: 'mushi', friend: true });
    hold(r, 20);
    r.st.hit = null;
    r.step(40);
    r.st.hit = 1.5;
    release(r);
    expect(r.log).toEqual([]);
    expect(r.st.carrying).toBe(false);
    expect(r.inv.held()?.count).toBe(3);
  });
  it('ねらい が はずれた まま はなす → 何も しない', () => {
    const r = rig({ held: 'mushi', friend: true });
    hold(r, 5);
    r.st.hit = null;
    release(r);
    expect(r.log).toEqual([]);
  });
  it('ついばむ とちゅう（preview null）に 短く 押して はなす → 何も しない。長く 押す と おわって から だっこ（A が wait を 返す あいだ 待つ）', () => {
    const r = rig({ held: 'mushi', friend: true, preview: null });
    hold(r, 5);
    release(r);
    expect(r.log).toEqual([]);
    const r2 = rig({ held: 'mushi', friend: true, preview: null, liftAt: 65 });
    hold(r2, 64);
    expect(r2.st.carrying).toBe(false);
    r2.step(1);
    expect(r2.st.carrying).toBe(true);
    release(r2);
    expect(r2.log).toEqual(['carry 7']);
  });
  it('なかま に 40 以上 押して まだ 持ちあがらない まま はなす → あげない', () => {
    const r = rig({ held: 'mushi', friend: true, liftAt: 999 });
    hold(r, 50);
    release(r);
    expect(r.log).toEqual([]);
    expect(r.inv.held()?.count).toBe(3);
  });
  it('おなかいっぱい（feed が full）→ むし は へらない・合図 fullHint', () => {
    const r = rig({ held: 'mushi', friend: true, feed: 'full', preview: 'animalFull' });
    tap(r);
    expect(r.log).toEqual(['feed 7 mushi']);
    expect(r.inv.held()?.count).toBe(3);
    expect(r.hints).toEqual(['fullHint']);
  });
  it('なかま が 8 わ（feed が friendFull）→ むし は へらない・合図 friendFull', () => {
    const r = rig({ held: 'mushi', feed: 'friendFull' });
    tap(r);
    expect(r.inv.held()?.count).toBe(3);
    expect(r.hints).toEqual(['friendFull']);
  });
  it('メニューが ひらいて 入力が 止まる → はなした 扱い に しない', () => {
    const r = rig({ held: 'mushi', friend: true });
    hold(r, 5);
    r.input.enabled = false; // 入力が 止まった ステップ は ボタンを はなした のと 同じに 見える
    r.step(1);
    r.input.enabled = true;
    release(r);
    expect(r.log).toEqual([]);
  });
});

describe('0 やせい は おした しゅんかん（今 まで どおり）', () => {
  it('やせい + むし: 押した ステップ に あげる。むし −1', () => {
    const r = rig({ held: 'mushi', friend: false });
    hold(r, 1);
    expect(r.log).toEqual(['feed 7 mushi']);
    expect(r.inv.held()?.count).toBe(2);
    hold(r, 80);
    release(r);
    expect(r.log).toEqual(['feed 7 mushi']);
  });
  it('やせい を 40 押しつづけ → だっこ しない・合図 carryWild（1 回 の 押し で 1 回）', () => {
    const r = rig({ held: 'mushi', friend: false });
    hold(r, 39);
    expect(r.hints).toEqual([]);
    r.step(1);
    expect(r.hints).toEqual(['carryWild']);
    r.step(60);
    expect(r.hints).toEqual(['carryWild']);
    expect(r.st.carrying).toBe(false);
    release(r);
    tap(r);
    hold(r, 45);
    expect(r.hints).toEqual(['carryWild', 'carryWild']);
  });
  it('やせい を なでて wild と 返る → 合図 feedHint', () => {
    const r = rig({ held: 'tomato', friend: false, preview: 'animalPet', pet: 'wild' });
    tap(r);
    expect(r.log).toEqual(['pet 7']);
    expect(r.hints).toEqual(['feedHint']);
  });
});

describe('案内（AC13）: previewRightClick と 実際 が 同じ', () => {
  it('あげる（むし）', () => {
    const r = rig({ held: 'mushi' });
    expect(hintOf(r).right).toEqual({ icon: 'mushi', word: 'あげる' });
  });
  it('おなかいっぱい（むし を 持って ねらう）→ まってね', () => {
    const r = rig({ held: 'mushi', preview: 'animalFull' });
    expect(r.dig.previewRightClick()).toEqual({ kind: 'animalFull', item: null });
    expect(hintOf(r).right).toEqual({ icon: 'full', word: 'まってね' });
  });
  it('なでる（すで）', () => {
    const r = rig({ held: null, friend: true });
    expect(hintOf(r).right).toEqual({ icon: 'heart', word: 'なでる' });
  });
  it('なかま を 押しつづけ → 語 は だっこ・わ の たまり は 押した 歩数 ÷ 40', () => {
    const r = rig({ held: 'mushi', friend: true });
    expect(r.dig.carryProgress()).toBe(0);
    hold(r, 20);
    expect(r.dig.carryProgress()).toBeCloseTo(0.5, 5);
    const h = hintOf(r, 'mushi', { carryProgress: r.dig.carryProgress() });
    expect(h.right).toEqual({ icon: 'carry', word: 'だっこ' });
    expect(h.progress).toBeCloseTo(0.5, 5);
    r.step(19);
    expect(r.dig.carryProgress()).toBeCloseTo(39 / 40, 5);
    r.step(1);
    expect(r.dig.carryProgress()).toBe(0); // だっこ した
    release(r);
    expect(r.dig.carryProgress()).toBe(0);
  });
  it('わ は ねらい が はずれる と 0 に もどる・やせい では たまらない', () => {
    const r = rig({ held: 'mushi', friend: true });
    hold(r, 10);
    r.st.hit = null;
    r.step(1);
    expect(r.dig.carryProgress()).toBe(0);
    const w = rig({ held: 'mushi', friend: false });
    hold(w, 10);
    expect(w.dig.carryProgress()).toBe(0);
  });
  it('わ が なければ progress は 付かない', () => {
    const r = rig({ held: 'mushi' });
    expect(hintOf(r).progress).toBeUndefined();
  });
});

describe('0b あみ（AC7）', () => {
  const TREE: BlockId[] = ['log', 'leaves', 'momiji_leaves', 'matsu_leaves'];
  for (const b of TREE)
    it(`${b} を あみ で ねらう → 案内 mushi_ami・とる、右クリック で ふる`, () => {
      const r = rig({ held: 'mushi_ami', count: 1, target: b, hitDistance: null });
      expect(r.dig.previewRightClick()).toEqual({ kind: 'net', item: 'mushi_ami' });
      expect(hintOf(r).right).toEqual({ icon: 'mushi_ami', word: 'とる' });
      tap(r);
      expect(r.log).toEqual(['swing']);
      expect(r.st.swingBlocks).toEqual([{ x: 5, y: 10, z: 6 }]);
      expect(r.hints).toEqual([]);
      expect(r.world.getBlock(5, 10, 6)).toBe(b);
    });
  it('ふる 20 ステップ の あいだ は 押しても 何も しない。20 ステップ 後 に また ふれる', () => {
    const q = rig({ held: 'mushi_ami', count: 1, target: 'leaves', hitDistance: null });
    hold(q, 1); // ふる（ロック 20）
    release(q);
    for (let i = 0; i < 9; i++) {
      hold(q, 1);
      release(q);
    }
    expect(q.log.filter((l) => l === 'swing').length).toBe(1);
    hold(q, 1);
    release(q);
    expect(q.log.filter((l) => l === 'swing').length).toBe(2);
  });
  it('ふった 結果 empty（おやすみ）→ 合図 treeEmpty', () => {
    const r = rig({ held: 'mushi_ami', count: 1, target: 'leaves', hitDistance: null, swing: { caught: false, reason: 'empty' } });
    tap(r);
    expect(r.hints).toEqual(['treeEmpty']);
  });
  it('とれなかった（miss）・とれた は 合図 なし', () => {
    for (const swing of [{ caught: false, reason: 'miss' as const }, { caught: true, reason: 'pity' as const }]) {
      const r = rig({ held: 'mushi_ami', count: 1, target: 'leaves', hitDistance: null, swing });
      tap(r);
      expect(r.hints).toEqual([]);
    }
  });
  it('あみ は へらない・押しつづけ の くりかえし では ふらない', () => {
    const r = rig({ held: 'mushi_ami', count: 1, target: 'leaves', hitDistance: null });
    hold(r, 19);
    release(r);
    expect(r.log).toEqual(['swing']);
    expect(r.inv.held()?.count).toBe(1);
  });
});

describe('8b あみ で き で ない 所 → 合図 netHint（何も 置かない・こわさない）', () => {
  for (const b of ['bamboo', 'stone', 'grass', null] as const)
    it(`${b ?? '何も ねらわない'}`, () => {
      const r = rig({ held: 'mushi_ami', count: 1, target: b, hitDistance: null });
      expect(r.dig.previewRightClick()?.kind).toBe('netHint');
      expect(hintOf(r).right).toBeUndefined();
      tap(r);
      expect(r.log).toEqual([]);
      expect(r.hints).toEqual(['netHint']);
      if (b) expect(r.world.getBlock(5, 10, 6)).toBe(b);
      expect(r.inv.held()?.count).toBe(1);
    });
  it('たんす を ねらうと 1〜8 が 先（たんす が ひらく）', () => {
    const r = rig({ held: 'mushi_ami', count: 1, target: 'tansu', hitDistance: null });
    expect(r.dig.previewRightClick()?.kind).toBe('storage');
  });
  it('にわとり を ねらうと 0 が 先', () => {
    const r = rig({ held: 'mushi_ami', count: 1, target: 'leaves', friend: false });
    expect(r.dig.previewRightClick()?.kind).toBe('animalPet');
  });
});

describe('9 むし は たべない・置けない', () => {
  it('むし を 持って 空 に 右クリック → 何も 起きない・へらない', () => {
    const r = rig({ held: 'mushi', target: null, hitDistance: null });
    expect(r.dig.previewRightClick()).toBeNull();
    tap(r);
    expect(r.log).toEqual([]);
    expect(r.inv.held()?.count).toBe(3);
  });
});
