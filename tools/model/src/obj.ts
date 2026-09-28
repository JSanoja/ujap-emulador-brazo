/**
 * Lector mínimo de OBJ (Wavefront) para modelos exportados de CAD: solo vértices (`v`),
 * caras (`f`, trianguladas en abanico si tienen más de 3 lados) y grupos (`g`).
 * Ignora normales, coordenadas de textura y materiales.
 */

export interface ObjGroup {
  /** Último nombre de la línea `g` (Cinema 4D escribe la ruta completa de la jerarquía). */
  readonly name: string;
  /** Índices de triángulos (desde 0) sobre `ObjModel.positions`. */
  readonly indices: Uint32Array;
}

export interface ObjModel {
  /** x, y, z de cada vértice. */
  readonly positions: Float32Array;
  readonly groups: readonly ObjGroup[];
}

export function parseObj(text: string): ObjModel {
  const positions: number[] = [];
  const groups: { name: string; indices: number[] }[] = [];
  let current: { name: string; indices: number[] } | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/);
      positions.push(Number(x), Number(y), Number(z));
    } else if (line.startsWith('f ')) {
      if (!current) {
        current = { name: 'default', indices: [] };
        groups.push(current);
      }
      // "f 1 2 3" o "f 1/1/1 2/2/2 3/3/3"; índices negativos son relativos al final.
      const corners = line
        .split(/\s+/)
        .slice(1)
        .map((token) => {
          const index = Number.parseInt(token, 10);
          return index < 0 ? positions.length / 3 + index : index - 1;
        });
      for (let i = 1; i + 1 < corners.length; i++) {
        current.indices.push(corners[0] as number, corners[i] as number, corners[i + 1] as number);
      }
    } else if (line.startsWith('g ')) {
      const names = line.split(/\s+/).slice(1);
      current = { name: names[names.length - 1] ?? 'default', indices: [] };
      groups.push(current);
    }
  }

  return {
    positions: new Float32Array(positions),
    groups: groups
      .filter((group) => group.indices.length > 0)
      .map((group) => ({ name: group.name, indices: new Uint32Array(group.indices) })),
  };
}
