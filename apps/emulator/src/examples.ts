/** Programas de ejemplo (C7), en `public/examples/`. También se publican como anexo de la tesis. */

export interface Example {
  /** Nombre en el menú "Ejemplos". */
  readonly label: string;
  /** Archivo dentro de `public/examples/`. */
  readonly file: string;
}

export const EXAMPLES: readonly Example[] = [
  { label: 'Pick and place (A → B)', file: 'pick-and-place.txt' },
  { label: 'Pick and place, pinza invertida', file: 'pick-and-place-pinza-invertida.txt' },
  { label: 'Rangos de los ejes (0 % y 100 %)', file: 'rangos.txt' },
  { label: 'Velocidades (100 %, 50 % y 10 %)', file: 'velocidades.txt' },
];

/** Ruta relativa a la app (funciona en GitHub Pages bajo una subruta y dentro del APK). */
export const exampleUrl = (example: Example): string => `examples/${example.file}`;
