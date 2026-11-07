import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, ItemStack, Vec3, VoxelWorld } from '../contracts';
import { PanelOrder } from '../duo/panelOrder';
import { InventoryImpl } from '../inventory/Inventory';
import { STORAGE_DEFAULTS, StorageSystem } from './StorageSystem';
import { TansuView, tansuCloseReason } from './TansuView';

/**
 * COOP-1 4c（docs/design/COOP-1.md §3.3「4c の しくみ」・§8 の 4c の 宿題 3・4・AC80・AC94）の 先行テスト（赤）。
 * 2P の「たんす」の ページが 世界の たんす（1P と 共有）の 中身を そのまま 読み書きする 口 `TansuView` と、とじる 決まり。
 *
 * ---- 実装への 約束（新しい ファイル src/storage/TansuView.ts。見本: wip-4c-proto 7b5ce32 の TansuView）----
 *   class TansuView implements TansuApi        … 2P 用。1P の `StorageSystem` と 同じ 口（`StorageScreen` が どちらでも 使える）
 *     constructor(d: {
 *       inventory: Inventory & { setCursor(stack: ItemStack | null): void }    2P の もちもの（動かすのは これだけ）
 *       tansu: Pick<StorageSystem, 'slotsAt' | 'changed'>                      世界の たんす
 *       position: () => Vec3                                                   2P の 足もと（遠く なったら とじる）
 *       closeDist: () => number                                                `STORAGE_DEFAULTS.tansuCloseDist`（1P と 同じ 6 マス）
 *       onFull?: (which: 'inv' | 'tansu') => void
 *       onClose?: () => void                                                    遠く なった・こわれた ときに 1 回（2P の パネルを とじる 合図。自分で close() した ときは 呼ばない）
 *     })
 *     open(x, y, z): boolean   … たんすで なければ false。開く ときは 2P の 見方だけ 変え、1P の `StorageSystem.opened` には さわらない
 *     close(): void            … 自分で とじた（2P の パネルが とじる とき）
 *     openedAt(): Vec3 | null
 *     ui(): { open: boolean }  … たんすが こわれて いたら false
 *     openSlots(): readonly TansuSlot[] | null   … 世界の たんすの 配列を そのまま（コピーしない）
 *     click(i) / shiftClick(from, i) / storeAll() / storeSame() / takeAll()   … `StorageSystem` と 同じ 決まり（しまうのは もちもの 9〜35 だけ。ホットバーは うごかさない）
 *     mark(i) は false・marks() は []・storeMarked() は moved 0       … 「えらんだ もの を しまう」は マウスの 物。2P には ない
 *     update(): void           … 毎ステップ 1 回。`tansuCloseReason` が null でなければ close して onClose を 1 回
 *   `StorageSystem` に 足す（試作の とおり）:
 *     slotsAt(x, y, z): TansuSlot[] | null   … そこの たんすの マス（コピーしない。たんすで なければ null）
 *     changed(x, y, z): void                 … 中身を かえた 合図（`version()` が ふえる・いっぱいの 印・保存。つくる の 数えなおしに 効く）
 *   tansuCloseReason(i: { exists: boolean; dist: number; closeDist: number }): 'gone' | 'far' | null
 *     … 1P の `StorageSystem.update` と 2P の `TansuView.update` で **同じ 関数を 使う**（1P と 同じ 決まりを 1 か所に）。
 *       exists が false → 'gone'（遠くても 'gone'）。dist が closeDist より 大きい → 'far'（ちょうど 同じは とじない）。それ以外 null。
 *       dist = 足もとと たんすの 中心（x+0.5, y, z+0.5）の 3D の きょり（今の StorageSystem.update と 同じ）。
 */

class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  b = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.b.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.b.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) !== 'air';
  }
}

const A = { x: 5, y: 5, z: 5 };
const B = { x: 6, y: 5, z: 5 };
const stack = (item: ItemId, count: number): ItemStack => ({ item, count });

