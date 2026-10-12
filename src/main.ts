import { Game } from './game/Game';
import { buildPlaceholderScene } from './game/placeholderScene';
import { bindKeyboardAndMouse } from './input/actions';
import { PerfOverlay } from './debug/perfOverlay';
import { installTestHook } from './debug/testHook';
import { mountHud } from './ui/hud';

const container = document.getElementById('game')!;
const hud = document.getElementById('hud')!;

const game = new Game(container);
buildPlaceholderScene(game.scene, game.camera);
mountHud(hud);
bindKeyboardAndMouse(window, game.input);

const overlay = new PerfOverlay(hud, game);
game.onUpdate((dt) => overlay.update(dt));

installTestHook(game, overlay);
game.start();
