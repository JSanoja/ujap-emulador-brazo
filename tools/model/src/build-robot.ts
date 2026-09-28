/**
 * Convierte el OBJ del iRobot en el GLB del emulador (workunit C2).
 *
 * Uso: npm run build:robot -w @emulador/model-tools [-- <ruta del OBJ>]
 *
 * Pasos:
 * 1. Lee el OBJ (Cinema 4D, 2 M de triángulos, en unidades del modelo = cm, Y hacia arriba).
 * 2. Reduce polígonos por pieza con meshoptimizer.
 * 3. Lleva el brazo a la pose cero (convención de la App 1): brazo vertical, antebrazo
 *    horizontal hacia adelante y pinza alineada con el antebrazo.
 * 4. Alinea el robot: base en el origen, adelante = +Z, arriba = +Y, en metros.
 * 5. Arma la jerarquía A1 › A2 › A3 › A4 › A5 › FingerL/FingerR con cada nodo en su pivote
 *    y sin rotación. La escena solo tiene que girar cada nodo alrededor de `extras.axis`
 *    el ángulo que entrega el núcleo.
 * 6. Calcula normales con ángulo de quiebre y escribe el GLB (sin compresión: Draco y
 *    Meshopt necesitan decodificadores que Babylon descarga de un CDN, y el APK debe
 *    funcionar sin conexión).
 *
 * Los pivotes y ejes se midieron sobre el OBJ ajustando círculos a los pasadores y
 * discos de cada articulación (ver docs/06-SELECCION-MODELO-3D.md).
 */
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO, type Material, type Node } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import {
  IDENTITY,
  compact,
  compose,
  creaseNormals,
  cross,
  dot,
  normalize,
  rotationAbout,
  signedAngle,
  sub,
  transformDirection,
  transformPoint,
  transformPositions,
  type Affine,
  type IndexedMesh,
  type Vec3,
} from './geometry.ts';
import { parseObj } from './obj.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = process.argv[2] ?? resolve(REPO, '../modelos 3d/o1j4e9phg8w0-iRobot/OBJ_Robot.obj');
const OUTPUT = resolve(REPO, 'apps/emulator/public/models/robot.glb');

/** Unidades del OBJ → metros (se asume 1 unidad = 1 cm: el robot mide 0,50 m). ⚠ Provisional hasta D0. */
const UNIT_TO_METERS = 0.01;

// ---- Datos medidos en el OBJ (unidades del modelo) ----
const UP: Vec3 = [0, 1, 0];
/** Eje común de hombro, codo y muñeca (normal al plano del brazo). */
const HINGE: Vec3 = normalize([0.829, 0, 0.559]);
/** Adelante: dirección horizontal del brazo en el plano del brazo. */
const FORWARD: Vec3 = normalize(cross(HINGE, UP));
/** Eje de giro de los dedos (pasadores de radio 0,5). */
const FINGER_AXIS: Vec3 = normalize([-0.557, 0.095, 0.825]);
/** Eje longitudinal de la pinza, de la muñeca hacia los dedos. Pasa por el centro de la muñeca. */
const TOOL_AXIS: Vec3 = normalize(cross(HINGE, FINGER_AXIS));

type NodeName = 'Base' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'FingerL' | 'FingerR';

interface RigNode {
  readonly name: NodeName;
  readonly parent: NodeName | null;
  /** Grupos del OBJ que forman la pieza. */
  readonly groups: readonly string[];
  /** Punto del eje de giro (unidades y pose del OBJ). */
  readonly pivot: Vec3;
  /** Eje de giro; sentido positivo = mano derecha. */
  readonly axis: Vec3;
  /** Triángulos objetivo al reducir. */
  readonly triangles: number;
  readonly color: string;
}

