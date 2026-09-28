/** Geometría básica para preparar mallas: vectores, transformaciones afines y normales. */

export type Vec3 = readonly [number, number, number];

/** Transformación afín 3×4 (fila i: [r0, r1, r2, t]). */
export type Affine = readonly [
  readonly [number, number, number, number],
  readonly [number, number, number, number],
  readonly [number, number, number, number],
];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

/** Ángulo con signo (grados) de `from` a `to` alrededor de `axis` (regla de la mano derecha). */
export function signedAngle(from: Vec3, to: Vec3, axis: Vec3): number {
  const n = normalize(axis);
  return (Math.atan2(dot(n, cross(from, to)), dot(from, to)) * 180) / Math.PI;
}

/** Giro de `degrees` alrededor de la recta que pasa por `point` con dirección `axis`. */
export function rotationAbout(point: Vec3, axis: Vec3, degrees: number): Affine {
  const [x, y, z] = normalize(axis);
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = 1 - c;
  const r = [
    [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
    [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
    [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
  ] as const;
  const row = (i: 0 | 1 | 2): [number, number, number, number] => [
    r[i][0],
    r[i][1],
    r[i][2],
    point[i] - (r[i][0] * point[0] + r[i][1] * point[1] + r[i][2] * point[2]),
  ];
  return [row(0), row(1), row(2)];
}

export const IDENTITY: Affine = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
];

/** Composición: primero `b`, luego `a`. */
export function compose(a: Affine, b: Affine): Affine {
  const row = (i: 0 | 1 | 2): [number, number, number, number] => [
    a[i][0] * b[0][0] + a[i][1] * b[1][0] + a[i][2] * b[2][0],
    a[i][0] * b[0][1] + a[i][1] * b[1][1] + a[i][2] * b[2][1],
    a[i][0] * b[0][2] + a[i][1] * b[1][2] + a[i][2] * b[2][2],
    a[i][0] * b[0][3] + a[i][1] * b[1][3] + a[i][2] * b[2][3] + a[i][3],
  ];
  return [row(0), row(1), row(2)];
}

/** Aplica la transformación a un punto. */
export function transformPoint(m: Affine, p: Vec3): Vec3 {
  return [
    m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + m[0][3],
    m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + m[1][3],
    m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + m[2][3],
  ];
}

/** Aplica solo la parte lineal (para direcciones). */
export function transformDirection(m: Affine, d: Vec3): Vec3 {
  return [
    m[0][0] * d[0] + m[0][1] * d[1] + m[0][2] * d[2],
    m[1][0] * d[0] + m[1][1] * d[1] + m[1][2] * d[2],
    m[2][0] * d[0] + m[2][1] * d[1] + m[2][2] * d[2],
  ];
}

/** Aplica la transformación a todas las posiciones (x, y, z consecutivos), en el mismo arreglo. */
export function transformPositions(m: Affine, positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 3) {
    const p = transformPoint(m, [
      positions[i] as number,
      positions[i + 1] as number,
      positions[i + 2] as number,
    ]);
    positions[i] = p[0];
    positions[i + 1] = p[1];
    positions[i + 2] = p[2];
  }
}

export interface IndexedMesh {
  readonly positions: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
}

/** Deja solo los vértices usados por `indices` y renumera. */
export function compact(positions: Float32Array, indices: Uint32Array): IndexedMesh {
  const remap = new Map<number, number>();
  const out: number[] = [];
  const newIndices = new Uint32Array(indices.length);
  indices.forEach((v, i) => {
    let n = remap.get(v);
    if (n === undefined) {
      n = remap.size;
      remap.set(v, n);
      out.push(
        positions[3 * v] as number,
        positions[3 * v + 1] as number,
        positions[3 * v + 2] as number,
      );
    }
    newIndices[i] = n;
  });
  return { positions: new Float32Array(out), indices: newIndices };
}

export interface ShadedMesh extends IndexedMesh {
  readonly normals: Float32Array<ArrayBuffer>;
}

/**
 * Normales suaves con ángulo de quiebre: en cada esquina se promedian (por área) las
 * normales de las caras vecinas que difieren menos de `creaseDegrees` de la cara propia.
 * Así las superficies curvas se ven suaves y las aristas de las piezas quedan marcadas.
 * Los vértices se duplican donde la normal cambia.
 */
export function creaseNormals(mesh: IndexedMesh, creaseDegrees: number): ShadedMesh {
  const { positions, indices } = mesh;
  const faceCount = indices.length / 3;
  const faceNormals = new Float32Array(faceCount * 3); // sin normalizar: módulo = 2 · área
  const unit = new Float32Array(faceCount * 3);
  const vertexFaces: number[][] = Array.from({ length: positions.length / 3 }, () => []);
  const p = (v: number): Vec3 => [
    positions[3 * v] as number,
    positions[3 * v + 1] as number,
    positions[3 * v + 2] as number,
  ];
  for (let f = 0; f < faceCount; f++) {
    const a = indices[3 * f] as number;
    const b = indices[3 * f + 1] as number;
    const c = indices[3 * f + 2] as number;
    const n = cross(sub(p(b), p(a)), sub(p(c), p(a)));
    const l = length(n) || 1;
    faceNormals.set(n, 3 * f);
    unit.set(scale(n, 1 / l), 3 * f);
    vertexFaces[a]?.push(f);
    vertexFaces[b]?.push(f);
    vertexFaces[c]?.push(f);
  }

  const cosLimit = Math.cos((creaseDegrees * Math.PI) / 180);
  const outPositions: number[] = [];
  const outNormals: number[] = [];
  const outIndices = new Uint32Array(indices.length);
  const seen = new Map<string, number>();
  for (let f = 0; f < faceCount; f++) {
    const own: Vec3 = [unit[3 * f] as number, unit[3 * f + 1] as number, unit[3 * f + 2] as number];
    for (let k = 0; k < 3; k++) {
      const v = indices[3 * f + k] as number;
      let sum: Vec3 = [0, 0, 0];
      for (const g of vertexFaces[v] ?? []) {
        const other: Vec3 = [
          unit[3 * g] as number,
          unit[3 * g + 1] as number,
          unit[3 * g + 2] as number,
        ];
        if (dot(own, other) >= cosLimit) {
          sum = add(sum, [
            faceNormals[3 * g] as number,
            faceNormals[3 * g + 1] as number,
            faceNormals[3 * g + 2] as number,
          ]);
        }
      }
      const n = length(sum) > 0 ? normalize(sum) : own;
      // Normales casi iguales comparten vértice.
      const key = `${v}|${Math.round(n[0] * 1000)}|${Math.round(n[1] * 1000)}|${Math.round(n[2] * 1000)}`;
      let index = seen.get(key);
      if (index === undefined) {
        index = outPositions.length / 3;
        seen.set(key, index);
        outPositions.push(...p(v));
        outNormals.push(...n);
      }
      outIndices[3 * f + k] = index;
    }
  }
  return {
    positions: new Float32Array(outPositions),
    normals: new Float32Array(outNormals),
    indices: outIndices,
  };
}
