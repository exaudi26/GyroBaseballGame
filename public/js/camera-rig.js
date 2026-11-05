import * as THREE from 'three';
import { CAMERA } from './config.js';

/** Fixed behind-the-plate camera whose gaze glides toward the ball in play. */
export class CameraRig {
  #camera;
  #lookTarget = CAMERA.lookTarget.clone();
  #desiredTarget = new THREE.Vector3();

  constructor(camera) {
    this.#camera = camera;
    camera.position.copy(CAMERA.position);
    camera.lookAt(this.#lookTarget);
  }

  /** @param {THREE.Vector3 | null} followTarget Point to watch, or null for the default view. */
  update(dt, followTarget) {
    this.#desiredTarget.copy(followTarget ?? CAMERA.lookTarget);

    const blend = 1 - Math.exp(-CAMERA.followResponsiveness * dt);
    this.#lookTarget.lerp(this.#desiredTarget, blend);
    this.#camera.lookAt(this.#lookTarget);
  }
}
