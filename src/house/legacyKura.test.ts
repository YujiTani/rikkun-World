import { describe, expect, it } from 'vitest';
import { GREET_STEPS, SAY } from './talk';
import { houseRig } from './houseRig';
import { placeInRegion, regionHasArchitect } from './placement';

/**
 * HOUSE-1E〔#374〕AC32d・AC32・AC33: 前の セーブの くらの 物を 建築士さんが かえす（くらは もう ない。あるのは `legacyKura()` だけ）。
 * - かえす のは「話した とき」。もちものに 入る 分だけ（登録表 `ITEM_TYPES` の ならび）。入らない 分は くらの 記録に のこし、つぎに 話した とき また。足もとには 何も 落とさない。
 * - 22 ステップ目に ふきだし「あずかった ものを かえすね」。入らない 分が のこれば 122 ステップ目に「いっぱい だから また あとでね」、その 次の 100 ステップ目に メニュー。
 * - #339 より 前の セーブで ふでも わたす ときは ふでの 行が その あと（メニューは ＋100）。
 * 文は ここでは そのまま 書く（SAY の キー名は 実装が 決める。`SAY` は あいさつ・メニューの 既存の 文だけ 使う）。
 */

const BACK = 'あずかった ものを かえすね';
const LATER = 'いっぱい だから また あとでね';
const NOD = 22;

type Rig = ReturnType<typeof houseRig>;
type Kura = Record<string, number>;

/** くらの 記録（`legacyKura()`）。記録が なければ null。空でも null */
const legacy = (r: Rig): Kura | null => (r.hook as unknown as { legacyKura(): Kura | null }).legacyKura();

/** 前の セーブ（v:2・`kura` の ある 形）を 読みこんだ 世界。free ＝ もちものの 空きマス。fudeGiven false なら #339 より 前の セーブ */
function oldWorld(kura: Kura | null | undefined, o: { free?: number; fudeGiven?: boolean } = {}): Rig {
  const r = houseRig();
  const save = { ...r.sys.serialize() } as Record<string, unknown>;
  delete save.kura;
  if (kura !== undefined) save.kura = kura;
  save.toolsGiven = true;
  save.fudeGiven = o.fudeGiven ?? true;
  r.sys.load(save);
  r.run(1);
  fill(r, o.free ?? 2);
  return r;
}

/** もちものを つち（dirt）で うめて、空きを free マスに する（kura の 物は 持って いない） */
function fill(r: Rig, free: number): void {
  for (let i = 0; i < r.bag.size; i++) r.bag.setSlot(i, i < r.bag.size - free ? { item: 'dirt', count: 64 } : null);
}

const freeSlots = (r: Rig): number => r.bag.slots().filter((s) => s === null).length;

/** 建築士さんに 話しかけて n ステップ 進める（id を 言わなければ いま 見えて いる 最後の 人） */
function talkFor(r: Rig, n: number, id?: string): void {
  expect(r.sys.talkTo(id ?? r.sys.architects().at(-1)!.id)).toBe(true);
  r.run(n);
}

/** 最初の 1 人では ない 建築士さん（べつの 区画の 人）の すぐ そばに プレイヤーを うつして、その 人の id を 返す。どれかの 建築士さんに 話せば かえす ため（仕様 §2.4 の 4） */
function moveToOther(r: Rig): string {
  const seed = 77; // houseRig の seed
  const start = { x: 64, z: 64 };
  for (let n = 1; n < 8; n++) {
    for (let rz = -n; rz <= n; rz++) {
      for (let rx = -n; rx <= n; rx++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== n || !regionHasArchitect(seed, rx, rz, start)) continue;
        const spot = placeInRegion(seed, rx, rz, () => true);
        if (!spot) continue;
        Object.assign(r.player, { x: spot.x + 0.5 + 3, y: 11, z: spot.z + 0.5 + 3 });
        r.run(2);
        const other = r.sys.architects().find((a) => !a.first);
        if (other) return String(other.id);
      }
    }
  }
  throw new Error('最初の 1 人 いがいの 建築士さんが 見つからない');
}

