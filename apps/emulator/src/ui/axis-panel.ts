/**
 * Panel de ejes: un deslizador en % por articulación y para la pinza.
 * En reposo mueve el robot (movimiento manual); durante un programa solo muestra la pose.
 */
import { degreesToPercent, gripperOpeningToPercent } from '@emulador/core';
import type { Emulator } from '../emulator';

interface Slider {
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

function slider(container: HTMLElement, id: string, label: string): Slider {
  const row = document.createElement('div');
  row.className = 'eje';
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.textContent = label;
  const output = document.createElement('output');
  output.htmlFor.add(id);
  const input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = '0';
  input.max = '100';
  input.step = 'any';
  row.append(lab, output, input);
  container.append(row);
  return { input, output };
}

export interface AxisPanel {
  /** Actualiza los deslizadores con la pose actual del robot. */
  refresh(): void;
}

export function mountAxisPanel(container: HTMLElement, emulator: Emulator): AxisPanel {
  const title = document.createElement('h2');
  title.textContent = 'Ejes';
  container.append(title);

  const joints = emulator.robot.joints.map((joint, index) => {
    const s = slider(container, `eje-${joint.id}`, `${joint.id} · ${joint.name}`);
    s.input.addEventListener('input', () => emulator.jog(index, Number(s.input.value)));
    return s;
  });
  const gripper = slider(container, 'eje-pinza', 'Pinza');
  gripper.input.addEventListener('input', () =>
    emulator.jog('gripper', Number(gripper.input.value)),
  );

  const option = document.createElement('label');
  option.className = 'opcion';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.id = 'invertir-pinza';
  check.addEventListener('change', () => emulator.setGripperInverted(check.checked));
  option.append(check, 'Invertir pinza (0 % = cerrada)');
  container.append(option);

  const refresh = (): void => {
    const { robot, planner, runner } = emulator;
    const idle = runner.state === 'idle';
    const pose = planner.pose;
    robot.joints.forEach((joint, i) => {
      const s = joints[i] as Slider;
      const degrees = pose.joints[i] as number;
      const percent = degreesToPercent(joint, degrees);
      // No se pisa el deslizador que el usuario está arrastrando.
      if (document.activeElement !== s.input) s.input.value = String(percent);
      s.input.disabled = !idle;
      s.output.value = `${percent.toFixed(1)} % · ${degrees.toFixed(1)}°`;
    });
    const percent = gripperOpeningToPercent(robot.gripper, pose.gripper);
    if (document.activeElement !== gripper.input) gripper.input.value = String(percent);
    gripper.input.disabled = !idle;
    gripper.output.value = `${percent.toFixed(1)} % · ${pose.gripper.toFixed(1)} mm`;
    check.checked = robot.gripper.inverted;
    check.disabled = !idle;
  };
  refresh();
  return { refresh };
}
