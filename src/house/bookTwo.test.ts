import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { HouseBook, type HouseRec, type HouseView } from './book';
import { emptyState } from './editor/model';
import { makeFakeWorld } from './fakeWorld';
import { HouseSystem } from './system';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)「家に 入った 名前の 帯」・§8 の 5d・AC168）: 2P だけが 建てた 家の 戸を 外から 通って 中に 入っても 名前の 帯が 出る。
 * 同じ ステップに 2 人なら 帯は 1 つ。実装の 前に 書いた 赤の テスト。
 *
 * ---- 開発への つなぎ目の 約束（名前は 開発が かえて よい。かえたら 依頼文と 仕様に 書く）----
 *   HouseBook.step(p: Vec3, who: 1 | 2 = 1): HouseRec | null   … 前の マス・「戸の マスに 入った 家」の おぼえを 人ごとに 持つ（1P の 動きが 2P の 判定を こわさない）。who を 省くと 1P（今の まま）
 *   HouseSystem.update(): 毎ステップ 人ごとに playerOf(who)（なければ とばす）で book.step を 呼び、入った 家が あれば nameBand を 呼ぶ。
 *     同じ ステップに 2 人が 同じ 家へ 入っても nameBand は 1 回。HouseSystemDeps.playerOf は system.2p.test.ts の 約束と 同じ。
 */

const DOOR = { x: 20, y: 10, z: 30 };
const REC: Omit<HouseRec, 'id'> = { name: 'ひみつきち', front: 'ひみつ', back: 'きち', number: 1, outer: { w: 7, d: 7 }, door: DOOR, doorOpen: false };
const at = (x: number, z: number, y = DOOR.y): Vec3 => ({ x: x + 0.5, y, z: z + 0.5 });

describe('AC168 HouseBook.step は 人ごと', () => {
  it('2P が 外 → 戸 → 中 と 通ると その 家を 返す（who 2）', () => {
    const book = new HouseBook();
    const rec = book.add(REC);
    expect(book.step(at(DOOR.x, DOOR.z + 1), 2)).toBeNull();
    expect(book.step(at(DOOR.x, DOOR.z), 2)).toBeNull();
    expect(book.step(at(DOOR.x, DOOR.z - 1), 2)).toBe(rec);
  });

  it('1P が 同じ 時に べつの 所を 歩いても 2P の 判定は こわれない（ステップごとに 交互に よぶ）', () => {
    const book = new HouseBook();
    const rec = book.add(REC);
    const out: Array<HouseRec | null> = [];
    const walk = [at(DOOR.x, DOOR.z + 1), at(DOOR.x, DOOR.z), at(DOOR.x, DOOR.z - 1)];
    walk.forEach((p, i) => {
      book.step(at(50 + i, 50), 1); // 1P は 遠くの 平らな 所を 歩く
      out.push(book.step(p, 2));
    });
    expect(out).toEqual([null, null, rec]);
  });

  it('1P の 判定も 2P が 歩いて いる あいだ こわれない', () => {
    const book = new HouseBook();
    const rec = book.add(REC);
    const out: Array<HouseRec | null> = [];
    [at(DOOR.x, DOOR.z + 1), at(DOOR.x, DOOR.z), at(DOOR.x, DOOR.z - 1)].forEach((p, i) => {
      book.step(at(50 + i, 50), 2);
      out.push(book.step(p));
    });
    expect(out).toEqual([null, null, rec]);
  });

  it('who を 省くと 1P（今の まま）', () => {
    const book = new HouseBook();
    const rec = book.add(REC);
    book.step(at(DOOR.x, DOOR.z + 1));
    book.step(at(DOOR.x, DOOR.z));
    expect(book.step(at(DOOR.x, DOOR.z - 1))).toBe(rec);
  });
});

describe('AC168 HouseSystem の 名前の 帯', () => {
  function make(withP2: boolean) {
    const bands: string[] = [];
    const p1 = { x: 64.5, y: 11, z: 64.5 };
    const p2 = { x: 60.5, y: 11, z: 60.5 };
    const world = makeFakeWorld({ height: () => 9 });
    const sys = new HouseSystem({
      seed: 77,
      world,
      spawn: () => ({ x: 64.5, z: 64.5, yawDeg: 0 }),
      player: () => p1,
      bag: new InventoryImpl(),
      voice: () => {},
      gave: () => {},
      onOpen: () => {},
      onClose: () => {},
      isLand: () => true,
      nameBand: (t: string) => bands.push(t),
      ...(withP2 ? { playerOf: (who: 1 | 2) => (who === 1 ? p1 : p2) } : {}),
    } as never);
    const draft = emptyState();
    draft.name = { front: 'あい', back: 'ハウス' };
    draft.furniture = [{ kind: 'table', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 3, z: 3, rot: 1 }];
    const number = sys.state.register(draft);
    const rec = sys.buildNow(number, { x: 40, y: 10, z: 40 })!;
    // もう 1 けん（べつの 場所・べつの なまえ）
    const draft2 = emptyState();
    draft2.name = { front: 'べつ', back: 'ハウス' };
    draft2.furniture = [{ kind: 'table', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 3, z: 3, rot: 1 }];
    const rec2 = sys.buildNow(sys.state.register(draft2), { x: 80, y: 10, z: 80 })!;
    const stand = (p: Vec3, dz: number, house: HouseView = rec): void => {
      p.y = house.door.y;
      p.x = house.door.x + 0.5;
      p.z = house.door.z + 0.5 + dz;
    };
    return { sys, p1, p2, rec, rec2, bands, stand };
  }

  it('2P だけが 戸を 外から 通って 中へ: 名前の 帯が 1 回', () => {
    const { sys, p2, bands, stand } = make(true);
    for (const dz of [2, 1, 0]) {
      stand(p2, dz);
      sys.update();
    }
    expect(bands, '戸の マスでは まだ').toEqual([]);
    stand(p2, -1);
    sys.update();
    expect(bands).toEqual(['あいハウス']);
    stand(p2, -2);
    sys.update();
    expect(bands, '中を 歩いても 出なおさない').toEqual(['あいハウス']);
  });

  it('同じ ステップに 2 人が 同じ 家へ 入っても 帯は 1 つ', () => {
    const { sys, p1, p2, bands, stand } = make(true);
    for (const dz of [2, 1, 0, -1]) {
      stand(p1, dz);
      stand(p2, dz);
      sys.update();
    }
    expect(bands).toEqual(['あいハウス']);
  });

  it('2 人が 同じ ステップに べつべつの 家へ 入ったら 帯は 1 つで 1P の 家の なまえ', () => {
    const { sys, p1, p2, rec, rec2, bands, stand } = make(true);
    expect(rec2.id).not.toBe(rec.id);
    for (const dz of [2, 1, 0, -1]) {
      stand(p1, dz, rec2); // 1P は べつ ハウス
      stand(p2, dz, rec); // 2P は あい ハウス
      sys.update();
    }
    expect(bands).toEqual(['べつハウス']);
  });

  it('2P が いない（playerOf を わたさない）1 人の ときは 今まで どおり 1P の 帯だけ', () => {
    const { sys, p1, bands, stand } = make(false);
    for (const dz of [2, 1, 0, -1]) {
      stand(p1, dz);
      sys.update();
    }
    expect(bands).toEqual(['あいハウス']);
  });
});
