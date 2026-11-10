import { describe, expect, it } from 'vitest';
import type { ItemId, Vec3 } from '../contracts';
import { NOD_STEPS } from './architect';
import { GY, PAD, houseRig } from './houseRig';
import { addPerson, type Person, type Stock } from './stockKit';
import { TALK_RANGE } from './system';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)「建築士さんの 中身」・§8 の 5d・§10【5d】・AC163・AC164・AC167・AC145）: 2P が 話した 建築士さんは 話した 人の 物で 動く。
 * 実装の 前に 書いた 赤の テスト。オーナー 2026-11-10: 建築士さんは 今の 仕様どおり（全面・世界を 止める・もう 1 人の 半分に「ちょっと まってね」）で 確定。
 *
 * ---- 開発への つなぎ目の 約束（`src/house/system.ts`〔HouseSystem〕・`src/house/build/glue.ts`。名前は 開発が かえて よい。かえたら 依頼文と 仕様に 書く）----
 *   HouseSystemDeps に 足す（どれも 省ける。ぜんぶ 省くと 今まで どおり 1P だけ）:
 *     playerOf?: (who: 1 | 2) => Vec3 | null         // その 人の 足もと。2P が いなければ null（省くと who 1 は player()、who 2 は null）
 *     bagOf?: (who: 1 | 2) => SheetBag                // その 人の もちもの（省くと bag）。せっけいず・材料・どうぐは 話した 人の 物
 *     craftOf?: (who: 1 | 2) => CraftCount | undefined // その 人から 設定 craftTansuRange の たんす（省くと craft）。たんす本体の 取り出しは tansu のまま
 *     teleport?: (who: 1 | 2, x, y, z) => void       // 〔かえる〕今は (x, y, z)。建築が はじまる とき 箱の 中の 人を 外へ
 *     gave?: (item: ItemId, who: 1 | 2) => void       // 〔かえる〕今は (item)。道具を わたした。1P の「もらった」ログは 配線の 側で who 1 の ときだけ 出す
 *     interrupted?: (who: 1 | 2) => boolean           // 〔かえる〕今は ()。who は 話して いる 人（倒れた・もちもの画面・とりごやの メニュー）
 *   HouseSystem: talkTo(id, who: 1 | 2 = 1)・hit(id, who: 1 | 2 = 1)・talker(): 1 | 2 | null（話して いる 人。話して いなければ null）
 *     話して いる あいだ、中の「プレイヤーの 場所」は ぜんぶ talker() の 場所（話す きょり TALK_RANGE・なまえを かえる の 一覧の 順・建てる 場所さがし・向きを あわせる 先・とんかちの 音の きょり）
 *   BuildGlue: ［ここに たてる］で 箱の 中に いる 人は 1P も 2P も 戸の 前へ（teleport(who, …)）。1P は 一覧の 1 番目、2P は 2 番目（1 つしか なければ 同じ 所）。箱の 外の 人は うごかさない
 *   テスト用の 道具: src/house/houseRig.ts の extraDeps、src/house/stockKit.ts の addPerson・putTansuAt（この ブランチで 足した）
 */

type Who = 1 | 2;

