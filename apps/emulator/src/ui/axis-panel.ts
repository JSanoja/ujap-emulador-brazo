/**
 * Panel provisional de ejes: un deslizador en % por articulación y el ángulo
 * resultante según el núcleo. Base para el panel definitivo de C4.
 */
import {
  gripperOpening,
  percentToDegrees,
  type GripperConfig,
  type RobotConfig,
} from '@emulador/core';
import type { RobotRig } from '../scene/create-scene';

function slider(
  id: string,
  label: string,
  value: number,
): {
  row: HTMLDivElement;
  input: HTMLInputElement;
  output: HTMLOutputElement;
} {
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
  input.step = '0.5';
  input.value = String(value);
  row.append(lab, output, input);
  return { row, input, output };
}

export function mountAxisPanel(container: HTMLElement, robot: RobotConfig, rig: RobotRig): void {
  const title = document.createElement('h1');
  title.textContent = robot.name;
  const note = document.createElement('p');
  note.className = 'nota';
  note.textContent = 'Esqueleto de la App 2. Solo A1 y A2 mueven el robot provisional.';
  container.append(title, note);

  robot.joints.forEach((joint, index) => {
    const { row, input, output } = slider(`eje-${joint.id}`, `${joint.id} · ${joint.name}`, 50);
    const update = (): void => {
      const percent = Number(input.value);
      const degrees = percentToDegrees(joint, percent);
      output.value = `${percent.toFixed(1)} % → ${degrees.toFixed(1)}°`;
      rig.setJointAngle(index, degrees);
    };
    input.addEventListener('input', update);
    update();
    container.append(row);
  });

  let gripper: GripperConfig = { ...robot.gripper };
  const { row, input, output } = slider('eje-pinza', 'Pinza', 0);
  const updateGripper = (): void => {
    const percent = Number(input.value);
    output.value = `${percent.toFixed(1)} % → ${gripperOpening(gripper, percent).toFixed(1)} mm`;
  };
  input.addEventListener('input', updateGripper);

  const option = document.createElement('label');
  option.className = 'opcion';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = gripper.inverted;
  check.addEventListener('change', () => {
    gripper = { ...gripper, inverted: check.checked };
    updateGripper();
  });
  option.append(check, 'Invertir pinza');

  updateGripper();
  container.append(row, option);
}
