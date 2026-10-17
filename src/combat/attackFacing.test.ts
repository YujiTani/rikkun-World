import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { keyDirDeg } from './attackFacing';
import { P, angDiff, at, bearing, centerOf, decide, flatWorld, keys, mod360, settingsW3, yokaiAt } from './attackTestKit';

/**
 * WEAPON-3 §6 AC1〜AC5（向きの 決まり。`attackFacing`）。
 * 入出力の 形は attackTestKit.ts を 見る。期待の 角は 位置から テストの中で 計算する。
 */

describe('設定の 初期値（§4.7）', () => {
  it('bladeFaceAssistDeg 30・thrustTiltMaxDeg 45・punchShape 45/-0.5/3.0。bladeAimReach などは 今のまま', () => {
    const s = W2_SETTING_DEFAULTS as unknown as Record<string, unknown>;
    expect(s.bladeFaceAssistDeg).toBe(30);
    expect(s.thrustTiltMaxDeg).toBe(45);
    expect(s.punchShape).toEqual({ halfAngleDeg: 45, yMin: -0.5, yMax: 3.0 });
    expect(W2_SETTING_DEFAULTS.bladeAimReach).toBe(4.5);
    const c = settingsW3();
    expect(c.bladeFaceAssistDeg).toBe(30);
    c.punchShape.yMax = 9; // 複製（初期値の 入れ物を 書きかえない）
    expect(settingsW3().punchShape.yMax).toBe(3.0);
  });
});

describe('AC1 キーの向き', () => {
  const cases: Array<[string, Array<'forward' | 'back' | 'right' | 'left'>, number]> = [
    ['W', ['forward'], 0],
    ['D', ['right'], 90],
    ['S', ['back'], 180],
    ['A', ['left'], 270],
    ['W+D', ['forward', 'right'], 45],
    ['S+A', ['back', 'left'], 225],
  ];
  for (const Y of [0, 30, 200, 359]) {
    for (const [name, ks, off] of cases) {
      it(`yaw ${Y}: ${name} → yaw + ${off}`, () => {
        const k = keyDirDeg(Y, keys(...ks));
        expect(k).not.toBeNull();
        expect(angDiff(k!, mod360(Y + off))).toBeLessThan(0.001);
        expect(k!).toBeGreaterThanOrEqual(0);
        expect(k!).toBeLessThan(360);
      });
    }
  }
  it('W+S・A+D・何もなし → k なし', () => {
    expect(keyDirDeg(40, keys('forward', 'back'))).toBeNull();
    expect(keyDirDeg(40, keys('left', 'right'))).toBeNull();
    expect(keyDirDeg(40, keys())).toBeNull();
    expect(decide({ facingDeg: 123, keys: keys('forward', 'back') }).keyDeg).toBeNull();
  });
  it('a₀: キーなし → facing。キーあり → k（facing によらない）', () => {
    expect(decide({ yawDeg: 20, facingDeg: 123 }).baseDeg).toBeCloseTo(123, 3);
    for (const f of [0, 90, 200]) {
      const d = decide({ yawDeg: 20, facingDeg: f, keys: keys('right') });
      expect(d.keyDeg).toBeCloseTo(110, 3);
      expect(d.baseDeg).toBeCloseTo(110, 3);
    }
  });
  it('補助が なければ u = a₀（まるめない）', () => {
    const d = decide({ yawDeg: 0, facingDeg: 33.3 });
    expect(d.dirDeg).toBeCloseTo(33.3, 5);
  });
});

