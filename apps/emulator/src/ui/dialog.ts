/**
 * Diálogo modal propio de la app (elemento <dialog>). Reemplaza a confirm()/alert() del
 * navegador, que se ven distinto en Android y bloquean las pruebas E2E.
 */

export interface DialogAction<T extends string> {
  readonly id: T;
  readonly label: string;
  /** Acción principal (resaltada y con el foco inicial). */
  readonly primary?: boolean;
}

export interface DialogOptions<T extends string> {
  readonly title: string;
  readonly message: string;
  readonly actions: readonly DialogAction<T>[];
}

/** Muestra el diálogo y devuelve la acción elegida, o `'cancel'` si se cierra con Esc. */
export function showDialog<T extends string>(options: DialogOptions<T>): Promise<T | 'cancel'> {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialogo';
  dialog.setAttribute('aria-labelledby', 'dialogo-titulo');
  const title = document.createElement('h2');
  title.id = 'dialogo-titulo';
  title.textContent = options.title;
  const message = document.createElement('p');
  message.textContent = options.message;
  const actions = document.createElement('div');
  actions.className = 'dialogo-acciones';
  dialog.append(title, message, actions);
  document.body.append(dialog);

  return new Promise((resolve) => {
    const close = (result: T | 'cancel'): void => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    for (const action of options.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.dataset['action'] = action.id;
      if (action.primary) button.classList.add('primario');
      button.addEventListener('click', () => close(action.id));
      actions.append(button);
    }
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close('cancel');
    });
    dialog.showModal();
    actions.querySelector<HTMLButtonElement>('.primario')?.focus();
  });
}
