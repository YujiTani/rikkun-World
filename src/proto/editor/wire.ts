// HOUSE-1B 試作（?proto=editor のときだけ。開発サーバーだけ）: エディターを 開いた まま 始める。後ろの ゲームは 止まって いる。
// 本実装では src/house/ の 本物に 置きかえる（見本は 同じ やり方で ゲームの レンダラーに 切りぬいて 描く）。
import type { WiredLoop } from '../../game/wire/save';
import { EditorController } from './editor';
import { Preview3D } from './preview';
import { EditorUi } from './ui';

function protoEditorActive(search: string = location.search): boolean {
  return new URLSearchParams(search).get('proto') === 'editor';
}

export function wireProtoEditor(deps: WiredLoop): void {
  if (!import.meta.env.DEV || !protoEditorActive()) return;
  const { game, hud, shared, lock, pointerLock, book, fxSound } = deps;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ctl = new EditorController();
  const preview = new Preview3D(game.renderer, () => reduced.matches);
  let open = false;
  const setOpen = (on: boolean): void => {
    if (on === open) return;
    open = on;
    ui.show(on);
    document.body.classList.toggle('proto-editor-open', on);
    if (on) {
      lock.setInventoryOpen(true);
      game.input.releaseAll();
      if (lock.isSimulated()) lock.simulate(false);
      pointerLock.release();
    } else {
      if (lock.isSimulated()) {
        lock.simulate(true);
        lock.setInventoryOpen(false);
      } else {
        lock.beginRelock();
        lock.setInventoryOpen(false);
        pointerLock.request();
      }
      game.input.releaseAll();
    }
  };
  const ui = new EditorUi({ parent: hud, ctl, preview, canvas: game.renderer.domElement, sound: fxSound, open: () => setOpen(true), close: () => setOpen(false) });
  ui.show(false);
  const prevFrozen = shared.houseFrozen;
  shared.houseFrozen = () => prevFrozen() || open;
  game.setModal({
    active: () => open || book.active() || shared.houseFrozen(),
    tick: () => {
      if (open) {
        preview.tick();
        ui.tick();
      } else if (book.active()) book.tick();
    },
    render: () => {
      if (open) ui.render();
      else if (book.active()) book.render();
    },
  });
  // エディターの 中は Esc いがいの キーを ゲームの 操作に しない（Esc は エディターの 順で とじる）
  const swallow = (e: KeyboardEvent): void => {
    if (!open || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && !e.repeat) ui.key(e);
    e.preventDefault();
  };
  window.addEventListener('keydown', swallow, true);
  window.addEventListener('keyup', swallow, true);
  setOpen(true);
  (window as unknown as { __protoEditor: unknown }).__protoEditor = { ctl, preview, ui, open: () => setOpen(true), close: () => setOpen(false), isOpen: () => open, ready: true };
}
