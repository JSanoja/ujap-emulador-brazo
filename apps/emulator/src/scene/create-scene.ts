/**
 * Escena base del emulador.
 *
 * Robot provisional con primitivas (solo A1 y A2) para comprobar la cadena
 * núcleo → escena. En C2/C3 se reemplaza por el GLB del LabVolt 5250 con pivotes
 * fijados en Blender. Babylon.js usa Y hacia arriba; los OBJ de 2021 usan Z hacia arriba.
 */
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  type Engine,
} from '@babylonjs/core';

export interface RobotRig {
  /** Aplica un ángulo (grados) a la articulación de índice `index` (0 = A1). */
  setJointAngle(index: number, degrees: number): void;
}

const ORANGE = Color3.FromHexString('#ff5d00');
const DARK_GREY = Color3.FromHexString('#303030');

function material(scene: Scene, name: string, color: Color3): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.specularColor = new Color3(0.2, 0.2, 0.2);
  return mat;
}

export function createScene(engine: Engine): { scene: Scene; rig: RobotRig } {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#1b1d22ff');

  // Cámara orbital con vertical fija: más natural en pantallas táctiles que el trackball de la App 1.
  const camera = new ArcRotateCamera(
    'camara',
    -Math.PI / 3,
    Math.PI / 3,
    9,
    new Vector3(0, 1.5, 0),
    scene,
  );
  camera.lowerRadiusLimit = 3;
  camera.upperRadiusLimit = 25;
  camera.upperBetaLimit = Math.PI / 2 - 0.05;
  camera.wheelDeltaPercentage = 0.02;
  camera.pinchDeltaPercentage = 0.01;
  camera.attachControl();

  // Intensidades provisionales: calibrar en C3 contra las capturas de la App 1 (docs/capturas/a4-*).
  const ambient = new HemisphericLight('ambiente', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.6;
  const sun = new DirectionalLight('sol', new Vector3(-1, -2, -1), scene);
  sun.intensity = 0.8;

  const ground = MeshBuilder.CreateGround('mesa', { width: 10, height: 10 }, scene);
  ground.material = material(scene, 'mesa', new Color3(0.22, 0.23, 0.26));

  // Robot provisional: base fija, columna (A1, giro vertical) y brazo (A2, giro horizontal).
  const base = MeshBuilder.CreateCylinder('base', { diameter: 1.6, height: 0.4 }, scene);
  base.position.y = 0.2;
  base.material = material(scene, 'base', DARK_GREY);

  const a1 = new TransformNode('A1', scene);
  a1.position.y = 0.4;
  const column = MeshBuilder.CreateCylinder('columna', { diameter: 1.1, height: 1.2 }, scene);
  column.parent = a1;
  column.position.y = 0.6;
  column.material = material(scene, 'columna', ORANGE);

  const a2 = new TransformNode('A2', scene);
  a2.parent = a1;
  a2.position.y = 1.2;
  const link = MeshBuilder.CreateBox('brazo', { width: 0.35, height: 2.4, depth: 0.35 }, scene);
  link.parent = a2;
  link.position.y = 1.2;
  link.material = material(scene, 'brazo', ORANGE);

  const joints: ((radians: number) => void)[] = [
    (r) => (a1.rotation.y = r),
    (r) => (a2.rotation.z = r),
  ];

  const rig: RobotRig = {
    setJointAngle(index, degrees) {
      joints[index]?.((degrees * Math.PI) / 180);
    },
  };

  return { scene, rig };
}
