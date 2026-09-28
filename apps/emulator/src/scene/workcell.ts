/**
 * Mesa de trabajo: zonas A y B marcadas y una pieza (cubo) que la pinza puede tomar.
 *
 * Agarre por proximidad (sin motor de físicas): si la pinza se cierra hasta el ancho
 * de la pieza con la pieza entre los dedos, la pieza se engancha al punto de agarre
 * (nodo `Tool`) y se mueve con él; al abrir, se suelta y cae hasta la mesa.
 */
import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type Mesh,
  type Scene,
  type ShadowGenerator,
  type TransformNode,
} from '@babylonjs/core';

/** Lado del cubo, en metros. */
export const PIECE_SIZE = 0.04;
/** Centro de las zonas sobre la mesa (coordenadas de la escena). */
export const ZONE_A = new Vector3(0.28, 0, 0.28);
export const ZONE_B = new Vector3(-0.28, 0, 0.28);

/** Distancia máxima entre el punto de agarre y el centro de la pieza para tomarla. */
const GRASP_DISTANCE = 0.015;
/** Holgura de apertura para tomar y soltar (mm). */
const GRASP_MARGIN_MM = 2;
const GRAVITY = 9.81;

export interface Workcell {
  /** Actualiza el agarre y la caída. Devuelve la apertura visible de la pinza (mm). */
  update(tool: TransformNode, openingMm: number, dt: number): number;
  /** Devuelve la pieza a la zona A. */
  resetPiece(): void;
  readonly holding: boolean;
}

function zone(scene: Scene, name: string, center: Vector3, color: Color3): void {
  const size = 0.12;
  const texture = new DynamicTexture(`zona-${name}`, { width: 256, height: 256 }, scene);
  const ctx = texture.getContext();
  ctx.fillStyle = color.toHexString();
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#1b1d22';
  ctx.fillRect(12, 12, 232, 232);
  texture.drawText(name, null, 190, 'bold 170px system-ui, sans-serif', color.toHexString(), null);
  const material = new StandardMaterial(`zona-${name}`, scene);
  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  const plane = MeshBuilder.CreateGround(`zona-${name}`, { width: size, height: size }, scene);
  plane.position = center.add(new Vector3(0, 0.0005, 0));
  plane.rotation.y = Math.PI; // la letra se lee de frente al robot, desde la cámara inicial
  plane.material = material;
  plane.receiveShadows = true;
}

export function createWorkcell(scene: Scene, shadows: ShadowGenerator): Workcell {
  zone(scene, 'A', ZONE_A, Color3.FromHexString('#4fa3ff'));
  zone(scene, 'B', ZONE_B, Color3.FromHexString('#5cd67a'));

  const piece: Mesh = MeshBuilder.CreateBox('pieza', { size: PIECE_SIZE }, scene);
  const material = new StandardMaterial('pieza', scene);
  material.diffuseColor = Color3.FromHexString('#f2c230');
  material.specularColor = new Color3(0.15, 0.15, 0.15);
  piece.material = material;
  piece.receiveShadows = true;
  shadows.addShadowCaster(piece);

  let holding = false;
  let fallSpeed = 0;
  const widthMm = PIECE_SIZE * 1000;

  const resetPiece = (): void => {
    piece.setParent(null);
    holding = false;
    fallSpeed = 0;
    piece.rotationQuaternion = null;
    piece.rotation.setAll(0);
    piece.position = ZONE_A.add(new Vector3(0, PIECE_SIZE / 2, 0));
  };
  resetPiece();

  return {
    get holding() {
      return holding;
    },
    resetPiece,
    update(tool, openingMm, dt) {
      if (holding && openingMm > widthMm + GRASP_MARGIN_MM) {
        piece.setParent(null); // conserva la pose en el mundo
        holding = false;
      } else if (!holding && openingMm <= widthMm + GRASP_MARGIN_MM) {
        const distance = Vector3.Distance(tool.getAbsolutePosition(), piece.getAbsolutePosition());
        if (distance <= GRASP_DISTANCE) {
          piece.setParent(tool);
          holding = true;
          fallSpeed = 0;
        }
      }

      // Caída libre hasta apoyarse en la mesa (se endereza al apoyarse).
      const rest = PIECE_SIZE / 2;
      if (!holding && piece.position.y > rest) {
        fallSpeed += GRAVITY * dt;
        piece.position.y = Math.max(rest, piece.position.y - fallSpeed * dt);
        if (piece.position.y === rest) {
          fallSpeed = 0;
          const yaw = piece.rotationQuaternion?.toEulerAngles().y ?? piece.rotation.y;
          piece.rotationQuaternion = null;
          piece.rotation.set(0, yaw, 0);
        }
      }

      // Con la pieza tomada, los dedos se quedan en su superficie.
      return holding ? Math.max(openingMm, widthMm) : openingMm;
    },
  };
}