describe('AC2 補助の 角', () => {
  const a0 = 100;
  const withKarakasa = (off: number, dist = 2.0) => yokaiAt('karakasa', at(a0 + off, dist));
  it('30° − 2° の 向き・距離 2.0 → u = その 中心の 向き（±0.01°）。左右どちらも', () => {
    for (const off of [28, -28]) {
      const y = withKarakasa(off);
      const d = decide({ facingDeg: a0, yokai: [y] });
      expect(d.targetId).toBe(y.id);
      expect(angDiff(d.dirDeg!, bearing(centerOf(y)))).toBeLessThan(0.01);
    }
  });
  it('30° + 2° の 向き → 補助なし（u = a₀）', () => {
    for (const off of [32, -32]) {
      const y = withKarakasa(off);
      const d = decide({ facingDeg: a0, yokai: [y] });
      expect(d.targetId).toBeNull();
      expect(d.dirDeg).toBeCloseTo(a0, 5);
    }
  });
  it('bladeFaceAssistDeg = 0 → どの角でも u = a₀', () => {
    const s = settingsW3();
    s.bladeFaceAssistDeg = 0;
    for (const off of [0, 5, 28, -20]) {
      const d = decide({ facingDeg: a0, yokai: [withKarakasa(off)], settings: s });
      expect(d.targetId).toBeNull();
      expect(d.dirDeg).toBeCloseTo(a0, 5);
    }
  });
  it('bladeFaceAssistDeg = 60 → 50° の 向きの からかさを えらぶ', () => {
    const s = settingsW3();
    s.bladeFaceAssistDeg = 60;
    const y = withKarakasa(50);
    const d = decide({ facingDeg: a0, yokai: [y], settings: s });
    expect(d.targetId).toBe(y.id);
  });
  it('パンチでも 同じ（すで）', () => {
    const y = withKarakasa(28);
    const d = decide({ hold: 'punch', facingDeg: a0, yokai: [y] });
    expect(d.targetId).toBe(y.id);
    expect(decide({ hold: 'punch', facingDeg: a0, yokai: [withKarakasa(32)] }).targetId).toBeNull();
  });
  it('体に 重なっている 妖怪は 角 0°（えらべる）。u = a₀', () => {
    const y = yokaiAt('karakasa', at(0, 0.005));
    const d = decide({ facingDeg: 77, yokai: [y] });
    expect(d.targetId).toBe(y.id);
    expect(d.dirDeg).toBeCloseTo(77, 5);
  });
});

describe('AC3 いちばん 近い 1 体', () => {
  it('角 20°・距離 2.0 と 角 0°・距離 3.0 → 距離 2.0 の方', () => {
    const near = yokaiAt('karakasa', at(20, 2.0));
    const far = yokaiAt('karakasa', at(0, 3.0));
    expect(decide({ facingDeg: 0, yokai: [far, near] }).targetId).toBe(near.id);
    expect(decide({ facingDeg: 0, yokai: [near, far] }).targetId).toBe(near.id);
  });
  it('同じ 距離（差 0.01 未満）で 角 10° と 25° → 10° の方（id が 大きくても）', () => {
    const wide = yokaiAt('karakasa', at(25, 2.0), { id: 501 });
    const narrow = yokaiAt('karakasa', at(10, 2.004), { id: 502 });
    expect(decide({ facingDeg: 0, yokai: [wide, narrow] }).targetId).toBe(502);
    expect(decide({ facingDeg: 0, yokai: [narrow, wide] }).targetId).toBe(502);
  });
  it('距離も 角も 同じなら id が 小さい方', () => {
    const a = yokaiAt('karakasa', at(10, 2.0), { id: 601 });
    const b = yokaiAt('karakasa', at(10, 2.0), { id: 600 });
    expect(decide({ facingDeg: 0, yokai: [a, b] }).targetId).toBe(600);
  });
});

