import { Engine } from '@babylonjs/core';
import { LABVOLT_5250 } from '@emulador/core';
import { createScene } from './scene/create-scene';
import { mountAxisPanel } from './ui/axis-panel';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#render');
const panel = document.querySelector<HTMLElement>('#panel');
if (!canvas || !panel) {
  throw new Error('Falta el canvas #render o el panel #panel en index.html');
}

const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
const { scene, rig } = await createScene(engine);
mountAxisPanel(panel, LABVOLT_5250, rig);

// Solo en desarrollo: acceso a la escena para las capturas automáticas (Playwright).
if (import.meta.env.DEV) {
  (window as unknown as { BABYLON_SCENE: unknown }).BABYLON_SCENE = scene;
}

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
