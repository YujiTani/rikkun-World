import { describe, expect, it } from 'vitest';
import { GATE, TAIKO } from './townGate';
import { GATE_CODES, GATE_LAYERS } from './townGateLayers';
import { buildTower, buildYard } from './townGateTower';
import { at, buildLayout } from './townLayout';
import { Builder } from './townBuilder';
import { GATE_PARTS } from '../world/blocks/townGateParts';
import { townBuildingCells } from './townBuildings';
import { TOWN } from './townTuning';
import { DECO_EXTRA_TILES, TOWN_DECO_DEFS } from '../world/blocks/townDeco';

/** 門と たいこ橋（§2.2 の 9・§4.5）: 橋の 段差は 1 以下・門の 通り道は はば 5・頭の 高さ 5・大きな 楼門 */
const cells = townBuildingCells();
const has = (u: number, v: number, dy: number): boolean => cells.some((c) => c.u === u && c.v === v && c.dy === dy);

describe('たいこ橋', () => {
  it('どの 橋も 歩いて わたれる（となりの 列との 高さの 差が 1 以下・3 列とも おなじ 形）', () => {
    for (const t of TAIKO) {
      // 橋の ブロックは 地面と 同じ 高さ（足もと ＝ 地面の 上 1）。もり上げ e ＝ 足もとが e だけ 高い
      const tops = t.extra.map((e) => e);
      const north = t.v0 < 50; // 奥の 用水路の 橋は 奥がわが 1 だん 高い（奥の 列）
      const before = north ? TOWN.terrace.rise : 0;
      const after = 0;
      const seq = [before, ...tops, after];
      for (let i = 1; i < seq.length; i++) expect(Math.abs(seq[i]! - seq[i - 1]!), `${t.u},${t.v0} の ${i}`).toBeLessThanOrEqual(1);
      for (let u = t.u; u < t.u + 3; u++) t.extra.forEach((e, i) => expect(has(u, t.v0 + i, e - 1), `${u},${t.v0 + i}`).toBe(true));
    }
  });
  it('そりが ある（まん中が はしより 高い）', () => {
    for (const t of TAIKO) expect(Math.max(...t.extra)).toBeGreaterThan(t.extra[0]!);
  });
});