function rig2(opts: { range?: number } = {}) {
  let person!: Person;
  let stock!: Stock;
  const log = { gave: [] as Array<[string, Who | undefined]>, tele: [] as Array<[Who, number, number, number]>, interrupted: [] as Who[] };
  const stop: Record<Who, boolean> = { 1: false, 2: false };
  const r = houseRig({
    ...(opts.range !== undefined ? { range: opts.range } : {}),
    extraDeps: (st) => {
      stock = st;
      person = addPerson(st, { x: st.player.x + 2, y: st.player.y, z: st.player.z });
      return {
        playerOf: (who: Who) => (who === 1 ? st.player : person.player),
        bagOf: (who: Who) => (who === 1 ? st.bag : person.bag),
        craftOf: (who: Who) => (who === 1 ? st.craft : person.craft),
        gave: (item: ItemId, who?: Who) => void log.gave.push([item, who]),
        teleport: (who: Who, x: number, y: number, z: number) => void log.tele.push([who, x, y, z]),
        interrupted: (who: Who) => {
          log.interrupted.push(who);
          return stop[who];
        },
      };
    },
  });
  const arch = () => r.sys.architects()[0]!;
  /** 話しかけて メニューが 開くまで（2 回目の 形。うなずき NOD_STEPS） */
  const talkAs = (who: Who): void => {
    expect(r.sys.talkTo(arch().id, who), `${who}P が 話しかけられる`).toBe(true);
    r.run(NOD_STEPS);
  };
  /** 話した 人の もちものに せっけいずを 1 まい 作る（かみ 2・ふで 1 を その 人の もちものに 足してから）。マスの 番号 */
  const makeFor = (bag: Person['bag']): number => {
    bag.add('paper', 2);
    bag.add('fude', 1);
    r.sys.press('editor');
    for (const op of [{ op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'chair', x: 4, z: 0 }]) expect(r.hook.edit(op)).toBe(true);
    r.sys.press('next');
    r.sys.press('next');
    for (const ch of 'もも') r.hook.edit({ op: 'char', ch });
    r.sys.press('done');
    if (r.hook.editor()?.confirm === 'futonOnly') r.sys.press('yes');
    return r.hook.blueprints().at(-1)!.slot;
  };
  return { r, get person() { return person; }, get stock() { return stock; }, log, stop, arch, talkAs, makeFor };
}

