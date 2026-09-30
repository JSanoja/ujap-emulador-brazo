/**
 * Pantalla de carga de la escena (#carga en index.html): la etapa en curso, el avance de la
 * descarga del modelo y el retiro con un fundido cuando la escena está lista.
 */

export interface LoadingScreen {
  /** Cambia el texto de la etapa y oculta la barra de avance. */
  stage(text: string): void;
  /** Muestra el avance (0 a 1) junto a la etapa. */
  progress(text: string, fraction: number): void;
  /** Deja el mensaje de error a la vista, sin el indicador giratorio. */
  fail(text: string): void;
  /** Retira la pantalla con un fundido y la quita del documento. */
  hide(): void;
}

export function mountLoadingScreen(root: HTMLElement): LoadingScreen {
  const label = root.querySelector<HTMLElement>('.etapa');
  const bar = root.querySelector<HTMLElement>('.progreso');
  const fill = bar?.querySelector<HTMLElement>('span');

  return {
    stage(text) {
      if (label) label.textContent = text;
      if (bar) bar.hidden = true;
    },
    progress(text, fraction) {
      const percent = Math.round(Math.min(Math.max(fraction, 0), 1) * 100);
      if (label) label.textContent = `${text} ${percent} %`;
      if (bar) bar.hidden = false;
      if (fill) fill.style.width = `${percent}%`;
    },
    fail(text) {
      root.classList.add('error');
      if (label) label.textContent = text;
      if (bar) bar.hidden = true;
    },
    hide() {
      // Desde este momento deja pasar los toques a la escena; el nodo se quita tras el fundido.
      root.classList.add('lista');
      root.addEventListener('transitionend', () => root.remove(), { once: true });
      // Respaldo por si no hay transición (movimiento reducido o pestaña en segundo plano).
      setTimeout(() => root.remove(), 1000);
    },
  };
}
