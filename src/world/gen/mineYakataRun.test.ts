import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pt } from './mineShaftKit';
import { LOOKS, ZONES, blockIdsOf, rectCells, type Look, type YakataSampleRow, type Zone } from './mineYakataKit';
import { gateIds, lookBlocks, makeRig, oneOf, openSpots, pickBoth, type YakataRig } from './mineYakataRig';
import { gateCells, yakataBox } from './mineYakataReport';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.4・§4.5・§4.7・§5・受け入れ基準 F5・F7・F8・F12・F13〔やかたの 挑戦の 係〕）:
 *   窓口 `createMineHook({ world, chest, yakata })` の `open(x, y, z, who)`・`yakataStep()`・`yakataState(id)`・`yakataFoes(id)`〔mineYakataKit.ts の 冒頭〕。
 *   妖怪は うその 係〔`FakeYokai`〕。本物の YokaiManager〔60 ステップの 攻撃しない・ふつうの きまりの 外〕は mineYakataSpawn.test.ts。
 *   F5: あけた コマで 門 12 マスが あやしい かべ・宝箱が あいた 形・持ち物 かわらず・`floating` が `chestPreview`・`chosen`・7 ひき〔表の 内わけ・あけた 人から 遠い・2 区分 いじょう・
 *       祭壇の 上の 前の まん中で 左・右・前に 2 ひき いじょう〕・おしらせ 1 つ・ふつうの 妖怪が 去る・出現音 1 回。あける 立ち場所を 5 とおり かえる。
 *   F7: かち〔門 空気・持ち物 ふえる・お祝い・実績・`katta`・からっぽ・もう 出ない〕。F8: まけ〔しまる・消える・3 回 くり返して 同じ・消えた 1 ぴきは たおした〕。
 *   F12: 2 人 あそび。F13: 実績の できごと。数は 表〔`yakataTable()`〕から 読む〔#311〕。時間〔ms〕では 合否を きめない。
 * 赤の 確かめ: 1F の 前は やかたが なく「やかたが ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 900_000 });

let rows: YakataSampleRow[] = [];
beforeAll(() => {
  rows = pickBoth();
}, 1200_000);

const norm = (s: string): string => s.replace(/\s+/g, '');
const LOCKED_CHEST = 'ようかい を ぜんぶ たおすと もらえる よ';
const AFTER_LOSE = 'やかた の たからばこ は しまった。また ちょうせん しよう！';
const EMPTY = 'からっぽ だよ';

const rigOf = (look: Look, two = false): YakataRig => {
  const row = oneOf(rows, look);
  if (!row) throw new Error(`やかたが ない〔${look}〕`);
  return makeRig(row, { twoPlayers: two });
};
const tag = (r: YakataRig): string => `${r.y.look} ${r.row.shaft.id}`;
const cellKey = (p: Pt): string => `${Math.floor(p.x)},${Math.floor(p.z)}`;
/** 候補の マスから 区分 */
const zoneOf = (r: YakataRig, x: number, z: number): Zone | null => r.y.spawns.find((s) => cellKey(s.at) === `${Math.floor(x)},${Math.floor(z)}`)?.zone ?? null;
const centerOf = (r: YakataRig): Pt => ({ x: Math.floor((r.y.hall.x0 + r.y.hall.x1) / 2), y: r.y.hall.y, z: Math.floor((r.y.hall.z0 + r.y.hall.z1) / 2) });

/** 人を やられた ことに して 1 ステップ → 復活 */
function lose(r: YakataRig, who: (1 | 2)[] = [1]): void {
  for (const w of who) r.players.find((p) => p.who === w)!.dead = true;
  r.step();
}
function revive(r: YakataRig): void {
  for (const p of r.players) p.dead = false;
  r.step();
}