describe('AC163 話した 人（talker）', () => {
  it('2P が 話せば talker() は 2、1P が 話せば 1、話して いなければ null。話して いる あいだ もう 1 人は 話せない', () => {
    const { r, arch } = rig2();
    expect(r.sys.talker()).toBeNull();
    expect(r.sys.talkTo(arch().id, 2)).toBe(true);
    expect(r.sys.talker()).toBe(2);
    expect(r.sys.talkTo(arch().id, 1), '2P が 話して いる あいだ（メニューの 前）は 1P は 話せない').toBe(false);
    expect(r.sys.talker()).toBe(2);
    r.sys.close();
    expect(r.sys.talker()).toBeNull();
    expect(r.sys.talkTo(arch().id), 'who を 省くと 1P').toBe(true);
    expect(r.sys.talker()).toBe(1);
  });

  it('2P が 話した メニューは 開いて 世界を 止め、とじると onClose。talker() は とじると null', () => {
    const { r, talkAs } = rig2();
    talkAs(2);
    expect(r.sys.menu().open).toBe(true);
    expect(r.sys.frozen()).toBe(true);
    expect(r.sys.talker()).toBe(2);
    expect(r.calls.filter((c) => c === 'open')).toHaveLength(1);
    r.sys.press('close');
    expect(r.sys.frozen()).toBe(false);
    expect(r.sys.talker()).toBeNull();
    expect(r.calls.filter((c) => c === 'close')).toHaveLength(1);
  });

  it('話しを つづける きょりは 話した 人の 場所で 見る: 2P が 話して 2P だけ 遠く なると やめる（1P が 近くても）', () => {
    const { r, arch, person } = rig2();
    r.sys.talkTo(arch().id, 2);
    person.player.x = arch().x + TALK_RANGE + 3;
    r.sys.update();
    expect(r.sys.talking()).toBe(false);
    expect(r.sys.talker()).toBeNull();
  });

  it('2P が 話して いる あいだ、1P だけ 遠く なっても つづく（うなずきの あと メニューが 開く）', () => {
    const { r, arch, stock } = rig2();
    r.sys.talkTo(arch().id, 2);
    stock.player.x = arch().x + TALK_RANGE + 3;
    r.run(NOD_STEPS);
    expect(r.sys.talking()).toBe(true);
    expect(r.sys.menu().open).toBe(true);
  });

  it('1P が 話して いる あいだ 2P が 遠く なっても つづく（今の 1P の 決まり）', () => {
    const { r, arch, person } = rig2();
    r.sys.talkTo(arch().id, 1);
    person.player.x = arch().x + TALK_RANGE + 3;
    r.run(NOD_STEPS);
    expect(r.sys.menu().open).toBe(true);
  });

  it('interrupted は 話した 人で 聞く: 2P が 倒れた（interrupted(2)）で やめる。1P の 倒れた（interrupted(1)）では やめない', () => {
    const a = rig2();
    a.r.sys.talkTo(a.arch().id, 2);
    a.stop[1] = true;
    a.r.run(2);
    expect(a.r.sys.talking(), '1P が 倒れても 2P の 話は つづく').toBe(true);
    a.stop[2] = true;
    a.r.run(1);
    expect(a.r.sys.talking(), '2P が 倒れたら やめる').toBe(false);
    expect(a.log.interrupted).toContain(2);
    const b = rig2();
    b.r.sys.talkTo(b.arch().id, 1);
    b.stop[2] = true;
    b.r.run(2);
    expect(b.r.sys.talking(), '2P の もちもの画面は 1P の 話を やめさせない').toBe(true);
    b.stop[1] = true;
    b.r.run(1);
    expect(b.r.sys.talking()).toBe(false);
  });

  it('建築士さんは 話した 人の 方を 向く（2P が 東、1P が 西 に いて 2P が 話す）', () => {
    const { r, arch, person, stock } = rig2();
    const a = arch();
    stock.player.x = a.x - 3;
    stock.player.z = a.z;
    person.player.x = a.x + 3;
    person.player.z = a.z;
    r.sys.talkTo(a.id, 2);
    r.run(NOD_STEPS);
    const yaw = r.sys.manager.get(a.id)!.yaw; // 0 = 北、東 = π/2
    expect(Math.abs(yaw - Math.PI / 2)).toBeLessThan(0.3);
  });

  it('たたく（おっとっと）は たたいた 人の 方から: 2P が 東から たたけば 西へ かたむく', () => {
    const { r, arch, person } = rig2();
    const a = arch();
    person.player.x = a.x + 2;
    person.player.z = a.z;
    r.sys.hit(a.id, 2);
    const w = r.sys.manager.get(a.id)!;
    expect(w.wobble).toBe(0);
    expect(Math.abs(w.wobbleDir - -Math.PI / 2)).toBeLessThan(0.01);
  });

  it('なまえを かえる の 一覧の 順は 話した 人の 場所から 近い 順（2P が 家 B の そば）', () => {
    const { r, person, stock, makeFor } = rig2();
    r.talk();
    const slot = makeFor(r.bag);
    r.sys.press('close');
    const number = r.hook.blueprints().find((b) => b.slot === slot)!.number;
    const A = r.sys.buildNow(number, { x: 20, y: GY, z: 20 })!;
    const B = r.sys.buildNow(number, { x: 100, y: GY, z: 100 })!;
    stock.player.x = A.door.x + 0.5;
    stock.player.z = A.door.z + 3;
    person.player.x = B.door.x + 0.5;
    person.player.z = B.door.z + 3;
    r.sys.manager.refresh(stock.player);
    const a = r.sys.architects()[0]!;
    // 建築士さんは 1P の そば（広場）に いない ので、話しかけは 2P の 目の前に うつして から
    r.sys.manager.get(a.id)!.relocate(person.player.x + 1, GY + 1, person.player.z + 1);
    expect(r.sys.talkTo(a.id, 2)).toBe(true);
    r.run(NOD_STEPS);
    r.sys.press('rename');
    expect(r.sys.renameView().houses.map((h) => h.id)).toEqual([B.id, A.id]);
  });
});

describe('AC163 どうぐを もらう（2P）', () => {
  it('はじめて 2P が 話すと みずもり・どうづき・ふでは 2P の もちものに 入る。1P の もちものは かわらない。gave には who 2 が つく', () => {
    const { r, person, stock, log, arch } = rig2();
    r.sys.state.record.toolsGiven = false;
    r.sys.state.record.fudeGiven = false;
    r.sys.talkTo(arch().id, 2);
    r.run(NOD_STEPS * 8);
    for (const item of ['mizumori', 'dotsuki', 'fude'] as const) {
      expect(person.bag.count(item as ItemId), `2P の ${item}`).toBe(1);
      expect(stock.bag.count(item as ItemId), `1P の ${item}`).toBe(0);
    }
    expect(log.gave.map((g) => g[1])).toEqual([2, 2, 2]);
  });
});