const ORANGE = '#ff5d00';
const RIG: readonly RigNode[] = [
  {
    name: 'Base',
    parent: null,
    groups: ['Robot'],
    pivot: [16.31, 0.07, 18.357],
    axis: UP,
    triangles: 24000,
    color: '#3a3d42',
  },
  // A1: disco de la base (r = 5,80), eje vertical.
  {
    name: 'A1',
    parent: 'Base',
    groups: ['Head__Axis_1_'],
    pivot: [16.31, 14.724, 18.357],
    axis: UP,
    triangles: 6000,
    color: ORANGE,
  },
  // A2: pasador del hombro (r = 2,00).
  {
    name: 'A2',
    parent: 'A1',
    groups: ['Arm_1__Axis_2_'],
    pivot: [16.143, 25.722, 18.608],
    axis: HINGE,
    triangles: 12000,
    color: ORANGE,
  },
  // A3: pasador del codo (r = 2,00). El giro del antebrazo del iRobot (Axis 4) queda fijo:
  // el LabVolt 5250 no lo tiene, así que Arm_2 y Arm_3 forman una sola pieza.
  {
    name: 'A3',
    parent: 'A2',
    groups: ['Arm_2__Axis_3_', 'Arm_3__Axis_4_'],
    pivot: [23.734, 43.371, 7.315],
    axis: HINGE,
    triangles: 16000,
    color: ORANGE,
  },
  // A4: cabeceo de la muñeca (Axis 5 del iRobot), discos de la horquilla.
  {
    name: 'A4',
    parent: 'A3',
    groups: ['Joint__Axis_5_'],
    pivot: [3.135, 25.611, 37.643],
    axis: HINGE,
    triangles: 6000,
    color: '#5b6068',
  },
  // A5: giro de la herramienta, sobre el eje longitudinal de la pinza (pasa por la muñeca).
  {
    name: 'A5',
    parent: 'A4',
    groups: ['Grasper_base'],
    pivot: [3.135, 25.611, 37.643],
    axis: TOOL_AXIS,
    triangles: 3000,
    color: '#2e3136',
  },
  // Dedos: en el OBJ están cerrados. Ángulo positivo = abrir.
  {
    name: 'FingerL',
    parent: 'A5',
    groups: ['grasper_L'],
    pivot: [3.962, 17.649, 39.118],
    axis: FINGER_AXIS,
    triangles: 3000,
    color: '#1f2226',
  },
  {
    name: 'FingerR',
    parent: 'A5',
    groups: ['grasper_R'],
    pivot: [1.481, 17.653, 37.449],
    axis: [-FINGER_AXIS[0], -FINGER_AXIS[1], -FINGER_AXIS[2]],
    triangles: 3000,
    color: '#1f2226',
  },
];

/** Ángulo de los dedos con la pinza totalmente abierta (grados). */
const FINGER_MAX_ANGLE = 30;
const CREASE_DEGREES = 35;

function subtree(name: NodeName): NodeName[] {
  const children = RIG.filter((n) => n.parent === name).flatMap((n) => subtree(n.name));
  return [name, ...children];
}

function byName(name: NodeName): RigNode {
  const node = RIG.find((n) => n.name === name);
  if (!node) throw new Error(`Nodo desconocido: ${name}`);
  return node;
}