/** 1P と 2P が たんすの 近くに 並ぶ。たんすは 2 つ（A と B）。2P の 足もとは p2 を 書きかえて うごかす */
function rig() {
  const world = new W();
  world.setBlock(A.x, A.y, A.z, 'tansu');
  world.setBlock(B.x, B.y, B.z, 'tansu');
  const inv1 = new InventoryImpl();
  const inv2 = new InventoryImpl();
  const p1: Vec3 = { x: 5.5, y: 5, z: 7.5 };
  const p2: Vec3 = { x: 6.5, y: 5, z: 7.5 };
  let open1 = false;
  const st = new StorageSystem({
    world,
    inventory: inv1,
    player: () => p1,
    scatter: () => undefined,
    inventoryOpen: () => open1,
    openScreen: () => (open1 = true),
    closeScreen: () => (open1 = false),
  });
  const full: string[] = [];
  const closed = { n: 0 };
  const view = new TansuView({
    inventory: inv2,
    tansu: st,
    position: () => p2,
    closeDist: () => STORAGE_DEFAULTS.tansuCloseDist,
    onFull: (w) => full.push(w),
    onClose: () => closed.n++,
  });
  const slotsOf = (p: { x: number; y: number; z: number }) => st.get(p.x, p.y, p.z)!.slots;
  /** もちものを 空に して、ホットバー以外の 36 マスを 土で いっぱいにする（空きを 数で 作る ため） */
  const fillWithDirt = (inv: InventoryImpl, except: number[] = []) => {
    for (let i = 0; i < 36; i++) inv.setSlot(i, except.includes(i) ? null : stack('dirt', 64));
  };
  return { world, inv1, inv2, p1, p2, st, view, full, closed, slotsOf, fillWithDirt };
}