describe('AC4 えらばない', () => {
  it('(a) B と 中心の 間に 固い ブロック → 補助なし。とると えらぶ', () => {
    const w = flatWorld();
    const y = yokaiAt('karakasa', at(0, 2.5));
    w.setBlock(16, 9, 15, 'stone');
    w.setBlock(16, 10, 15, 'stone');
    expect(decide({ yokai: [y], world: w }).targetId).toBeNull();
    w.setBlock(16, 9, 15, 'air');
    w.setBlock(16, 10, 15, 'air');
    expect(decide({ yokai: [y], world: w }).targetId).toBe(y.id);
  });
  it('(b) dying・leaving', () => {
    for (const state of ['dying', 'leaving'] as const) {
      expect(decide({ yokai: [yokaiAt('karakasa', at(0, 2), { state })] }).targetId, state).toBeNull();
    }
    expect(decide({ yokai: [yokaiAt('karakasa', at(0, 2), { state: 'wander' })] }).targetId).not.toBeNull();
  });
  it('(c) 中段（突き）: 箱の いちばん近い所が 4.5 + 0.3 より 遠い → えらばない', () => {
    // からかさ 半径 0.6: 近い所 = 中心 − 0.6
    expect(decide({ tech: 'thrust', yokai: [yokaiAt('karakasa', at(0, 4.8 + 0.6 + 0.05))] }).targetId).toBeNull();
    expect(decide({ tech: 'thrust', yokai: [yokaiAt('karakasa', at(0, 4.5 - 0.3 + 0.6))] }).targetId).not.toBeNull();
  });
  it('(c) 上段（大げさ斬り）: 3.2 + 0.3 より 遠い → えらばない', () => {
    expect(decide({ tech: 'kesa', yokai: [yokaiAt('karakasa', at(0, 3.5 + 0.6 + 0.05))] }).targetId).toBeNull();
    expect(decide({ tech: 'kesa', yokai: [yokaiAt('karakasa', at(0, 3.2 - 0.3 + 0.6))] }).targetId).not.toBeNull();
  });
  it('(c) パンチ（すで）: 広げた箱（半径 + 0.3）が punchReach + 0.3 より 遠い → えらばない', () => {
    // 広げた箱 = 0.6 + 0.3
    expect(decide({ hold: 'punch', punchReach: 3.5, yokai: [yokaiAt('karakasa', at(0, 3.5 + 0.3 + 0.9 + 0.05))] }).targetId).toBeNull();
    expect(decide({ hold: 'punch', punchReach: 3.5, yokai: [yokaiAt('karakasa', at(0, 3.5 - 0.3 + 0.9))] }).targetId).not.toBeNull();
  });
  it('(d) パンチ: 箱の下が P.y + yMax + 0.3 より 上 → えらばない', () => {
    // 3.0 + 0.3 = 3.3 より 上
    const high = yokaiAt('chochin', at(0, 2.0, P.y + 3.4));
    expect(decide({ hold: 'punch', yokai: [high] }).targetId).toBeNull();
    const low = yokaiAt('chochin', at(0, 2.0, P.y + 2.7));
    expect(decide({ hold: 'punch', yokai: [low] }).targetId).toBe(low.id);
  });
  it('かまえで 届く所が ちがう: 近い所まで 3.8 は 中段で えらび、上段で えらばない。2.5 に 寄せると 上段でも えらぶ', () => {
    const y38 = yokaiAt('karakasa', at(0, 3.8 + 0.6));
    expect(decide({ tech: 'thrust', yokai: [y38] }).targetId).toBe(y38.id);
    expect(decide({ tech: 'kesa', yokai: [y38] }).targetId).toBeNull();
    expect(decide({ tech: 'kiriage', yokai: [y38] }).targetId).toBeNull();
    const y25 = yokaiAt('karakasa', at(0, 2.5 + 0.6));
    expect(decide({ tech: 'kesa', yokai: [y25] }).targetId).toBe(y25.id);
  });
});