async function main(): Promise<void> {
  console.log(`Leyendo ${SOURCE} (${(statSync(SOURCE).size / 1e6).toFixed(1)} MB)…`);
  const obj = parseObj(readFileSync(SOURCE, 'utf8'));
  await MeshoptSimplifier.ready;

  // ---- 1. Reducción de polígonos por pieza ----
  const meshes = new Map<NodeName, IndexedMesh>();
  let sourceTriangles = 0;
  for (const node of RIG) {
    const parts = node.groups.map((name) => {
      const group = obj.groups.find((g) => g.name === name);
      if (!group) throw new Error(`El OBJ no tiene el grupo ${name}.`);
      return group.indices;
    });
    const joined = new Uint32Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      joined.set(p, offset);
      offset += p.length;
    }
    sourceTriangles += joined.length / 3;
    // Suelda vértices repetidos en la misma posición (el CAD duplica en las aristas).
    const local = compact(obj.positions, joined);
    const remap = MeshoptSimplifier.generatePositionRemap(local.positions, 3);
    const welded = compact(
      local.positions,
      local.indices.map((i) => remap[i] as number),
    );
    const [simplified] = MeshoptSimplifier.simplify(
      welded.indices,
      welded.positions,
      3,
      node.triangles * 3,
      0.01,
      ['Prune'],
    );
    meshes.set(node.name, compact(welded.positions, simplified));
  }

  // ---- 2. Pose cero ----
  // world[n]: transformación acumulada de la pieza n desde la pose del OBJ.
  const world = new Map<NodeName, Affine>(RIG.map((n) => [n.name, IDENTITY]));
  const pivotOf = (name: NodeName): Vec3 =>
    transformPoint(world.get(name) ?? IDENTITY, byName(name).pivot);
  const directionOf = (name: NodeName, d: Vec3): Vec3 =>
    normalize(transformDirection(world.get(name) ?? IDENTITY, d));
  const rotateSubtree = (name: NodeName, degrees: number): void => {
    const r = rotationAbout(pivotOf(name), directionOf(name, byName(name).axis), degrees);
    for (const n of subtree(name)) world.set(n, compose(r, world.get(n) ?? IDENTITY));
  };
  // Ángulo de cada eje en la pose del OBJ, con la convención: positivo = hacia adelante/abajo.
  const poseAngles = {
    A2: signedAngle(UP, sub(pivotOf('A3'), pivotOf('A2')), HINGE),
    A3: 0,
    A4: 0,
  };
  rotateSubtree('A2', -poseAngles.A2);
  poseAngles.A3 = signedAngle(FORWARD, sub(pivotOf('A4'), pivotOf('A3')), HINGE);
  rotateSubtree('A3', -poseAngles.A3);
  poseAngles.A4 = signedAngle(FORWARD, directionOf('A5', TOOL_AXIS), HINGE);
  rotateSubtree('A4', -poseAngles.A4);

  // ---- 3. Alineación global: base en el origen, adelante = +Z, en metros ----
  const base = byName('Base').pivot;
  const right = cross(UP, FORWARD); // = HINGE → +X
  const align: Affine = [
    [
      right[0] * UNIT_TO_METERS,
      right[1] * UNIT_TO_METERS,
      right[2] * UNIT_TO_METERS,
      -dot(right, base) * UNIT_TO_METERS,
    ],
    [
      UP[0] * UNIT_TO_METERS,
      UP[1] * UNIT_TO_METERS,
      UP[2] * UNIT_TO_METERS,
      -dot(UP, base) * UNIT_TO_METERS,
    ],
    [
      FORWARD[0] * UNIT_TO_METERS,
      FORWARD[1] * UNIT_TO_METERS,
      FORWARD[2] * UNIT_TO_METERS,
      -dot(FORWARD, base) * UNIT_TO_METERS,
    ],
  ];
  for (const n of RIG) world.set(n.name, compose(align, world.get(n.name) ?? IDENTITY));
  const finalPivot = (name: NodeName): Vec3 => (name === 'Base' ? [0, 0, 0] : pivotOf(name));
  const finalAxis = (name: NodeName): Vec3 => directionOf(name, byName(name).axis);

  // ---- 4. Apertura de la pinza medida en el modelo ----
  const finger = (name: NodeName, degrees: number): Float32Array => {
    const mesh = meshes.get(name);
    if (!mesh) throw new Error(name);
    const p = new Float32Array(mesh.positions);
    transformPositions(
      compose(rotationAbout(pivotOf(name), finalAxis(name), degrees), world.get(name) ?? IDENTITY),
      p,
    );
    return p;
  };
  // Apertura = cuánto se separan las puntas (último centímetro de cada dedo) respecto de la
  // pinza cerrada, medido entre los centroides de las puntas. Cerrada (0°) = 0 mm.
  const tipCentroid = (p: Float32Array): Vec3 => {
    const tool = finalAxis('A5');
    let reach = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      reach = Math.max(reach, dot([p[i] as number, p[i + 1] as number, p[i + 2] as number], tool));
    }
    let sum: Vec3 = [0, 0, 0];
    let count = 0;
    for (let i = 0; i < p.length; i += 3) {
      const q: Vec3 = [p[i] as number, p[i + 1] as number, p[i + 2] as number];
      if (dot(q, tool) > reach - 0.01) {
        sum = [sum[0] + q[0], sum[1] + q[1], sum[2] + q[2]];
        count++;
      }
    }
    return [sum[0] / count, sum[1] / count, sum[2] / count];
  };
  const tipDistance = (degrees: number): number => {
    const d = sub(tipCentroid(finger('FingerL', degrees)), tipCentroid(finger('FingerR', degrees)));
    return Math.hypot(d[0], d[1], d[2]);
  };
  const maxOpening = tipDistance(FINGER_MAX_ANGLE) - tipDistance(0);

  // ---- 5. GLB ----
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'ujap-emulador-brazo tools/model (gltf-transform)';
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Robot');
  const materials = new Map<string, Material>();
  const material = (hex: string): Material => {
    let m = materials.get(hex);
    if (!m) {
      const srgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
      const linear = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      m = doc
        .createMaterial(hex)
        .setBaseColorFactor([linear[0] as number, linear[1] as number, linear[2] as number, 1])
        .setMetallicFactor(0.1)
        .setRoughnessFactor(0.55);
      materials.set(hex, m);
    }
    return m;
  };

  const nodes = new Map<NodeName, Node>();
  let triangles = 0;
  for (const rig of RIG) {
    const mesh = meshes.get(rig.name);
    if (!mesh) throw new Error(rig.name);
    const positions = new Float32Array(mesh.positions);
    transformPositions(world.get(rig.name) ?? IDENTITY, positions);
    const pivot = finalPivot(rig.name);
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (positions[i] as number) - pivot[0];
      positions[i + 1] = (positions[i + 1] as number) - pivot[1];
      positions[i + 2] = (positions[i + 2] as number) - pivot[2];
    }
    const shaded = creaseNormals({ positions, indices: mesh.indices }, CREASE_DEGREES);
    triangles += shaded.indices.length / 3;
    const indices =
      shaded.positions.length / 3 < 65536 ? new Uint16Array(shaded.indices) : shaded.indices;
    const primitive = doc
      .createPrimitive()
      .setAttribute(
        'POSITION',
        doc.createAccessor().setType('VEC3').setArray(shaded.positions).setBuffer(buffer),
      )
      .setAttribute(
        'NORMAL',
        doc.createAccessor().setType('VEC3').setArray(shaded.normals).setBuffer(buffer),
      )
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
      .setMaterial(material(rig.color));
    const node = doc.createNode(rig.name).setMesh(doc.createMesh(rig.name).addPrimitive(primitive));
    const parentPivot = rig.parent ? finalPivot(rig.parent) : ([0, 0, 0] as Vec3);
    node.setTranslation(sub(pivot, parentPivot) as [number, number, number]);
    if (rig.name !== 'Base') node.setExtras({ axis: finalAxis(rig.name).map((x) => round(x, 6)) });
    const parent = rig.parent ? nodes.get(rig.parent) : undefined;
    if (parent) parent.addChild(node);
    else scene.addChild(node);
    nodes.set(rig.name, node);
  }
  const gripper = {
    fingerMaxAngle: FINGER_MAX_ANGLE,
    maxOpeningMm: round(maxOpening * 1000, 1),
  };
  nodes.get('Base')?.setExtras({
    source: 'iRobot (OBJ de Cinema 4D), ver modelos/README.md',
    units: 'm',
    zeroPose: 'A2 vertical, antebrazo horizontal hacia +Z, pinza alineada con el antebrazo',
    sourcePoseDegrees: Object.fromEntries(
      Object.entries(poseAngles).map(([k, v]) => [k, round(v, 2)]),
    ),
    gripper,
  });

  mkdirSync(dirname(OUTPUT), { recursive: true });
  await new NodeIO().write(OUTPUT, doc);

  console.log(`Triángulos: ${sourceTriangles} → ${triangles}`);
  console.log('Pose del OBJ (°):', poseAngles);
  for (const n of RIG)
    console.log(
      `  ${n.name.padEnd(8)} pivote ${fmt(finalPivot(n.name))}  eje ${fmt(finalAxis(n.name))}`,
    );
  console.log('Pinza:', gripper);
  console.log(`GLB: ${OUTPUT} (${(statSync(OUTPUT).size / 1e6).toFixed(2)} MB)`);
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function fmt(v: Vec3): string {
  return `(${v.map((x) => x.toFixed(4)).join(', ')})`;
}

await main();