describe('AC94: 2P の たんすと 1P の たんすは 同じ 中身（わたす）', () => {
  it('たんすで ない 所は 開けない。開けば ui().open', () => {
    const r = rig();
    expect(r.view.open(0, 0, 0)).toBe(false);
    expect(r.view.ui().open).toBe(false);
    expect(r.view.open(A.x, A.y, A.z)).toBe(true);
    expect(r.view.ui().open).toBe(true);
    expect(r.view.openedAt()).toEqual(A);
    expect(r.view.openSlots()).toHaveLength(STORAGE_DEFAULTS.tansuSlots);
  });

  it('2P が たんすに 入れた 物を、1P が 同じ たんすを 開いて もちものへ 出せる', () => {
    const r = rig();
    r.inv2.setSlot(12, stack('log', 5));
    expect(r.view.open(A.x, A.y, A.z)).toBe(true);
    expect(r.view.shiftClick('inv', 12)).toMatchObject({ moved: 5, reason: null });
    expect(r.inv2.count('log')).toBe(0);
    // 1P が 開く
    expect(r.st.open(A.x, A.y, A.z)).toBe(true);
    const i = r.st.openSlots()!.findIndex((s) => s?.item === 'log');
    expect(i, '1P の たんすの マスに 2P が 入れた き が ある').toBeGreaterThanOrEqual(0);
    expect(r.st.openSlots()![i]).toMatchObject({ item: 'log', count: 5 });
    expect(r.st.shiftClick('tansu', i)).toMatchObject({ moved: 5, reason: null });
    expect(r.inv1.count('log')).toBe(5);
    expect(r.st.openSlots()!.every((s) => s === null)).toBe(true);
  });

  it('逆: 1P が 入れた 物を 2P が 出せる', () => {
    const r = rig();
    r.inv1.setSlot(12, stack('stone', 7));
    r.st.open(A.x, A.y, A.z);
    r.view.open(A.x, A.y, A.z);
    expect(r.st.shiftClick('inv', 12)).toMatchObject({ moved: 7 });
    const i = r.view.openSlots()!.findIndex((s) => s?.item === 'stone');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r.view.shiftClick('tansu', i)).toMatchObject({ moved: 7 });
    expect(r.inv2.count('stone')).toBe(7);
    expect(r.inv1.count('stone')).toBe(0);
  });

  it('2 人が 同時に 開いて いる とき、片方が 入れた 物が 同じ ステップ（update を はさまず）に もう 片方の マスに 出る', () => {
    const r = rig();
    r.st.open(A.x, A.y, A.z);
    r.view.open(A.x, A.y, A.z);
    // 1P が カーソルで マス 2 に おく → 2P の 見る マス 2 に すぐ 出る
    r.inv1.setCursor(stack('stone', 3));
    expect(r.st.click(2)).toBe(true);
    expect(r.view.openSlots()![2]).toMatchObject({ item: 'stone', count: 3 });
    // 2P が カーソルで マス 7 に おく → 1P の 見る マス 7 に すぐ 出る
    r.inv2.setCursor(stack('dirt', 2));
    expect(r.view.click(7)).toBe(true);
    expect(r.st.openSlots()![7]).toMatchObject({ item: 'dirt', count: 2 });
    // 中身は いつも 同じ
    expect(r.view.openSlots()).toEqual(r.st.openSlots());
    // 2P が つかんで 出すと 1P の マスは すぐ 空
    expect(r.view.click(2)).toBe(true);
    expect(r.inv2.cursor()).toMatchObject({ item: 'stone', count: 3 });
    expect(r.st.openSlots()![2]).toBeNull();
  });

  it('ちがう たんすを 開いている ときは 中身が べつ（A を 1P、B を 2P）', () => {
    const r = rig();
    r.inv1.setSlot(12, stack('log', 4));
    r.inv2.setSlot(12, stack('stone', 6));
    r.st.open(A.x, A.y, A.z);
    r.view.open(B.x, B.y, B.z);
    r.st.shiftClick('inv', 12);
    r.view.shiftClick('inv', 12);
    expect(r.st.countItem(A.x, A.y, A.z, 'log')).toBe(4);
    expect(r.st.countItem(A.x, A.y, A.z, 'stone')).toBe(0);
    expect(r.st.countItem(B.x, B.y, B.z, 'stone')).toBe(6);
    expect(r.st.countItem(B.x, B.y, B.z, 'log')).toBe(0);
  });

  it('2P が 入れても 1P の StorageSystem は 開いたままに ならない・閉じない（1P の opened に さわらない）', () => {
    const r = rig();
    expect(r.st.ui().open).toBe(false);
    r.view.open(A.x, A.y, A.z);
    expect(r.st.ui().open).toBe(false);
    r.st.open(B.x, B.y, B.z);
    r.view.close();
    expect(r.st.ui().open).toBe(true);
    expect(r.st.openedAt()).toEqual(B);
  });

  it('2P が かえたら version() が ふえ、つくる の 材料の 数（countItem）に 出る（4a の 材料の 数えなおしが 効く）', () => {
    const r = rig();
    r.inv2.setSlot(12, stack('log', 5));
    r.view.open(A.x, A.y, A.z);
    const v0 = r.st.version();
    r.view.shiftClick('inv', 12);
    expect(r.st.version()).toBeGreaterThan(v0);
    expect(r.st.countItem(A.x, A.y, A.z, 'log')).toBe(5);
    const v1 = r.st.version();
    r.view.takeAll();
    expect(r.st.version()).toBeGreaterThan(v1);
    expect(r.st.countItem(A.x, A.y, A.z, 'log')).toBe(0);
  });

  it('2P の まとめて うつす ボタン: ぜんぶ しまう は もちもの 9〜35 だけ（ホットバーは うごかさない）。ぜんぶ とりだす', () => {
    const r = rig();
    r.view.open(A.x, A.y, A.z);
    r.inv2.setSlot(0, stack('log', 5)); // ホットバー
    r.inv2.setSlot(10, stack('dirt', 3));
    r.inv2.setSlot(11, stack('stone', 2));
    expect(r.view.storeAll().moved).toBe(5);
    expect(r.inv2.count('log'), 'ホットバーの 物は のこる').toBe(5);
    expect(r.inv2.count('dirt') + r.inv2.count('stone')).toBe(0);
    expect(r.st.countItem(A.x, A.y, A.z, 'dirt')).toBe(3);
    expect(r.st.countItem(A.x, A.y, A.z, 'stone')).toBe(2);
    expect(r.view.takeAll().moved).toBe(5);
    expect(r.inv2.count('dirt')).toBe(3);
    expect(r.inv2.count('stone')).toBe(2);
    expect(r.view.openSlots()!.every((s) => s === null)).toBe(true);
  });

  it('おなじ もの を しまう: たんすに もう ある 物（dirt）だけ', () => {
    const r = rig();
    r.view.open(A.x, A.y, A.z);
    r.st.set(A.x, A.y, A.z, 0, stack('dirt', 1));
    r.inv2.setSlot(20, stack('dirt', 4));
    r.inv2.setSlot(21, stack('stone', 2));
    expect(r.view.storeSame().moved).toBe(4);
    expect(r.inv2.count('stone')).toBe(2);
    expect(r.inv2.count('dirt')).toBe(0);
    expect(r.st.countItem(A.x, A.y, A.z, 'dirt')).toBe(5);
  });

  it('「えらんだ もの を しまう」の しるしは 2P には ない（マウスの Ctrl クリック）', () => {
    const r = rig();
    r.view.open(A.x, A.y, A.z);
    r.st.set(A.x, A.y, A.z, 0, stack('log', 1));
    expect(r.view.mark(0)).toBe(false);
    expect(r.view.marks()).toEqual([]);
    expect(r.view.storeMarked().moved).toBe(0);
  });
});

