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
const { scene, rig } = createScene(engine);
mountAxisPanel(panel, LABVOLT_5250, rig);

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
