import { describe, expect, it } from 'vitest';
import { isScaffoldId } from '../../world/blocks/buildBlocks';
import { houseBuildTicks } from '../editor/model';
import type { Placed } from '../editor/model';
import { makeFakeWorld } from '../fakeWorld';
import { HouseBuilder, type ActiveBuild } from './builder';
import { BUILD_WORDS } from './words';

/** ユニット 7〜9・11・13・14（AC21・AC23・AC31・AC32c・AC39・AC41）: 建築中の 家 */
const BP: ActiveBuild['bp'] = { w: 5, d: 5, windows: 2, furniture: [{ kind: 'futon', x: 0, z: 0, rot: 1 } as Placed, { kind: 'chair', x: 4, z: 0, rot: 0 } as Placed], name: { front: 'もも', back: 'のいえ' } };
const AT = { x: 40, y: 9, z: 40 };
const OUT = 7;

function rig(opts: { loaded?: (x: number, z: number) => boolean } = {}) {
  const world = makeFakeWorld({ height: () => 9, ...(opts.loaded ? { loaded: opts.loaded } : {}) });
  const finished: Array<{ number: number }> = [];
  const b = new HouseBuilder({
    world,
    finish: (f) => {
      finished.push({ number: f.number });
      for (let y = 0; y < 5; y++) for (let z = 0; z < OUT; z++) for (let x = 0; x < OUT; x++) world.setBlock(f.at.x + x, f.at.y + y, f.at.z + z, 'air'); // 形の 代わり: 箱を 空に（足場が 消える ことを 見る）
    },
  });
  const start = (length = 1000, number = 1) => b.start({ number, bp: BP, at: AT, architect: 'first', home: { x: 30, y: 10, z: 30 } }, length);
  const scan = () => {
    const out = { scaffold: 0, wall: 0, floor: 0, roof: 0 };
    for (let y = 0; y < 5; y++) for (let z = 0; z < OUT; z++) for (let x = 0; x < OUT; x++) {
      const id = world.getBlock(AT.x + x, AT.y + y, AT.z + z);
      if (id === 'outside') continue;
      if (isScaffoldId(id)) out.scaffold++;
      else if (id === 'house_wall') out.wall++;
      else if (id === 'house_floor') out.floor++;
      else if (id === 'house_roof') out.roof++;
    }
    return out;
  };
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) b.update();
  };
  return { world, b, finished, start, scan, run };
}