describe('AC5 使いみちの 順（§4.4）', () => {
  it('(1) 横の 妖怪が 先: yaw 0・facing 90・キーなし、東から 20° の 向き・2.0 に からかさ、＋マークの先は 石 → attack・rule 1', () => {
    const y = yokaiAt('karakasa', at(70, 2.0));
    const d = decide({ yawDeg: 0, facingDeg: 90, yokai: [y], aim: { yokaiId: null, block: 'block' } });
    expect(d.use).toBe('attack');
    expect(d.rule).toBe(1);
    expect(d.targetId).toBe(y.id);
    expect(angDiff(d.dirDeg!, bearing(centerOf(y)))).toBeLessThan(0.01);
  });
  it('(2) キーなし・facing 180・＋マークの 線の上（北 2.0）の からかさ → attack・rule 2・u = 中心の 向き', () => {
    const y = yokaiAt('karakasa', at(0, 2.0));
    const d = decide({ facingDeg: 180, yokai: [y], aim: { yokaiId: y.id, block: null } });
    expect(d.use).toBe('attack');
    expect(d.rule).toBe(2);
    expect(d.targetId).toBe(y.id);
    expect(angDiff(d.dirDeg!, 0)).toBeLessThan(0.01);
  });
  it('(2) は キーを 押していると 使わない: D を 押す（k = 90、東に 妖怪なし）→ ブロックなし whiff・rule 4・u = 90、ブロックあり dig・rule 3', () => {
    const y = yokaiAt('karakasa', at(0, 2.0));
    const w = decide({ facingDeg: 180, keys: keys('right'), yokai: [y], aim: { yokaiId: y.id, block: null } });
    expect(w.use).toBe('whiff');
    expect(w.rule).toBe(4);
    expect(w.dirDeg).toBeCloseTo(90, 3);
    expect(w.targetId).toBeNull();
    const g = decide({ facingDeg: 180, keys: keys('right'), yokai: [y], aim: { yokaiId: y.id, block: 'block' } });
    expect(g.use).toBe('dig');
    expect(g.rule).toBe(3);
  });
  it('#34: ＋マークの 線で ブロックより 手前に とどかない妖怪 → ほらずに whiff・rule 4（M3 AC18）', () => {
    const y = yokaiAt('karakasa', at(0, 4.6));
    const d = decide({ hold: 'punch', yokai: [y], aim: { yokaiId: null, block: 'block', yokaiBeforeBlock: true } });
    expect(d.use).toBe('whiff');
    expect(d.rule).toBe(4);
    expect(decide({ aim: { yokaiId: null, block: 'crop', yokaiBeforeBlock: true } }).use).toBe('whiff');
    expect(decide({ hold: 'punch', yokai: [y], aim: { yokaiId: null, block: 'block', yokaiBeforeBlock: false } }).use).toBe('dig');
  });
  it('(3) 妖怪なし・＋マークに 作物 → harvest。ブロック → dig', () => {
    const h = decide({ aim: { yokaiId: null, block: 'crop' } });
    expect(h.use).toBe('harvest');
    expect(h.rule).toBe(3);
    expect(decide({ aim: { yokaiId: null, block: 'block' } }).use).toBe('dig');
  });
  it('(4) どれでもない → whiff（刀もパンチも）・u = a₀', () => {
    for (const hold of ['blade', 'punch'] as const) {
      const d = decide({ hold, facingDeg: 215, aim: { yokaiId: null, block: null } });
      expect(d.use).toBe('whiff');
      expect(d.rule).toBe(4);
      expect(d.dirDeg).toBeCloseTo(215, 5);
    }
  });
  it('弓・何も 持てない → none（rule null・向きなし）', () => {
    for (const hold of ['bow', 'none'] as const) {
      const d = decide({ hold, facingDeg: 90, yokai: [yokaiAt('karakasa', at(90, 2))] });
      expect(d.use).toBe('none');
      expect(d.rule).toBeNull();
      expect(d.dirDeg).toBeNull();
      expect(d.targetId).toBeNull();
    }
  });
  it('キーで 右・妖怪は 前（＋マークの 上）→ 右 30° に いなければ 空ぶり（§5）', () => {
    const y = yokaiAt('karakasa', at(0, 2.0));
    const d = decide({ facingDeg: 0, keys: keys('right'), yokai: [y], aim: { yokaiId: y.id, block: null } });
    expect(d.use).toBe('whiff');
    expect(d.dirDeg).toBeCloseTo(90, 3);
  });
  it('うしろに 妖怪・キーなし・向きは 前 → 30° の 外。＋マークで ねらっていれば rule 2、なければ ほる／空ぶり', () => {
    const y = yokaiAt('karakasa', at(180, 2.0));
    expect(decide({ facingDeg: 0, yokai: [y], aim: { yokaiId: null, block: 'block' } }).use).toBe('dig');
    expect(decide({ facingDeg: 0, yokai: [y], aim: { yokaiId: null, block: null } }).use).toBe('whiff');
    const d2 = decide({ facingDeg: 0, yokai: [y], aim: { yokaiId: y.id, block: null } });
    expect(d2.rule).toBe(2);
    expect(angDiff(d2.dirDeg!, 180)).toBeLessThan(0.01);
  });
});