describe('AC163 材料は 話した 人の もちもの ＋ その人から craftTansuRange の たんす', () => {
  it('2P が 話すと せっけいずは 2P の もちものに できる。ひつような ものの「ある」は 2P の もちもの ＋ 2P の そばの たんす（1P の 物・1P の そばの たんすは 数えない）', () => {
    const { r, person, stock, talkAs, makeFor } = rig2({ range: 5 });
    talkAs(2);
    const slot = makeFor(person.bag);
    expect(r.hook.blueprints().map((b) => b.slot)).toContain(slot);
    expect(stock.bag.count('paper' as ItemId), '1P の かみは へらない').toBe(0);
    const rows = r.sys.need(slot);
    const item = rows.find((x) => x.need > 0)!.item as ItemId;
    // 1P の もちもの・1P の そばの たんす（2P からは 範囲の 外）に 山ほど。2P の そばの たんすに 2、2P の もちものに 1
    stock.bag.add(item, 50);
    stock.putTansuAt({ x: Math.floor(stock.player.x) - 4, y: stock.player.y, z: Math.floor(stock.player.z) }, { [item]: 50 });
    stock.putTansuAt({ x: Math.floor(person.player.x) + 3, y: person.player.y, z: Math.floor(person.player.z) }, { [item]: 2 });
    person.bag.add(item, 1);
    r.sys.press('close');
    talkAs(2);
    expect(r.sys.need(slot).find((x) => x.item === item)!.have).toBe(3);
  });

  it('建てると 材料は 2P の そばの たんす → 2P の もちもの の 順に へる（たんすの 分が 先）。1P の もちものは へらない', () => {
    const { r, person, stock, talkAs, makeFor } = rig2({ range: 5 });
    talkAs(2);
    const slot = makeFor(person.bag);
    const rows = r.sys.need(slot).filter((x) => x.need > 0);
    const row = rows[0]!;
    const near = stock.putTansuAt({ x: Math.floor(person.player.x) + 3, y: person.player.y, z: Math.floor(person.player.z) }, { [row.item]: 1 });
    // 2P の もちものには ぜんぶの 分 ＋ たんすに ある 1 つ分の よぶん。たんすが 先に へれば もちものに 1 のこる
    for (const x of rows) person.bag.add(x.item as ItemId, x.need);
    person.bag.add(row.item as ItemId, 1);
    stock.bag.add(row.item as ItemId, 7);
    const mine = Object.fromEntries(rows.map((x) => [x.item, stock.bag.count(x.item as ItemId)]));
    r.pad();
    r.startBuild(slot);
    expect(r.hook.building(), '2P の 場所で 建築が はじまる').not.toBeNull();
    expect(stock.inTansu(near, row.item as ItemId), '2P の そばの たんすが 先に へる').toBe(0);
    // 開発の 直し: もちもの = need + 1。たんすの 1 が 先に へり、もちものからは need - 1 へるので のこりは 2（元の 1 は 数えちがい。報告に 書いた）
    expect(person.bag.count(row.item as ItemId), 'もちものは たんすの 分だけ のこる').toBe(2);
    for (const x of rows) {
      if (x.item !== row.item) expect(person.bag.count(x.item as ItemId), `2P の ${x.item}`).toBe(0);
      expect(stock.bag.count(x.item as ItemId), `1P の ${x.item}`).toBe(mine[x.item]);
    }
  });

  it('建てる 場所さがしは 話した 人の 足もと: 1P が 場所から 遠く、2P が 場所の そばなら 2P が 話すと 上空の 視点に 場所が 出る', () => {
    const { r, person, stock, talkAs, makeFor } = rig2();
    talkAs(2);
    const slot = makeFor(person.bag);
    for (const x of r.sys.need(slot)) if (x.need > 0) person.bag.add(x.item as ItemId, x.need);
    r.pad();
    stock.player.x = 20;
    stock.player.z = 20; // 1P は とおい
    r.sys.press('build');
    r.sys.press('pick', slot);
    expect(r.sys.menu().page).toBe('sky');
    expect(r.hook.sites()).toEqual([{ x: PAD.x, y: GY, z: PAD.z }]);
  });
});

