import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 AC175 の 下「5f-2 で 直す」＝ 5f-1 の レビューの 軽微 1）の 配線の 見はり。実装の前に書いた赤のテスト。
 * パッドの 面の 名前（`facesForAction`）は 今 「画面の 大きさが かわった・参加した」ときだけ 読みなおす。せっていで ボタンを 付けかえて 閉じた あと、
 * ヒントの 絵が 古い 面の まま 残らない ように、**せっていを 閉じた ときにも 読みなおす**。
 *
 * 見つけた 事（コードを 読んだ 結果）: せっていは スタートメニュー（playOverlay）の 中で 開く。開いて いる あいだ 世界は 止まり（lock.pauseMenu →
 * realtimeAllowed() = false）、`game.onUpdate`（毎ステップ）は 1 回も 走らない。だから「毎ステップ 開いて いるかを 見て 閉じた ふちを 拾う」やり方は 動かない。
 * 動くのは「せってい画面が 閉じた ときの 通知を 受ける」やり方（`setOpen(false)` は 閉じる ボタン・scrim・Esc〔bindPause.ts の settings.close()〕の どれでも 通る 1 本の 口）。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `ui/settings/settingsPanel.ts`  createSettingsPanel の opts に `onClosed?: () => void`。`setOpen(false)` で **開いて いた → 閉じた** ときに 1 回 呼ぶ
 *       （もう 閉じている ときの close() では 呼ばない）。1 人の ときの 動き・見た目は かえない（呼ぶ 先が 何も しなければ 今と 同じ）
 *   `game/wire/shared.ts`  `settingsClosed: () => void`（既定は 何もしない。p2ShowSignal と 同じ 形の 差しかえの 口）
 *   `game/wire/player.ts`  createSettingsPanel に `onClosed: () => shared.settingsClosed()` を 渡す
 *   `ui/duoAimHud.ts`  `refreshFaces()` を public に（1P・2P の 札の 面の 名前を 今の 割り当てから 書く。割り当てが かわって いなければ 何も 書きかえない〔今の 約束〕）
 *   `game/wire/duo.ts`  `shared.settingsClosed = () => aim.refreshFaces()`（参加して いなくても 安全〔2P の 部品が なければ 何もしない〕。やめた とき 元に もどす 必要は ない）
 */

const read = (p: string): string => readFileSync(p, 'utf8');

describe('AC175: せっていを 閉じた とき パッドの 面の 名前を 読みなおす（閉じる 通知で 受ける）', () => {
  it('settingsPanel: onClosed を うけとり、setOpen(false) の 中で 開いて いた ときだけ 呼ぶ', () => {
    const s = read('src/ui/settings/settingsPanel.ts');
    expect(s).toMatch(/onClosed\?:\s*\(\)\s*=>\s*void/);
    // setOpen の 閉じる 側（if (!on) { ... }）に onClosed の 呼び出しが あり、開いて いた かどうかを 見ている
    const m = /const setOpen = \(on: boolean\): void => \{([\s\S]*?)\n  \};/.exec(s);
    expect(m, 'setOpen が 見つからない').not.toBeNull();
    const body = m![1]!;
    expect(body).toMatch(/opts\.onClosed\?\.\(\)|opts\.onClosed\(\)/);
    expect(body).toMatch(/was|wasOpen|!root\.hidden/); // 開いて いた か を 見る
  });
  it('player.ts が 閉じた 通知を shared.settingsClosed に つなぐ', () => {
    expect(read('src/game/wire/player.ts')).toMatch(/onClosed:\s*\(\)\s*=>\s*shared\.settingsClosed\(\)/);
  });
  it('shared.ts に settingsClosed の 口（既定は 何も しない）', () => {
    expect(read('src/game/wire/shared.ts')).toMatch(/settingsClosed:\s*\(\)\s*=>\s*(void\s*)?(\{\s*\}|undefined)/);
  });
  it('duo.ts が settingsClosed で DuoAimHud の refreshFaces を 呼ぶ。refreshFaces は public', () => {
    expect(read('src/game/wire/duo.ts')).toMatch(/shared\.settingsClosed\s*=\s*\(\)\s*=>\s*aim\.refreshFaces\(\)/);
    const a = read('src/ui/duoAimHud.ts');
    expect(a).toMatch(/\n  refreshFaces\(\): void/);
    expect(a).not.toMatch(/private refreshFaces/);
  });
  it('毎ステップ 見る やり方（SettingsCloseEdge・settingsOpen）は 使わない（せっていが 開いて いる あいだ 毎ステップは 走らない）', () => {
    for (const f of ['src/ui/duoAimHud.ts', 'src/game/wire/duo.ts']) expect(read(f), f).not.toMatch(/SettingsCloseEdge|settingsOpen/);
  });
});
