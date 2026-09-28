import { Engine } from '@babylonjs/core';
import { LABVOLT_5250 } from '@emulador/core';
import { Emulator } from './emulator';
import { createScene } from './scene/create-scene';
import { createWorkcell } from './scene/workcell';
import { LocalSettingsStore } from './settings-store';
import { mountAxisPanel } from './ui/axis-panel';
import { mountProgramPanel } from './ui/program-panel';
import { openSettingsDialog } from './ui/settings-dialog';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#render');
const axisContainer = document.querySelector<HTMLElement>('#ejes');
const programContainer = document.querySelector<HTMLElement>('#programa');
if (!canvas || !axisContainer || !programContainer) {
  throw new Error('Faltan #render, #ejes o #programa en index.html');
}

const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
const { scene, rig, shadows } = await createScene(engine);
const workcell = createWorkcell(scene, shadows);
const settingsStore = new LocalSettingsStore();
const emulator = new Emulator(LABVOLT_5250, await settingsStore.load());

const axes = mountAxisPanel(axisContainer, emulator);
mountProgramPanel(programContainer, emulator, {
  examples: [{ label: 'Pick and place (A → B)', url: 'examples/pick-and-place.txt' }],
  onResetPiece: () => workcell.resetPiece(),
  onOpenSettings: () => openSettingsDialog(emulator, settingsStore),
});

// Pestañas (solo visibles en pantallas angostas): qué panel se muestra. Con un panel abierto,
// el canvas ocupa solo la parte de arriba (ver styles.css), así que hay que redimensionarlo.
for (const tab of document.querySelectorAll<HTMLButtonElement>('#pestanas button')) {
  tab.addEventListener('click', () => {
    document.body.dataset['tab'] = tab.dataset['tab'];
    for (const other of document.querySelectorAll('#pestanas button')) {
      other.setAttribute('aria-pressed', String(other === tab));
    }
    engine.resize();
  });
}

/** Paso de tiempo máximo: evita saltos tras una pausa larga del navegador (pestaña oculta). */
const MAX_DT = 0.1;
let panelTimer = 0;

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, MAX_DT);
  emulator.runner.tick(dt);

  const pose = emulator.planner.pose;
  pose.joints.forEach((degrees, i) => rig.setJointAngle(i, degrees));
  // La pose del robot se aplica antes del agarre para que la pieza siga al punto de agarre.
  rig.tool.computeWorldMatrix(true);
  rig.setGripperOpening(workcell.update(rig.tool, pose.gripper, dt));

  scene.render();

  // Los deslizadores se actualizan unas 10 veces por segundo.
  panelTimer += dt;
  if (panelTimer >= 0.1) {
    panelTimer = 0;
    axes.refresh();
  }
});
window.addEventListener('resize', () => engine.resize());

// Acceso para las pruebas E2E y las capturas (Playwright): en desarrollo o con ?e2e en la URL.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('e2e')) {
  Object.assign(window, { BABYLON_SCENE: scene, EMULATOR: emulator, WORKCELL: workcell });
}