describe('AC164 建築の はじまり: 箱の 中の 人は 1P も 2P も 戸の 前へ', () => {
  /** 箱 = 場所の 7×7（PAD〜PAD+7）。2 人を 中・外に おいて 建築を はじめ、うつされた 人と 先を 返す */
  function begin(who: Who, at: Record<Who, 'in' | 'out'>) {
    const k = rig2();
    k.talkAs(who);
    const bag = who === 1 ? k.stock.bag : k.person.bag;
    const slot = k.makeFor(bag);
    for (const x of k.r.sys.need(slot)) if (x.need > 0) bag.add(x.item as ItemId, x.need);
    k.r.pad();
    const inside = { x: PAD.x + 3.5, y: GY + 1, z: PAD.z + 3.5 };
    const put = (p: Vec3, w: 'in' | 'out'): void => {
      if (w === 'in') Object.assign(p, inside);
      else Object.assign(p, { x: PAD.x - 6, y: GY + 1, z: PAD.z + 3.5 });
    };
    put(k.stock.player, at[1]);
    put(k.person.player, at[2]);
    k.r.startBuild(slot);
    expect(k.r.hook.building(), '建築が はじまる').not.toBeNull();
    const outside = (t: [Who, number, number, number]): boolean => t[1] < PAD.x || t[1] >= PAD.x + 7 || t[3] < PAD.z || t[3] >= PAD.z + 7;
    return { tele: k.log.tele, outside };
  }

  it('2P が 話し、1P も 2P も 箱の 中: 2 人とも 外へ。うつし先は 別々の 立てる 所', () => {
    const { tele, outside } = begin(2, { 1: 'in', 2: 'in' });
    expect(tele.map((t) => t[0]).sort()).toEqual([1, 2]);
    expect(tele.every(outside), '箱の 外').toBe(true);
    const one = tele.find((t) => t[0] === 1)!;
    const two = tele.find((t) => t[0] === 2)!;
    expect([one[1], one[3]]).not.toEqual([two[1], two[3]]);
  });

  it('1P が 話し、2P も 箱の 中: やはり 2 人とも 外へ', () => {
    const { tele } = begin(1, { 1: 'in', 2: 'in' });
    expect(tele.map((t) => t[0]).sort()).toEqual([1, 2]);
  });

  it('2P だけ 箱の 中: 2P だけ うつる。1P は うごかさない', () => {
    const { tele } = begin(2, { 1: 'out', 2: 'in' });
    expect(tele.map((t) => t[0])).toEqual([2]);
  });

  it('1P だけ 箱の 中: 1P だけ うつる（今の 1P の 決まり）', () => {
    const { tele } = begin(1, { 1: 'in', 2: 'out' });
    expect(tele.map((t) => t[0])).toEqual([1]);
  });
});

describe('AC145 保存の 形は かわらない', () => {
  it('2P が 話して 道具を もらっても serialize() の キーは 1P の ときと 同じ（新しい キーを 足さない）', () => {
    const a = rig2();
    a.r.sys.state.record.toolsGiven = false;
    a.r.sys.talkTo(a.arch().id, 1);
    a.r.run(NOD_STEPS * 8);
    const keys1 = Object.keys(a.r.sys.serialize()).sort();
    const b = rig2();
    b.r.sys.state.record.toolsGiven = false;
    b.r.sys.talkTo(b.arch().id, 2);
    b.r.run(NOD_STEPS * 8);
    expect(Object.keys(b.r.sys.serialize()).sort()).toEqual(keys1);
    expect(JSON.stringify(b.r.sys.serialize())).not.toMatch(/talker/);
  });
});