describe('AC32d 前の セーブの くらを かえす', () => {
  it('空き 2 マス・くら {き 100・いし 5} → 22 で ふきだし・いし 5 と き 64 が 入り、のこり き 36 は legacyKura に のこる。122 で「いっぱい…」・222 で メニュー', () => {
    const r = oldWorld({ log: 100, stone: 5 }, { free: 2 });
    expect(legacy(r), '話す 前').toEqual({ log: 100, stone: 5 });
    expect(r.sys.talkTo(r.sys.architects().at(-1)!.id)).toBe(true);
    r.run(NOD - 1);
    expect(r.sys.menu().open).toBe(false);
    expect(freeSlots(r), '21 ステップ目までは まだ 何も 入らない').toBe(2);
    expect(legacy(r)).toEqual({ log: 100, stone: 5 });
    r.run(1); // 22
    expect(r.sys.menu().bubble).toBe(BACK);
    expect(r.sys.menu().open).toBe(false);
    expect(r.bag.count('stone'), 'ITEM_TYPES の ならびで いしが 先').toBe(5);
    expect(r.bag.count('log')).toBe(64);
    expect(freeSlots(r)).toBe(0);
    expect(legacy(r), 'のこりは 記録に のこる').toEqual({ log: 36 });
    expect(r.bag.count('dirt'), 'ほかの 物は そのまま').toBe(64 * (r.bag.size - 2));
    r.run(GREET_STEPS - 1); // 121
    expect(r.sys.menu().bubble).toBe(BACK);
    r.run(1); // 122
    expect(r.sys.menu().bubble).toBe(LATER);
    expect(r.sys.menu().open).toBe(false);
    r.run(GREET_STEPS - 1); // 221
    expect(r.sys.menu().open, '221 では まだ').toBe(false);
    r.run(1); // 222
    expect(r.sys.menu().open).toBe(true);
    expect(r.sys.menu().page).toBe('top');
    expect(legacy(r)).toEqual({ log: 36 });
  });

  it('セーブして 開きなおしても {き 36}（のこりは 保存に 入る）。話す 前に セーブして 開きなおすと もとの まま', () => {
    const before = oldWorld({ log: 100, stone: 5 }, { free: 2 });
    const savedBefore = JSON.parse(JSON.stringify(before.sys.serialize())) as unknown;
    const again = houseRig();
    again.sys.load(savedBefore);
    expect(legacy(again), '話す 前の セーブ').toEqual({ log: 100, stone: 5 });

    talkFor(before, NOD);
    expect(legacy(before)).toEqual({ log: 36 });
    const saved = JSON.parse(JSON.stringify(before.sys.serialize())) as unknown;
    const reopened = houseRig();
    reopened.sys.load(saved);
    expect(legacy(reopened), '話した あとの セーブ').toEqual({ log: 36 });
  });

  it('もちものを 1 マス 空けて 話すと 22 で き 36 が 入り legacyKura は null・122 で メニュー。その あとは 話しても かえさない（22 で メニュー・何も ふえない）', () => {
    const r = oldWorld({ log: 100, stone: 5 }, { free: 2 });
    talkFor(r, NOD + GREET_STEPS * 2);
    expect(r.sys.menu().open).toBe(true);
    expect(legacy(r)).toEqual({ log: 36 });
    r.sys.press('close');
    r.bag.setSlot(0, null); // 1 マス 空ける
    const other = moveToOther(r); // どれかの 建築士さんに 話せば かえす（さっきと ちがう 人）
    talkFor(r, NOD - 1, other);
    expect(r.sys.menu().open).toBe(false);
    expect(r.bag.count('log'), '21 ステップ目までは まだ').toBe(64);
    r.run(1); // 22
    expect(r.sys.menu().bubble).toBe(BACK);
    expect(r.bag.count('log')).toBe(100);
    expect(legacy(r), 'ぜんぶ かえした').toBeNull();
    r.run(GREET_STEPS - 1); // 121
    expect(r.sys.menu().open).toBe(false);
    r.run(1); // 122
    expect(r.sys.menu().open).toBe(true);
    expect(r.sys.menu().bubble, '2 行目〔いっぱい…〕は もう 出ない').toBe(SAY.menu);
    // その あと
    r.sys.press('close');
    const stone = r.bag.count('stone');
    const log = r.bag.count('log');
    talkFor(r, NOD, other);
    expect(r.sys.menu().open, '22 で メニュー').toBe(true);
    expect(r.sys.menu().bubble).toBe(SAY.menu);
    expect([r.bag.count('stone'), r.bag.count('log')]).toEqual([stone, log]);
    expect(legacy(r)).toBeNull();
  });

  it('空きが 0 マス: 何も 入らず 2 行 出て 222 で メニュー。記録は そのまま', () => {
    const r = oldWorld({ log: 100, stone: 5 }, { free: 0 });
    talkFor(r, NOD);
    expect(r.sys.menu().bubble).toBe(BACK);
    expect(r.bag.count('log') + r.bag.count('stone')).toBe(0);
    expect(legacy(r)).toEqual({ log: 100, stone: 5 });
    r.run(GREET_STEPS);
    expect(r.sys.menu().bubble).toBe(LATER);
    r.run(GREET_STEPS - 1);
    expect(r.sys.menu().open, '221').toBe(false);
    r.run(1);
    expect(r.sys.menu().open, '222').toBe(true);
    expect(legacy(r)).toEqual({ log: 100, stone: 5 });
  });

  it('ぜんぶ 入る（空き 2・き 10）: 22 で ふきだし・き 10 が 入る・「いっぱい…」は 出ない・122 で メニュー', () => {
    const r = oldWorld({ log: 10 }, { free: 2 });
    talkFor(r, NOD);
    expect(r.sys.menu().bubble).toBe(BACK);
    expect(r.bag.count('log')).toBe(10);
    expect(legacy(r)).toBeNull();
    r.run(GREET_STEPS - 1);
    expect(r.sys.menu().open).toBe(false);
    r.run(1);
    expect(r.sys.menu().open).toBe(true);
    expect(r.sys.menu().bubble).toBe(SAY.menu);
  });

  it('#339 より 前の セーブ（ふでの 記録なし）で くらも ある: 22 で かえす・122 で ふでの 行〔ふで 1〕・222 で メニュー（＋100）', () => {
    const r = oldWorld({ log: 10 }, { free: 3, fudeGiven: false });
    talkFor(r, NOD);
    expect(r.sys.menu().bubble).toBe(BACK);
    expect(r.bag.count('log')).toBe(10);
    expect(r.bag.count('fude'), 'ふでは まだ').toBe(0);
    r.run(GREET_STEPS);
    expect(r.sys.menu().bubble).toBe(SAY.fude);
    expect(r.bag.count('fude')).toBe(1);
    expect(r.sys.menu().open).toBe(false);
    r.run(GREET_STEPS - 1);
    expect(r.sys.menu().open, '221').toBe(false);
    r.run(1);
    expect(r.sys.menu().open, '222').toBe(true);
    expect(r.sys.state.record.fudeGiven).toBe(true);
  });

  it('くらが 空（{}）・くらの 記録の ない セーブ・null は legacyKura が null で 何も しない（22 で メニュー）', () => {
    for (const kura of [{}, undefined, null] as const) {
      const r = oldWorld(kura, { free: 2 });
      expect(legacy(r), JSON.stringify(kura)).toBeNull();
      talkFor(r, NOD);
      expect(r.sys.menu().open, `22 で メニュー ${JSON.stringify(kura)}`).toBe(true);
      expect(r.sys.menu().bubble).toBe(SAY.menu);
      expect(freeSlots(r)).toBe(2);
    }
  });
});

