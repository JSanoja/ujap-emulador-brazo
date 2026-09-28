import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  compact,
  compose,
  creaseNormals,
  rotationAbout,
  signedAngle,
  transformDirection,
  transformPoint,
  type Vec3,
} from './geometry.ts';
import { parseObj } from './obj.ts';

const close = (a: Vec3, b: Vec3): void =>
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i] as number, 9));

describe('parseObj', () => {
  it('lee vértices, grupos (último nombre) y triangula polígonos en abanico', () => {
    const obj = parseObj(
      [
        '# comentario',
        'g Robot',
        'v 0 0 0',
        'v 1 0 0',
        'v 1 1 0',
        'v 0 1 0',
        'f 1 2 3',
        'g Robot Head__Axis_1_',
        'f 1/1/1 2/2/2 3/3/3 4/4/4',
        'g vacio',
      ].join('\r\n'),
    );
    expect(obj.positions).toHaveLength(12);
    expect(obj.groups.map((g) => g.name)).toEqual(['Robot', 'Head__Axis_1_']);
    expect([...(obj.groups[1]?.indices ?? [])]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('admite índices negativos (relativos al final)', () => {
    const obj = parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n');
    expect([...(obj.groups[0]?.indices ?? [])]).toEqual([0, 1, 2]);
  });
});

describe('transformaciones', () => {
  it('rotationAbout gira alrededor de una recta que no pasa por el origen', () => {
    const r = rotationAbout([1, 0, 0], [0, 0, 1], 90);
    close(transformPoint(r, [2, 0, 0]), [1, 1, 0]);
    close(transformPoint(r, [1, 0, 5]), [1, 0, 5]); // los puntos del eje no se mueven
    close(transformDirection(r, [1, 0, 0]), [0, 1, 0]);
  });

  it('compose aplica primero el segundo argumento', () => {
    const move = rotationAbout([0, 0, 0], [0, 1, 0], 0).map((row, i) =>
      row.map((x, j) => (j === 3 ? [5, 0, 0][i] : x)),
    ) as unknown as typeof IDENTITY;
    const turn = rotationAbout([0, 0, 0], [0, 0, 1], 90);
    close(transformPoint(compose(turn, move), [1, 0, 0]), [0, 6, 0]);
    close(transformPoint(compose(IDENTITY, turn), [1, 0, 0]), [0, 1, 0]);
  });

  it('signedAngle respeta la regla de la mano derecha', () => {
    expect(signedAngle([0, 1, 0], [0, 0, 1], [1, 0, 0])).toBeCloseTo(90, 9);
    expect(signedAngle([0, 1, 0], [0, 0, -1], [1, 0, 0])).toBeCloseTo(-90, 9);
  });
});

describe('mallas', () => {
  it('compact deja solo los vértices usados y renumera', () => {
    const positions = new Float32Array([9, 9, 9, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const mesh = compact(positions, new Uint32Array([1, 2, 3]));
    expect([...mesh.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...mesh.indices]).toEqual([0, 1, 2]);
  });

  it('creaseNormals: una arista a 90° queda marcada y un plano queda suave', () => {
    // Dos triángulos en el plano z = 0 y uno vertical que comparte la arista (0,0,0)-(1,0,0).
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1]);
    const flat = creaseNormals({ positions, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }, 35);
    expect(flat.positions.length / 3).toBe(4); // sin vértices duplicados
    const folded = creaseNormals({ positions, indices: new Uint32Array([0, 1, 2, 1, 0, 4]) }, 35);
    expect(folded.positions.length / 3).toBe(6); // la arista se duplica
    for (let i = 0; i < folded.normals.length; i += 3) {
      const n: Vec3 = [
        folded.normals[i] ?? 0,
        folded.normals[i + 1] ?? 0,
        folded.normals[i + 2] ?? 0,
      ];
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
      expect(Math.max(...n.map(Math.abs))).toBeCloseTo(1, 6); // normal de cara, sin promediar
    }
  });
});