describe('AC94: 同じ ステップは 1P が 先（PanelOrder を 通すと 2P が 先に 預けても 1P が 先）', () => {
  it('同じ マスを 2 人が つかもうと したら 1P が つかみ、2P の 手は 空・何も へらない', () => {
    const r = rig();
    r.st.set(A.x, A.y, A.z, 0, stack('log', 5));
    r.st.open(A.x, A.y, A.z);
    r.view.open(A.x, A.y, A.z);
    const order = new PanelOrder();
    order.submit(2, () => r.view.click(0));
    order.submit(1, () => r.st.click(0));
    order.flush();
    expect(r.inv1.cursor()).toMatchObject({ item: 'log', count: 5 });
    expect(r.inv2.cursor()).toBeNull();
    expect(r.view.openSlots()![0]).toBeNull();
  });

  it('同じ マスの 物を shift で とる: 1P の もちものに 入る 分が 先、のこりが あれば 2P も とれる', () => {
    const r = rig();
    // 1P は き が あと 3 こ だけ 入る
    r.fillWithDirt(r.inv1, [20]);
    r.inv1.setSlot(20, stack('log', 61));
    r.st.set(A.x, A.y, A.z, 0, stack('log', 10));
    r.st.open(A.x, A.y, A.z);
    r.view.open(A.x, A.y, A.z);
    const order = new PanelOrder();
    order.submit(2, () => r.view.shiftClick('tansu', 0));
    order.submit(1, () => r.st.shiftClick('tansu', 0));
    order.flush();
    expect(r.inv1.count('log'), '1P は 入る 分（3）').toBe(64);
    expect(r.inv2.count('log'), 'のこり（7）は 2P').toBe(7);
    expect(r.view.openSlots()![0]).toBeNull();
  });

  it('のこりが なければ 2P の 手は 空で 何も へらない', () => {
    const r = rig();
    r.st.set(A.x, A.y, A.z, 0, stack('log', 3));
    r.st.open(A.x, A.y, A.z);
    r.view.open(A.x, A.y, A.z);
    const order = new PanelOrder();
    order.submit(2, () => r.view.shiftClick('tansu', 0));
    order.submit(1, () => r.st.shiftClick('tansu', 0));
    order.flush();
    expect(r.inv1.count('log')).toBe(3);
    expect(r.inv2.count('log')).toBe(0);
    expect(r.inv2.cursor()).toBeNull();
    expect(r.view.openSlots()![0]).toBeNull();
  });

  it('「ぜんぶ とりだす」が 同じ ステップに 2 人なら、1P の もちものに 入る 分が 先', () => {
    const r = rig();
    // 1P の もちものは 1 マスしか 空いて いない
    r.fillWithDirt(r.inv1, [35]);
    r.st.set(A.x, A.y, A.z, 0, stack('log', 64));
    r.st.set(A.x, A.y, A.z, 1, stack('stone', 64));
    r.st.open(A.x, A.y, A.z);
    r.view.open(A.x, A.y, A.z);
    const order = new PanelOrder();
    order.submit(2, () => r.view.takeAll());
    order.submit(1, () => r.st.takeAll());
    order.flush();
    expect(r.inv1.count('log'), '1P が 先に 先頭の き を とる').toBe(64);
    expect(r.inv1.count('stone')).toBe(0);
    expect(r.inv2.count('stone'), '1P に 入らなかった 分を 2P が とる').toBe(64);
    expect(r.inv2.count('log')).toBe(0);
  });
});

