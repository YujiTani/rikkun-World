import { describe, expect, it } from 'vitest';
import { migrateBinds } from './binds';
import { DEFAULT_PLAY_BINDS } from './mapping';
import { assignFaceToAction, facesForAction } from './rebind';
import { keyLabelFor } from '../../ui/settings/controlRows';

describe('割り当て', () => {
  it('同じボタンは一つ。前の操作は外れて名前が返る', () => {
    const binds = { ...DEFAULT_PLAY_BINDS };
    const { next, displaced } = assignFaceToAction(binds, 'r2', 'jump');
    expect(displaced).toBe('primary');
    expect(next.r2).toBe('jump');
    expect(facesForAction(next, 'primary')).not.toContain('r2');
    expect(next.faceBottom).toBe('jump');
  });
  it('同じ割り当てなら変えない', () => {
    const binds = { ...DEFAULT_PLAY_BINDS };
    const { next, displaced } = assignFaceToAction(binds, 'faceBottom', 'jump');
    expect(displaced).toBeNull();
    expect(next.faceBottom).toBe('jump');
  });
  it('古い初期値の ＋ だけスタートメニューにする。他を変えていれば残す', () => {
    const old = { ...DEFAULT_PLAY_BINDS, start: 'toggleInventory' as const };
    expect(migrateBinds(old, { ...DEFAULT_PLAY_BINDS, ...old }).start).toBe('openStartMenu');
    const custom = { ...old, r2: 'jump' as const };
    expect(migrateBinds(custom, { ...DEFAULT_PLAY_BINDS, ...custom }).start).toBe('toggleInventory');
  });
  it('未保存は新しい初期値', () => {
    expect(DEFAULT_PLAY_BINDS.start).toBe('openStartMenu');
    expect(DEFAULT_PLAY_BINDS.faceLeft).toBe('toggleInventory');
  });
});

describe('キー表示', () => {
  it('実装の割り当てと一致する', () => {
    expect(keyLabelFor('jump')).toContain('Space');
    expect(keyLabelFor('closeMenu')).toContain('Esc');
    expect(keyLabelFor('toggleInventory')).toContain('E');
    expect(keyLabelFor('primary')).toContain('ひだりクリック');
    expect(keyLabelFor('secondary')).toContain('みぎクリック');
    expect(keyLabelFor('dropStack')).toContain('Shift＋Q');
    expect(keyLabelFor('toggleView')).toContain('V');
  });
});
