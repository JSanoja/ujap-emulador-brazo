/**
 * Archivos del usuario.
 * - Web: guardar = descarga del navegador.
 * - Android (Capacitor): se guarda en Documentos/Emulador Brazo UJAP/ y se ofrece compartirlo
 *   (correo, Drive, mensajería…), porque el WebView no tiene descargas.
 * Abrir usa <input type="file"> en ambos casos (Capacitor lo conecta con el selector de Android).
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { showDialog } from './dialog';

/** Carpeta, dentro de Documentos, donde se guardan los archivos en Android. */
export const ANDROID_FOLDER = 'Emulador Brazo UJAP';

/** Guarda un archivo de texto: descarga en la web; Documentos + compartir en Android. */
export async function saveTextFile(name: string, text: string, type = 'text/plain'): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  let uri: string;
  try {
    const result = await Filesystem.writeFile({
      path: `${ANDROID_FOLDER}/${name}`,
      data: text,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    uri = result.uri;
  } catch (error) {
    await showDialog({
      title: 'No se pudo guardar',
      message: `No se pudo guardar "${name}": ${error instanceof Error ? error.message : String(error)}`,
      actions: [{ id: 'ok', label: 'Aceptar', primary: true }],
    });
    return;
  }
  const choice = await showDialog({
    title: 'Archivo guardado',
    message: `Se guardó en Documentos/${ANDROID_FOLDER}/${name}.`,
    actions: [
      { id: 'share', label: 'Compartir' },
      { id: 'ok', label: 'Aceptar', primary: true },
    ],
  });
  if (choice === 'share') {
    try {
      await Share.share({ title: name, files: [uri] });
    } catch {
      // El usuario cerró el menú de compartir.
    }
  }
}

/** Pide al usuario un archivo de texto; devuelve su nombre y contenido, o `null` si cancela. */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