describe('§8 宿題 4・AC80: たんすから 遠く なった・こわれた ら 2P の パネルが とじる（1P と 同じ 決まり）', () => {
  it('tansuCloseReason: こわれた → gone（遠くても gone）、closeDist より 遠い → far、ちょうど 同じは とじない', () => {
    const cd = STORAGE_DEFAULTS.tansuCloseDist;
    expect(cd).toBe(6);
    expect(tansuCloseReason({ exists: true, dist: 0, closeDist: cd })).toBeNull();
    expect(tansuCloseReason({ exists: true, dist: cd, closeDist: cd })).toBeNull();
    expect(tansuCloseReason({ exists: true, dist: cd + 0.01, closeDist: cd })).toBe('far');
    expect(tansuCloseReason({ exists: false, dist: 0, closeDist: cd })).toBe('gone');
    expect(tansuCloseReason({ exists: false, dist: 99, closeDist: cd })).toBe('gone');
  });

  it('2P が 6 マス 以内なら 開いたまま。6 マスを こえると そのステップに とじて onClose が 1 回', () => {
    const r = rig();
    r.view.open(A.x, A.y, A.z);
    // たんすの 中心（5.5, 5, 5.5）から ちょうど 6
    r.p2.x = 5.5;
    r.p2.z = 5.5 + STORAGE_DEFAULTS.tansuCloseDist;
    r.view.update();
    expect(r.view.ui().open).toBe(true);
    expect(r.closed.n).toBe(0);
    r.p2.z += 0.01;
    r.view.update();
    expect(r.view.ui().open).toBe(false);
    expect(r.closed.n).toBe(1);
    r.view.update(); // とじたあとは くりかえさない
    expect(r.closed.n).toBe(1);
  });

  it('上下にも きょりは きく（3D）', () => {
    const r = rig();
    r.view.open(A.x, A.y, A.z);
    r.p2.x = 5.5;
    r.p2.z = 5.5;
    r.p2.y = A.y + STORAGE_DEFAULTS.tansuCloseDist + 0.5;
    r.view.update();
    expect(r.view.ui().open).toBe(false);
  });

  it('たんすが こわれた（ブロックが 消えた）ら とじる。StorageSystem.update の 前でも 後でも', () => {
    const r1 = rig();
    r1.view.open(A.x, A.y, A.z);
    r1.world.setBlock(A.x, A.y, A.z, 'air');
    r1.view.update();
    expect(r1.view.ui().open).toBe(false);
    expect(r1.closed.n).toBe(1);

    const r2 = rig();
    r2.view.open(A.x, A.y, A.z);
    r2.world.setBlock(A.x, A.y, A.z, 'air');
    r2.st.update(); // 記録を 消す
    r2.view.update();
    expect(r2.view.openSlots()).toBeNull();
    expect(r2.closed.n).toBe(1);
  });

  it('2P が とじても 1P の パネルは そのまま（1P の opened は かわらない）', () => {
    const r = rig();
    r.st.open(A.x, A.y, A.z);
    r.view.open(A.x, A.y, A.z);
    r.p2.z = 5.5 + 10;
    r.view.update();
    expect(r.view.ui().open).toBe(false);
    r.st.update();
    expect(r.st.ui().open).toBe(true);
  });

  it('自分で close() した ときは onClose を 呼ばない（呼ぶのは 遠く なった・こわれた とき だけ）', () => {
    const r = rig();
    r.view.open(A.x, A.y, A.z);
    r.view.close();
    r.view.update();
    expect(r.view.ui().open).toBe(false);
    expect(r.closed.n).toBe(0);
  });

  it('1P の StorageSystem も 同じ 決まりで とじる（tansuCloseDist 6・ちょうど 6 は とじない）', () => {
    const r = rig();
    r.st.open(A.x, A.y, A.z);
    r.p1.x = 5.5;
    r.p1.z = 5.5 + STORAGE_DEFAULTS.tansuCloseDist;
    r.st.update();
    expect(r.st.ui().open).toBe(true);
    r.p1.z += 0.01;
    r.st.update();
    expect(r.st.ui().open).toBe(false);
  });
});