describe('門（二かいだての 楼門・アートの 設計 v2）', () => {
  const G = GATE;
  const P = G.passage;
  const bodyOf = (id: string): typeof cells => cells.filter((c) => c.id.startsWith(id));
  const own = new Builder();
  buildTower(own);
  const ownCells = [...own.cells.values()];
  it('大きさは はば 19 × おく 13 × 高さ 17（dy 0〜16）。通り道の 石だたみ（dy -1）も ふくむ', () => {
    const us = ownCells.map((c) => c.u);
    const vs = ownCells.map((c) => c.v);
    const ds = ownCells.map((c) => c.dy);
    expect(Math.max(...us) - Math.min(...us) + 1).toBe(19);
    expect(Math.max(...vs) - Math.min(...vs) + 1).toBe(13);
    expect(Math.min(...ds)).toBe(-1);
    expect(Math.max(...ds)).toBe(16);
    expect(Math.min(...us)).toBe(G.origin.u);
    expect(Math.min(...vs)).toBe(G.origin.v);
  });
  it('通り道は はば 5・高さ 6 が 前後の 道ごと あいている（2 人 ならんで 通れる）', () => {
    expect(P.u1 - P.u0 + 1).toBe(5);
    expect(P.clearDy + 1).toBe(6);
    for (let v = P.v0; v <= P.v1; v++) for (let u = P.u0; u <= P.u1; u++) for (let dy = 0; dy <= P.clearDy; dy++) expect(has(u, v, dy), `${u},${v},${dy}`).toBe(false);
  });
  it('歩いて 通れる: 通り道は 前から うしろまで 石だたみの 平らな 床（dy -1）で 段差が ない', () => {
    for (let v = P.v0; v <= P.v1; v++) for (let u = P.u0; u <= P.u1; u++) expect(cells.find((c) => c.u === u && c.v === v && c.dy === -1)?.id, `${u},${v}`).toMatch(/^town_ishidatami_[abc]$/);
  });
  it('通り道の まん中の 線（u 50）は 門の 前から ひろば（北）の ほうまで 頭の 高さ 以下が ふさがれず 見通せる', () => {
    for (let v = P.v0 - 10; v <= P.v1; v++) for (let dy = 0; dy <= P.clearDy; dy++) expect(has(50, v, dy), `v${v} dy${dy}`).toBe(false);
  });
  it('置き方の 表は 全部 そろっている（17 だん × 13 行 × 19 列・知らない 記号が ない・左右の あき・うまりが たいしょう）', () => {
    expect(GATE_LAYERS.length).toBe(18);
    for (const layer of GATE_LAYERS) {
      expect(layer.length).toBe(13);
      for (const row of layer) {
        const cs = row.split(' ');
        expect(cs.length).toBe(19);
        for (const c of cs) if (c !== '---') expect(Object.keys(GATE_CODES), c).toContain(c.slice(0, 2));
        for (let i = 0; i < 9; i++) expect(cs[i] === '---', row).toBe(cs[18 - i] === '---');
      }
    }
  });
  it('形ブロックは 41 しゅるい（新しい 39 ＋ 今の まるばしら・しゃちほこ）・どれも 箱 8 こ 以内・光らない', () => {
    expect(Object.keys(GATE_PARTS).length).toBe(41);
    for (const [k, p] of Object.entries(GATE_PARTS)) expect(p.boxes.length, k).toBeLessThanOrEqual(8);
    for (const d of TOWN_DECO_DEFS) if (d.id in GATE_PARTS || /^town_(.*)_[esnw]$/.test(d.id)) expect(d.glow, d.id).toBeNull();
  });
  it('かんばんの ブロックは ない・あかり 4（上限）・のぼり 4・ちょうちん 6 こで 光らない', () => {
    expect(cells.some((c) => c.id.startsWith('town_sign_gate') || c.id.startsWith('town_moji_')), 'かんばん').toBe(false);
    expect(cells.filter((c) => c.id === 'town_toro_mini' && c.v >= 70 && c.u >= 30 && c.u <= 70).length).toBe(4);
    expect(cells.filter((c) => c.id === 'town_noboru_aka' && c.dy === 0 && c.v >= 70).length).toBe(4);
    expect(ownCells.filter((c) => c.id.startsWith('town_chochin2')).length).toBe(6);
    for (const d of TOWN_DECO_DEFS.filter((x) => x.id.startsWith('town_chochin2'))) expect(d.glow).toBeNull();
  });
  it('かざりが そろっている: しゃちほこ 2・金の たま 1・朱の 丸柱・組物・屋根', () => {
    expect(ownCells.filter((c) => c.id.startsWith('town_shachi')).length, 'しゃちほこ').toBe(2);
    expect(ownCells.filter((c) => c.id === 'town_hoju').length, '金の たま').toBe(1);
    expect(ownCells.filter((c) => c.id === 'town_marubashira').length, '丸柱').toBe(42);
    expect(ownCells.filter((c) => /^town_(kumi|harisaki)/.test(c.id)).length, '組物').toBeGreaterThan(60);
    expect(ownCells.filter((c) => /^town_(yane|noki|sori)/.test(c.id)).length, '屋根').toBeGreaterThan(250);
    expect(bodyOf('town_gk').length + bodyOf('town_arch_').length, '古い 門の かざり').toBe(0);
  });
  it('門・へい・どうろうは 用水路・石段の きりこみに かからず、たがいに 重ならない', () => {
    const L = buildLayout();
    const yard = new Builder();
    buildYard(yard);
    for (const c of [...ownCells, ...yard.cells.values()]) {
      expect(L.canal[at(c.u, c.v)], `用水路 ${c.u},${c.v}`).toBe(0);
      expect(L.notch[at(c.u, c.v)], `石段 ${c.u},${c.v}`).toBe(0);
    }
    for (const c of yard.cells.values()) expect(own.has(c.u, c.v, c.dy), `${c.u},${c.v},${c.dy}`).toBe(false);
  });
  it('新しい 絵 town_taruki（たるき）が ある', () => {
    expect(DECO_EXTRA_TILES.some((t) => t.id === 'town_taruki')).toBe(true);
  });
});
