/**
 * Escena base del emulador: carga el modelo del robot (GLB generado por tools/model)
 * y expone sus articulaciones.
 *
 * El GLB viene en la pose cero, en metros, con cada nodo en su pivote y su eje de giro
 * en `extras.axis`. Por eso aplicar un ángulo es solo girar el nodo alrededor de ese eje.
 */
import '@babylonjs/loaders/glTF';
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  LoadAssetContainerAsync,
  MeshBuilder,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type Engine,
  type TransformNode,
} from '@babylonjs/core';

export interface RobotRig {
  /** Aplica un ángulo (grados) a la articulación de índice `index` (0 = A1). */
  setJointAngle(index: number, degrees: number): void;
  /** Abre la pinza `millimeters` (0 = cerrada). */
  setGripperOpening(millimeters: number): void;
  /** Apertura máxima de la pinza del modelo, en mm. */
  readonly maxGripperOpening: number;
}

interface GripperExtras {
  readonly fingerMaxAngle: number;
  readonly maxOpeningMm: number;
}

const JOINT_NODES = ['A1', 'A2', 'A3', 'A4', 'A5'] as const;
const MODEL_URL = 'models/robot.glb';

function extrasOf(node: TransformNode): Record<string, unknown> {
  const metadata = node.metadata as { gltf?: { extras?: Record<string, unknown> } } | null;
  return metadata?.gltf?.extras ?? {};
}

/** Nodo articulado: gira alrededor de su eje (en el sistema del nodo padre). */
function articulate(node: TransformNode): (degrees: number) => void {
  const axis = extrasOf(node)['axis'];
  if (!Array.isArray(axis) || axis.length !== 3) {
    throw new Error(`El nodo ${node.name} del modelo no tiene extras.axis.`);
  }
  const direction = new Vector3(Number(axis[0]), Number(axis[1]), Number(axis[2]));
  const rest = node.rotationQuaternion?.clone() ?? Quaternion.Identity();
  return (degrees) => {
    node.rotationQuaternion = rest.multiply(
      Quaternion.RotationAxis(direction, (degrees * Math.PI) / 180),
    );
  };
}

export async function createScene(engine: Engine): Promise<{ scene: Scene; rig: RobotRig }> {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#1b1d22ff');

  // Cámara orbital con vertical fija: más natural en pantallas táctiles que el trackball de la App 1.
  const camera = new ArcRotateCamera(
    'camara',
    -Math.PI / 4,
    Math.PI / 2.8,
    1.6,
    new Vector3(0, 0.3, 0.15),
    scene,
  );
  camera.minZ = 0.01;
  camera.lowerRadiusLimit = 0.4;
  camera.upperRadiusLimit = 5;
  camera.upperBetaLimit = Math.PI / 2 - 0.02;
  camera.wheelDeltaPercentage = 0.02;
  camera.pinchDeltaPercentage = 0.01;
  camera.attachControl();

  // Intensidades provisionales: calibrar en C3 contra las capturas de la App 1 (docs/capturas/a4-*).
  const ambient = new HemisphericLight('ambiente', new Vector3(0.2, 1, 0.3), scene);
  ambient.intensity = 0.7;
  ambient.groundColor = new Color3(0.25, 0.25, 0.28);
  const sun = new DirectionalLight('sol', new Vector3(-0.5, -1, 0.6), scene);
  sun.position = new Vector3(1, 2, -1.2);
  sun.intensity = 1.6;
  sun.autoCalcShadowZBounds = true;

  const ground = MeshBuilder.CreateGround('mesa', { width: 2, height: 2 }, scene);
  const groundMaterial = new StandardMaterial('mesa', scene);
  groundMaterial.diffuseColor = new Color3(0.22, 0.23, 0.26);
  groundMaterial.specularColor = Color3.Black();
  ground.material = groundMaterial;
  ground.receiveShadows = true;

  const container = await LoadAssetContainerAsync(MODEL_URL, scene);
  container.addAllToScene();

  const nodes = new Map<string, TransformNode>();
  for (const node of [...container.transformNodes, ...container.meshes]) nodes.set(node.name, node);
  const find = (name: string): TransformNode => {
    const node = nodes.get(name);
    if (!node) throw new Error(`El modelo no tiene el nodo ${name}.`);
    return node;
  };

  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.002;
  for (const mesh of container.meshes as AbstractMesh[]) {
    if (mesh.getTotalVertices() > 0) shadows.addShadowCaster(mesh);
  }

  const joints = JOINT_NODES.map((name) => articulate(find(name)));
  const fingerL = articulate(find('FingerL'));
  const fingerR = articulate(find('FingerR'));
  const gripper = extrasOf(find('Base'))['gripper'] as GripperExtras | undefined;
  if (!gripper) throw new Error('El modelo no trae los datos de la pinza (extras.gripper).');

  const rig: RobotRig = {
    maxGripperOpening: gripper.maxOpeningMm,
    setJointAngle(index, degrees) {
      joints[index]?.(degrees);
    },
    setGripperOpening(millimeters) {
      const fraction = Math.min(Math.max(millimeters / gripper.maxOpeningMm, 0), 1);
      fingerL(fraction * gripper.fingerMaxAngle);
      fingerR(fraction * gripper.fingerMaxAngle);
    },
  };

  return { scene, rig };
}