describe('建築中の 家', () => {
  it('式の 長さ: length 0 なら houseBuildTicks（5×5 は 9,000）', () => {
    const r = rig();
    r.start(0);
    expect(r.b.view()).toMatchObject({ leftTicks: houseBuildTicks({ w: 5, d: 5 }), progress: 0 });
  });
  it('始まった ばかり: 足場だけ（かべ 0）。「はじめた ばかり だよ」', () => {
    const r = rig();
    r.start();
    const s = r.scan();
    expect(s.scaffold).toBeGreaterThan(0);
    expect(s).toMatchObject({ wall: 0, floor: 0, roof: 0 });
    expect(r.b.view()).toMatchObject({ name: 'ももの いえ'.replace(' ', ''), w: 5, d: 5, leftText: BUILD_WORDS[0], at: AT });
  });
  it('進み 0〜15% は 足場だけ、15% すぎから かべが ふえ、85% すぎから 床・屋根。足場は 完成まで のこる', () => {
    const r = rig();
    r.start(1000);
    r.run(140);
    expect(r.scan().wall).toBe(0);
    r.run(60); // 200
    const w200 = r.scan().wall;
    expect(w200).toBeGreaterThan(0);
    r.run(300); // 500
    const w500 = r.scan();
    expect(w500.wall).toBeGreaterThan(w200);
    expect(w500.roof).toBe(0);
    expect(w500.scaffold).toBe(r.scan().scaffold);
    r.run(400); // 900
    const late = r.scan();
    expect(late.floor + late.roof).toBeGreaterThan(0);
    expect(late.scaffold).toBeGreaterThan(0);
    expect(r.b.view()?.leftTicks).toBe(100);
  });
  it('完成: ちょうど length 歩目に finish が 1 回。建築中で なくなり、足場が 消える（AC21・AC36 の 土台）', () => {
    const r = rig();
    r.start(500);
    r.run(499);
    expect(r.finished).toEqual([]);
    expect(r.b.view()?.leftTicks).toBe(1);
    expect(r.b.update()?.number).toBe(1);
    expect(r.finished).toEqual([{ number: 1 }]);
    expect(r.b.view()).toBeNull();
    expect(r.scan().scaffold).toBe(0);
    r.run(100);
    expect(r.finished).toHaveLength(1);
  });
  it('建築中は 1 けんだけ（2 けん目は 始められない）。完成すれば 次を 始められる。12 けん目も 始まる（上限なし）', () => {
    const r = rig();
    expect(r.start(30, 1)).toBe(true);
    expect(r.start(30, 2)).toBe(false);
    for (let n = 1; n <= 12; n++) {
      if (n > 1) expect(r.start(30, n)).toBe(true);
      r.run(30);
      expect(r.b.view()).toBeNull();
    }
    expect(r.finished).toHaveLength(12);
  });
  it('おまけ: 建て はじめる 前は firstBonus、はじめたら なくなる（完成しても 戻らない）', () => {
    const r = rig();
    expect(r.b.firstBonus()).toBe(true);
    r.start(10);
    expect(r.b.firstBonus()).toBe(false);
    r.run(10);
    expect(r.b.firstBonus()).toBe(false);
  });
  it('守り（AC39）: 外の 箱 × 高さ 5 は locked。歩いて 入れない のは 床の 上の 4 段。箱の 外・建築中でない ときは どちらも 偽', () => {
    const r = rig();
    expect(r.b.locked(AT.x, AT.y, AT.z)).toBe(false);
    r.start();
    for (const [x, y, z] of [[AT.x, AT.y, AT.z], [AT.x + 6, AT.y + 4, AT.z + 6], [AT.x + 3, AT.y + 2, AT.z + 3]] as const) expect(r.b.locked(x, y, z), `${x},${y},${z}`).toBe(true);
    for (const [x, y, z] of [[AT.x - 1, AT.y, AT.z], [AT.x + 7, AT.y, AT.z], [AT.x, AT.y + 5, AT.z], [AT.x, AT.y - 1, AT.z], [AT.x, AT.y, AT.z + 7]] as const) expect(r.b.locked(x, y, z), `${x},${y},${z}`).toBe(false);
    expect(r.b.keepOut(AT.x + 3, AT.y + 1, AT.z + 3)).toBe(true);
    expect(r.b.keepOut(AT.x + 3, AT.y, AT.z + 3)).toBe(false); // 床の 段は 地面
    expect(r.b.keepOut(AT.x + 3, AT.y + 5, AT.z + 3)).toBe(false);
  });
  it('湧き（AC23）: まん中から 横 16 マス 以内は 湧かない、17 は 湧く。完成したら もどる', () => {
    const r = rig();
    const cx = AT.x + OUT / 2;
    const cz = AT.z + OUT / 2;
    expect(r.b.noSpawn(cx, cz)).toBe(false);
    r.start(10);
    expect(r.b.noSpawn(cx + 16, cz)).toBe(true);
    expect(r.b.noSpawn(cx + 17, cz)).toBe(false);
    expect(r.b.noSpawn(cx, cz - 16)).toBe(true);
    expect(r.b.noSpawn(cx + 12, cz + 12)).toBe(false); // 17
    r.run(10);
    expect(r.b.noSpawn(cx, cz)).toBe(false);
  });
  it('保存（AC32c）: 40% で 保存 → 読みこむと 40%・のこりの 長さで 完成。世界の ブロックは 同じ', () => {
    const r = rig();
    r.start(1000);
    r.run(400);
    const before = r.scan();
    const save = JSON.parse(JSON.stringify(r.b.serialize()));
    const r2 = rig();
    for (let y = 0; y < 5; y++) for (let z = 0; z < OUT; z++) for (let x = 0; x < OUT; x++) r2.world.setBlock(AT.x + x, AT.y + y, AT.z + z, r.world.getBlock(AT.x + x, AT.y + y, AT.z + z) as 'air');
    r2.b.load(save);
    expect(r2.b.view()).toMatchObject({ leftTicks: 600, at: AT });
    expect(r2.b.firstBonus()).toBe(false);
    expect(r2.scan()).toEqual(before);
    r2.run(1);
    expect(r2.scan().scaffold).toBe(before.scaffold); // 開きなおしで 足場を かべに おきかえない
    r2.run(598);
    expect(r2.finished).toEqual([]);
    r2.run(1);
    expect(r2.finished).toHaveLength(1);
  });
  it('前の セーブ（建築の 記録なし）・こわれた 記録は 建築中なし・おまけ あり', () => {
    const r = rig();
    r.start(100);
    for (const raw of [undefined, null, 5, {}, { active: { number: 1 } }, { v: 1, active: { number: 'x', bp: 3, at: {}, elapsed: 'a', length: 0 } }]) {
      r.b.load(raw);
      expect(r.b.view(), JSON.stringify(raw)).toBeNull();
      expect(r.b.firstBonus()).toBe(true);
    }
  });
  it('時間は 世界の 歩数: update を 呼ばない 間（メニュー・上空の 視点）は すすまない。遠くに 行っても 同じ 歩数で 完成', () => {
    const r = rig({ loaded: (x) => x >= 30 && x < 50 });
    r.start(300);
    r.run(100);
    expect(r.b.view()?.leftTicks).toBe(200);
    expect(r.b.view()?.leftTicks).toBe(200);
    r.run(200);
    expect(r.finished).toHaveLength(1);
  });
  it('場所が 読みこまれて いない 間に 完成: 形は 読みこまれた あと 書く。足場は のこらない', () => {
    let loaded = true;
    const r = rig({ loaded: () => loaded });
    r.start(200);
    r.run(50);
    loaded = false;
    r.run(160);
    expect(r.b.view()).toBeNull();
    expect(r.finished).toEqual([]);
    loaded = true;
    r.run(60);
    expect(r.finished).toHaveLength(1);
    expect(r.scan().scaffold).toBe(0);
  });
  it('場所が 読みこまれて いない 間に 進んだ 分は、読みこまれたら 1 回で 合わせる', () => {
    let loaded = true;
    const r = rig({ loaded: () => loaded });
    r.start(1000);
    r.run(100);
    loaded = false;
    r.run(500); // 600
    loaded = true;
    r.run(70); // 670: 60 ステップ ごとの 見直しで 合う
    const s = r.scan();
    expect(s.wall).toBeGreaterThan(0);
    const fresh = rig();
    fresh.start(1000);
    fresh.run(670);
    expect(s).toEqual(fresh.scan());
  });
});