/** あけた コマの 確かめ〔F5〕。`spot` ＝ あける 人の 足の マス */
function checkStart(r: YakataRig, spot: Pt, front: boolean): string[] {
  const bad: string[] = [];
  const T = r.T;
  const y = r.y;
  const st = r.hook.yakataState(y.id);
  if (st.state !== 'chosen') bad.push(`state ${st.state}〔chosen〕`);
  if (st.left !== T.oyabun + T.taisho + T.nushi) bad.push(`left ${st.left}〔${T.oyabun + T.taisho + T.nushi}〕`);
  if (st.foes.length !== T.oyabun + T.taisho + T.nushi) bad.push(`foes ${st.foes.length}`);
  const B = lookBlocks(r);
  for (const [i, id] of gateIds(r).entries()) if (id !== B.kabe) bad.push(`門の ${i} マス目が ${id}〔${B.kabe}〕`);
  for (const c of y.chest.cells) if (r.hook.chestAt(c.x, c.y, c.z)?.opened !== true) bad.push(`宝箱 (${c.x}, ${c.y}, ${c.z}) が あいた 形でない`);
  if (r.bag(1).size !== 0 || r.bag(2).size !== 0 || r.drops.length !== 0 || r.telops.length !== 0) bad.push('持ち物・落とし物・テロップが かわった〔中身は うかぶ だけ〕');
  if (r.opened.length !== 0) bad.push(`宝箱の 「あけた」の できごとが ${r.opened.length} 回〔はじまりでは 出さない。F13〕`);
  const c0 = y.chest.cells[0]!;
  const preview = r.hook.chestPreview(c0.x, c0.y, c0.z);
  if (!preview || JSON.stringify(st.floating) !== JSON.stringify(preview.items)) bad.push(`floating ${JSON.stringify(st.floating)}〔chestPreview ${JSON.stringify(preview?.items)}〕`);

  // 7 ひき
  const spawned = r.yokai.spawned.slice(-st.foes.length);
  const want = r.hook.yakataFoes(y.id);
  const sig = (xs: { kind: string; rank?: string; title?: string }[]): string => JSON.stringify(xs.map((x) => `${x.kind}:${x.rank ?? x.title}`).sort());
  if (sig(spawned) !== sig(want)) bad.push(`7 ひきの 種類・二つ名が yakataFoes と ちがう: ${sig(spawned)} / ${sig(want)}`);
  const ranks = (t: string): number => spawned.filter((s) => s.title === t).length;
  if (ranks('oyabun') !== T.oyabun || ranks('taisho') !== T.taisho) bad.push(`内わけ おやぶん ${ranks('oyabun')}・たいしょう ${ranks('taisho')}〔${T.oyabun}・${T.taisho}〕`);
  if (spawned.some((s) => s.title === 'nushi')) bad.push('ヌシが いる');
  if (!spawned.every((s) => s.opts.free === true && s.opts.graceSteps === T.graceSteps)) bad.push(`ふつうの きまりの 外〔free〕・攻撃しない ${T.graceSteps} ステップ〔graceSteps〕で 出して いない`);
  const seen = new Set<string>();
  const zones: Zone[] = [];
  for (const s of spawned) {
    const z = zoneOf(r, s.x, s.z);
    if (!z) bad.push(`(${s.x}, ${s.z}) は 出る 場所の 候補でない`);
    else zones.push(z);
    if (seen.has(`${s.x},${s.z}`)) bad.push(`(${s.x}, ${s.z}) に 2 ひき`);
    seen.add(`${s.x},${s.z}`);
    const d = Math.hypot(s.x - (spot.x + 0.5), s.z - (spot.z + 0.5));
    if (d <= T.spawn.awayFromOpener) bad.push(`(${s.x}, ${s.z}) が あけた 人から ${d.toFixed(1)}〔${T.spawn.awayFromOpener} より 遠い〕`);
  }
  const count = (z: Zone): number => zones.filter((q) => q === z).length;
  if (new Set(zones).size < 2) bad.push(`2 区分 いじょうに いない〔${zones.join(',')}〕`);
  if (front) for (const z of ZONES) if (count(z) < T.spawn.minPerZone) bad.push(`${z} に ${count(z)} ひき〔${T.spawn.minPerZone} いじょう〕`);

  // おしらせ・音
  const notices = r.eventsOf('notice');
  if (notices.length !== 1 || notices[0]!.text !== 'start') bad.push(`おしらせが ${notices.length} つ〔はじまりの 1 つ だけ。たいしょうの「〇〇 が あらわれた！」は 出さない〕`);
  const sfx = r.eventsOf('sfx').map((e) => e.name);
  if (sfx.filter((n) => n === 'yakataGateClose').length !== 1) bad.push('ずずんが 1 回でない');
  if (sfx.filter((n) => n === 'titleAppear').length !== 1) bad.push(`二つ名の 出現音が ${sfx.filter((n) => n === 'titleAppear').length} 回〔1 回〕`);
  if (r.eventsOf('start').length !== 1) bad.push('start の できごとが 1 つでない');
  if (r.eventsOf('achievement').some((e) => e.kind === 'won')) bad.push('はじまりで「かちぬいた」の 実績');
  return bad;
}

