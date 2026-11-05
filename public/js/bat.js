import * as THREE from 'three';
import { BATTER } from './config.js';

const BAT_LENGTH = 0.9;
const BARREL_RADIUS = 0.045;
const HANDLE_RADIUS = 0.016;
const ORIENTATION_SMOOTHING = 0.5;
const REST_OFFSET = new THREE.Vector3(0.1, 0.1, 0.1);

/*
 * Phone-as-bat orientation mapping.
 *
 * Grip: screen up, charge port toward the body. In the phone frame +Y is the
 * bat tip, +X is right and +Z is up. The scene uses X toward the plate,
 * Y up and Z toward the catcher, so device rotations are conjugated by this
 * change of basis before being applied to the bat mesh.
 */
const DEVICE_TO_SCENE = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().set(
    0, 1, 0, 0,
    0, 0, 1, 0,
    1, 0, 0, 0,
    0, 0, 0, 1,
  ),
);
const SCENE_TO_DEVICE = DEVICE_TO_SCENE.clone().invert();
const BAT_AXIS_ALIGNMENT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

export class Bat {
  #euler = new THREE.Euler();
  #deviceRotation = new THREE.Quaternion();
  #target = new THREE.Quaternion();

  constructor(scene) {
    // The geometry is shifted up so the mesh origin sits at the handle.
    const geometry = new THREE.CylinderGeometry(BARREL_RADIUS, HANDLE_RADIUS, BAT_LENGTH, 16);
    geometry.translate(0, BAT_LENGTH / 2, 0);

    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xc8863a, roughness: 0.5 }),
    );
    this.mesh.castShadow = true;
    this.mesh.position.copy(BATTER.root).add(REST_OFFSET);
    scene.add(this.mesh);
  }

  setHandlePosition(position) {
    this.mesh.position.copy(position);
  }

  /** @param {{pitch: number, roll: number, yaw: number}} orientation Euler angles in degrees. */
  setOrientation({ pitch, roll, yaw }) {
    const { degToRad } = THREE.MathUtils;

    this.#euler.set(degToRad(pitch), degToRad(roll), degToRad(yaw), 'ZXY');
    this.#deviceRotation.setFromEuler(this.#euler);

    this.#target
      .copy(DEVICE_TO_SCENE)
      .multiply(this.#deviceRotation)
      .multiply(SCENE_TO_DEVICE)
      .multiply(BAT_AXIS_ALIGNMENT);

    this.mesh.quaternion.slerp(this.#target, ORIENTATION_SMOOTHING);
  }
}