describe('AC32・AC33 保存', () => {
  it('AC32 建築士さんの 記録（最初の 1 人・道具を もらった か）は セーブして 開きなおすと 同じ。くらの 中身は 保存に 新しく 入らない（legacyKura が null の 世界）', () => {
    const a = houseRig();
    a.sys.state.record.toolsGiven = true;
    a.sys.state.record.fudeGiven = true;
    const first = a.sys.architects().find((q) => q.first)!;
    expect(first).toBeTruthy();
    expect(legacy(a)).toBeNull();
    const saved = JSON.parse(JSON.stringify(a.sys.serialize())) as unknown;
    const b = houseRig();
    b.sys.load(saved);
    b.run(1);
    expect(b.sys.state.record.toolsGiven).toBe(true);
    expect(b.sys.state.record.fudeGiven).toBe(true);
    expect(legacy(b)).toBeNull();
    const f = b.sys.architects().find((q) => q.first)!;
    expect(f).toBeTruthy();
    expect([f.x, f.z]).toEqual([first.x, first.z]);
  });

  it('AC33 古い セーブ（家の 記録 なし・くらの 記録 なし）を 開くと 家 なし・番号 1・最初の 建築士さんが いる。legacyKura は null', () => {
    const r = houseRig();
    r.sys.load({ v: 1 });
    r.run(1);
    expect(legacy(r)).toBeNull();
    expect(r.sys.architects().some((q) => q.first)).toBe(true);
    expect(r.hook.blueprints()).toEqual([]);
  });
});