describe('F5: あけた コマ', () => {
  it.each(LOOKS)('%s: 5 とおりの 立ち場所で あけて〔まけて 戻して くり返す〕 表の とおり', (look) => {
    const r = rigOf(look);
    const spots = openSpots(r);
    const bad: string[] = [];
    const hallMid = centerOf(r);
    for (const [i, spot] of spots.entries()) {
      r.clearEvents();
      r.yokai.left.length = 0;
      r.stand(1, spot);
      // ふつうの 妖怪: 大広間に 2 ひき・外〔横穴の 中〕に 1 ぴき
      const a = r.yokai.addOrdinary('karakasa', hallMid.x + 0.5, hallMid.y, hallMid.z + 0.5);
      const b = r.yokai.addOrdinary('chochin', hallMid.x + 2.5, hallMid.y, hallMid.z + 0.5);
      const out = r.y.passage[Math.min(4, r.y.passage.length - 1)]!;
      const c = r.yokai.addOrdinary('nurikabe', out.x + 0.5, out.y, out.z + 0.5);
      expect(r.hook.yakataState(r.y.id).state, `${tag(r)}: あける 前`).toBe('mada');
      r.step(3);
      r.open(1);
      for (const m of checkStart(r, spot, i === 0)) bad.push(`${tag(r)}〔立ち場所 ${i}〕: ${m}`);
      if (!r.yokai.left.includes(a) || !r.yokai.left.includes(b)) bad.push(`${tag(r)}〔立ち場所 ${i}〕: 大広間の ふつうの 妖怪が 去らない`);
      if (r.yokai.left.includes(c) || !r.yokai.alive(c)) bad.push(`${tag(r)}〔立ち場所 ${i}〕: 外の 妖怪まで 去った`);
      if (r.yokai.left.some((id) => r.foes().some((f) => f.id === id))) bad.push(`${tag(r)}: 二つ名の 妖怪が 去った`);
      // 次の ためしの ために: まけて もどす
      lose(r);
      revive(r);
      r.yokai.kill(c);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it.each(LOOKS)('%s: 挑戦の 間に 宝箱・うかぶ 中身を 右クリック → ログ「ようかい を ぜんぶ たおすと もらえる よ」・何も おきない〔2 マスの どちらでも〕', (look) => {
    const r = rigOf(look);
    r.stand(1, openSpots(r)[0]!);
    r.open(1);
    const foes = r.yokai.spawned.length;
    const before = JSON.stringify(r.hook.yakataState(r.y.id));
    r.says.length = 0;
    r.open(1, 0);
    r.open(1, 1);
    expect(r.says.map(norm), `${tag(r)} の ログ`).toEqual([norm(LOCKED_CHEST), norm(LOCKED_CHEST)]);
    expect(r.yokai.spawned.length, '妖怪が ふえない').toBe(foes);
    expect(JSON.stringify(r.hook.yakataState(r.y.id)), '状態が かわらない').toBe(before);
    expect(r.bag(1).size, '持ち物').toBe(0);
  });

  it.each(LOOKS)('%s: あける 前〔まだ〕は 何も おきない・宝箱の ふたは しまった 形・ふつうの 妖怪は そのまま', (look) => {
    const r = rigOf(look);
    const spots = openSpots(r);
    const a = r.yokai.addOrdinary('karakasa', spots[2]!.x + 0.5, spots[2]!.y, spots[2]!.z + 0.5);
    r.stand(1, spots[2]!);
    r.step(30);
    expect(r.hook.yakataState(r.y.id), tag(r)).toMatchObject({ state: 'mada', left: 0, foes: [], floating: null });
    expect(r.yokai.alive(a)).toBe(true);
    expect(r.yokai.spawned.length).toBe(0);
    for (const c of r.y.chest.cells) expect(r.hook.chestAt(c.x, c.y, c.z)?.opened, `${tag(r)} の 宝箱`).toBe(false);
    expect(gateIds(r).every((id) => id === 'air'), `${tag(r)}: 門は あいて いる`).toBe(true);
  });
});

describe('F7: かち', () => {
  it.each(LOOKS)('%s: 7 ひき ぜんぶ たおすと 門が ひらき 中身が 持ち物へ・お祝い・実績・katta。そのあと からっぽ・妖怪は 出ない・やかたの ブロックが ほれる', (look) => {
    const r = rigOf(look);
    const T = r.T;
    const total = T.oyabun + T.taisho + T.nushi;
    const c0 = r.y.chest.cells[0]!;
    const preview = r.hook.chestPreview(c0.x, c0.y, c0.z)!;
    r.stand(1, openSpots(r)[0]!);
    r.open(1);
    r.clearEvents();
    r.says.length = 0;
    const ids = r.foes().map((f) => f.id);
    expect(ids.length, `${tag(r)} の 7 ひき`).toBe(total);
    // 1 ぴき たおすたび のこりが へる
    for (const [k, id] of ids.entries()) {
      expect(r.hook.yakataState(r.y.id).left, `${k} ひき目の まえ`).toBe(total - k);
      r.yokai.kill(id);
      r.step();
      if (k < total - 1) {
        expect(r.hook.yakataState(r.y.id), `${k + 1} ひき たおした`).toMatchObject({ state: 'chosen', left: total - k - 1 });
        expect(gateIds(r).every((g) => g === lookBlocks(r).kabe), '門は まだ とじて いる').toBe(true);
        expect(r.bag(1).size, '中身は まだ もらえない').toBe(0);
      }
    }
    expect(r.hook.yakataState(r.y.id), tag(r)).toMatchObject({ state: 'katta', left: 0, floating: null });
    expect(gateIds(r).every((g) => g === 'air'), `${tag(r)}: 門が ひらく`).toBe(true);
    // 中身: C8 と 同じ 流れ〔入れた 数が chestPreview の とおり〕
    const got = new Map<string, number>();
    for (const [k, v] of r.bag(1)) got.set(k, v);
    for (const d of r.drops) got.set(d.item, (got.get(d.item) ?? 0) + d.count);
    const want = new Map<string, number>();
    for (const it of preview.items) want.set(it.item, (want.get(it.item) ?? 0) + it.count);
    expect([...got].sort(), `${tag(r)} の 中身`).toEqual([...want].sort());
    expect(r.says.length, '中身の ログ 1 行〔C8 と 同じ 流れ。chest.say〕').toBe(1);
    expect(r.opened, '宝箱の 「あけた」できごと〔段 4〕').toEqual([4]);
    expect(r.eventsOf('celebrate').map((e) => e.what).sort(), 'お祝い').toEqual(['confetti', 'fireworks']);
    expect(r.eventsOf('win').length, 'win').toBe(1);
    expect(r.eventsOf('notice').map((e) => e.text), 'おしらせ').toEqual(['win']);
    expect(r.eventsOf('achievement').filter((e) => e.kind === 'won').length, '実績').toBe(1);
    // そのあと
    expect(r.eventsOf('sfx').map((e) => e.name), '門が ひらく 音・ファンファーレ').toEqual(expect.arrayContaining(['yakataGateOpen', 'fanfare']));
    r.says.length = 0;
    const spawned = r.yokai.spawned.length;
    r.open(1, 0);
    r.open(1, 1);
    expect(r.says.map(norm), 'からっぽ').toEqual([norm(EMPTY), norm(EMPTY)]);
    expect(r.yokai.spawned.length, 'もう 出ない').toBe(spawned);
    expect(r.hook.yakataState(r.y.id).state).toBe('katta');
    for (const c of rectCells(r.y.hall).slice(0, 5)) expect(r.hook.yakataLocked(c.x, c.y - 1, c.z), `床 (${c.x}, ${c.y - 1}, ${c.z}) が ほれる`).toBe(false);
    for (const c of gateCells(r.y, r.T)) expect(r.hook.yakataLocked(c.x, c.y, c.z)).toBe(false);
  });

  it.each(LOOKS)('%s: たおさずに 消えた 妖怪も たおした と 数える〔のこりが へる・7 ひき そろえば かち〕', (look) => {
    const r = rigOf(look);
    r.stand(1, openSpots(r)[0]!);
    r.open(1);
    const ids = r.foes().map((f) => f.id);
    r.yokai.vanish(ids[0]!);
    r.step();
    expect(r.hook.yakataState(r.y.id), `${tag(r)}: 1 ぴき 消えた`).toMatchObject({ state: 'chosen', left: ids.length - 1 });
    for (const id of ids.slice(1)) r.yokai.kill(id);
    r.step();
    expect(r.hook.yakataState(r.y.id).state, '7 ひき そろった').toBe('katta');
    expect(gateIds(r).every((g) => g === 'air')).toBe(true);
  });
});

describe('F8: まけ', () => {
  it.each(LOOKS)('%s: 挑戦の 間に やられる → 同じ コマで しまる・消える・門が ひらく・mada・中身 なし。復活の あと ログ。3 回 くり返して 同じ', (look) => {
    const r = rigOf(look);
    const c0 = r.y.chest.cells[0]!;
    const first = { foes: JSON.stringify(r.hook.yakataFoes(r.y.id)), floating: null as string | null };
    const bad: string[] = [];
    for (let k = 0; k < 3; k++) {
      r.clearEvents();
      r.says.length = 0;
      r.stand(1, openSpots(r)[0]!);
      r.open(1);
      const st = r.hook.yakataState(r.y.id);
      if (k === 0) first.floating = JSON.stringify(st.floating);
      else if (JSON.stringify(st.floating) !== first.floating) bad.push(`${k + 1} 回目の floating が ちがう`);
      if (JSON.stringify(r.hook.yakataFoes(r.y.id)) !== first.foes) bad.push(`${k + 1} 回目の yakataFoes が ちがう`);
      // 1 ぴき たおして から まける〔たおした 妖怪の おとし物は 妖怪の 係の しごと〕
      const foes = r.foes();
      r.yokai.kill(foes[0]!.id);
      r.step();
      const rest = foes.slice(1).map((f) => f.id);
      lose(r);
      const after = r.hook.yakataState(r.y.id);
      if (after.state !== 'mada' || after.floating !== null || after.left !== 0) bad.push(`${k + 1} 回目: まけた あとの state ${JSON.stringify(after)}`);
      for (const c of r.y.chest.cells) if (r.hook.chestAt(c.x, c.y, c.z)?.opened !== false) bad.push(`${k + 1} 回目: 宝箱が しまらない`);
      if (!gateIds(r).every((g) => g === 'air')) bad.push(`${k + 1} 回目: 門が ひらかない`);
      if (!rest.every((id) => r.yokai.left.includes(id) && !r.yokai.alive(id))) bad.push(`${k + 1} 回目: のこりの 妖怪が 消えない`);
      if (r.yokai.left.includes(foes[0]!.id)) bad.push(`${k + 1} 回目: たおした 妖怪を 去らせた`);
      if (r.bag(1).size !== 0 || r.drops.length !== 0) bad.push(`${k + 1} 回目: 中身が 入って いる`);
      if (r.eventsOf('lose').length !== 1) bad.push(`${k + 1} 回目: lose が 1 つでない`);
      if (r.eventsOf('win').length !== 0) bad.push(`${k + 1} 回目: win が 出た`);
      revive(r);
      if (!r.eventsOf('say').some((e) => norm(e.text) === norm(AFTER_LOSE))) bad.push(`${k + 1} 回目: 復活の あとの ログが ない`);
      r.yokai.left.length = 0;
    }
    void c0;
    expect(bad.slice(0, 8), `${tag(r)}: ${bad.length} つ`).toEqual([]);
  });

  it.each(LOOKS)('%s: まけた あとで もう 1 回 あけて かてる〔中身は もらえる〕', (look) => {
    const r = rigOf(look);
    const c0 = r.y.chest.cells[0]!;
    const preview = r.hook.chestPreview(c0.x, c0.y, c0.z)!;
    r.stand(1, openSpots(r)[0]!);
    r.open(1);
    lose(r);
    revive(r);
    r.stand(1, openSpots(r)[0]!);
    r.open(1);
    expect(r.hook.yakataState(r.y.id).state).toBe('chosen');
    for (const f of r.foes()) r.yokai.kill(f.id);
    r.step();
    expect(r.hook.yakataState(r.y.id).state).toBe('katta');
    const total = [...r.bag(1).values()].reduce((a, b) => a + b, 0) + r.drops.reduce((a, d) => a + d.count, 0);
    expect(total, '中身の 数').toBe(preview.items.reduce((a, i) => a + i.count, 0));
  });
});

describe('F12: 2 人 あそび', () => {
  it.each(LOOKS)('%s: 中に いた 人だけが 挑戦・外の 人は 門を 通れない〔門は かべ〕・中の 1 人が やられても chosen・2 人 とも やられて mada', (look) => {
    const r = rigOf(look, true);
    const out = r.y.passage[Math.min(3, r.y.passage.length - 1)]!;
    r.stand(2, { ...out, y: out.y });
    r.stand(1, openSpots(r)[0]!);
    r.open(1);
    expect(r.hook.yakataState(r.y.id).state, `${tag(r)}: 1P が あけた`).toBe('chosen');
    // 外の 2P は 門の かべで 入れない
    for (const g of gateIds(r)) expect(g).toBe(lookBlocks(r).kabe);
    // 外の 人が やられても 挑戦は つづく〔中の 人が 1 人 いる〕
    lose(r, [2]);
    expect(r.hook.yakataState(r.y.id).state, '外の 人が やられた').toBe('chosen');
    revive(r);
    // 中の 人が 全員 やられて まけ
    lose(r, [1]);
    expect(r.hook.yakataState(r.y.id).state, '中の 人が 全員 やられた〔外の 人は いきて いる〕').toBe('mada');
  });

  it.each(LOOKS)('%s: 中の 2 人の うち 1 人が やられても chosen・2 人 とも やられて mada', (look) => {
    const r = rigOf(look, true);
    const spots = openSpots(r);
    r.stand(1, spots[2]!);
    r.stand(2, spots[3]!);
    r.open(1);
    lose(r, [2]);
    expect(r.hook.yakataState(r.y.id).state, `${tag(r)}: 2P だけ やられた`).toBe('chosen');
    lose(r, [1, 2]);
    expect(r.hook.yakataState(r.y.id).state, '2 人 とも やられた').toBe('mada');
    expect(gateIds(r).every((g) => g === 'air')).toBe(true);
  });

  it.each(LOOKS)('%s: かつと 中身は あけた 人の 持ち物へ〔あけた 人が やられて いても〕・あふれは あけた 人の 足もと', (look) => {
    const r = rigOf(look, true);
    const spots = openSpots(r);
    r.stand(1, spots[2]!);
    r.stand(2, spots[0]!);
    r.open(2); // 2P が あける
    r.players.find((p) => p.who === 2)!.dead = true; // 2P は やられて いるが 1P が のこって いる
    r.step();
    expect(r.hook.yakataState(r.y.id).state, '1 人 のこれば つづく').toBe('chosen');
    for (const f of r.foes()) r.yokai.kill(f.id);
    r.step();
    expect(r.hook.yakataState(r.y.id).state).toBe('katta');
    expect(r.bag(1).size, '1P の 持ち物は かわらない').toBe(0);
    expect(r.drops.every((d) => d.who === 2), 'あふれは 2P の 足もと').toBe(true);
    expect(r.bag(2).size + r.drops.length, '中身は 2P の 持ち物へ').toBeGreaterThan(0);
  });
});

describe('F13: 実績の できごと', () => {
  it.each(LOOKS)('%s: 足が 大広間に 入った とき 1 回〔入って いる 間は くりかえさない〕・はじまりでは「たからばこを あけた」を 出さない・かった とき 宝箱の 4 段目', (look) => {
    const r = rigOf(look);
    const out = r.y.passage[1]!;
    r.stand(1, out);
    r.step(5);
    expect(r.eventsOf('achievement').filter((e) => e.kind === 'found').length, `${tag(r)}: 横穴では まだ`).toBe(0);
    r.stand(1, centerOf(r));
    r.step(10);
    expect(r.eventsOf('achievement').filter((e) => e.kind === 'found').length, '大広間に 入った').toBe(1);
    expect(r.eventsOf('enter').length, 'enter').toBe(1);
    r.open(1);
    expect(r.opened, 'はじまり: 宝箱の 4 段目の できごと なし').toEqual([]);
    for (const f of r.foes()) r.yokai.kill(f.id);
    r.step();
    expect(r.opened, 'かった とき').toEqual([4]);
    expect(r.eventsOf('achievement').filter((e) => e.kind === 'won').length).toBe(1);
  });
});

// ------------------------------------------------------------------ F4: 本物の `yakataLocked`〔スタブでは ない〕

describe('F4: yakataLocked〔まだ・挑戦の 間は やかたの ブロックと ふさいだ かべで true〕', () => {
  const boxCells = (r: YakataRig): { x: number; y: number; z: number; id: string }[] => {
    const b = yakataBox(r.y, r.T);
    const out: { x: number; y: number; z: number; id: string }[] = [];
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++) out.push({ x, y, z, id: String(r.world.getBlock(x, y, z)) });
    return out;
  };
  it.each(LOOKS)('%s: まだ: 組の 4 つの ブロック〔かべ・ゆか・だん・たいまつ〕の マスは ぜんぶ true〔4 種類とも ある〕・自分で 置いた dirt・外の ふつうの いしは false', (look) => {
    const r = rigOf(look);
    const mine = new Set(blockIdsOf(r.T, look));
    const cells = boxCells(r);
    const look4 = cells.filter((c) => mine.has(c.id));
    for (const id of mine) expect(look4.some((c) => c.id === id), `${id} の マスが ある`).toBe(true);
    const bad = look4.filter((c) => !r.hook.yakataLocked(c.x, c.y, c.z));
    expect(bad.slice(0, 5), `${bad.length} マスが ロック されて いない`).toEqual([]);
    const spot = centerOf(r);
    r.world.setBlock(spot.x, spot.y + 2, spot.z, 'dirt' as never);
    expect(r.hook.yakataLocked(spot.x, spot.y + 2, spot.z), '自分で 置いた dirt').toBe(false);
    const b = yakataBox(r.y, r.T);
    const far = [b.x0 - 3, b.x1 + 3].map((x) => ({ x, y: r.y.hall.y - 6, z: b.z0 })).find((p) => String(r.world.getBlock(p.x, p.y, p.z)) === 'stone');
    expect(far, '外の いしの マス').toBeDefined();
    expect(r.hook.yakataLocked(far!.x, far!.y, far!.z), '外の いし').toBe(false);
  });

  it.each(LOOKS)('%s: 挑戦の 間は 門の 12 マスも true・まけると false・かった あとは ぜんぶ false', (look) => {
    const r = rigOf(look);
    const gate = gateCells(r.y, r.T);
    for (const c of gate) expect(r.hook.yakataLocked(c.x, c.y, c.z), '門の マス〔まだ。空気〕').toBe(false);
    r.stand(1, centerOf(r));
    r.open();
    for (const c of gate) expect(r.hook.yakataLocked(c.x, c.y, c.z), `挑戦の 間 門 (${c.x}, ${c.y}, ${c.z})`).toBe(true);
    const mine = new Set(blockIdsOf(r.T, look));
    const locked = boxCells(r).filter((c) => mine.has(c.id));
    expect(locked.every((c) => r.hook.yakataLocked(c.x, c.y, c.z)), '挑戦の 間も やかたの ブロックは true').toBe(true);
    for (const id of r.foes().map((q) => q.id)) r.yokai.kill(id);
    r.step();
    expect(r.hook.yakataState(r.y.id).state).toBe('katta');
    const still = boxCells(r).filter((c) => mine.has(c.id) && r.hook.yakataLocked(c.x, c.y, c.z));
    expect(still.slice(0, 5), 'かった あとは ぜんぶ false').toEqual([]);
  });
});
