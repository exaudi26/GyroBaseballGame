import * as THREE from 'three';
import { FIELD } from './config.js';
import {
  addEllipsoid,
  addMesh,
  addTaperedLimb,
  createMaterial,
  stretchBetween,
} from './rig-utils.js';

const COLORS = Object.freeze({
  steel: 0x5a606b,
  body: 0x2b5fb8,
  rubber: 0x1a1a1a,
  hopper: 0x8a8f99,
  barrel: 0x222428,
  tread: 0x3a3a3a,
  ball: 0xffffff,
});

const MODEL_SCALE = 1.3;
const PIVOT_HEIGHT = 1.15;
const MUZZLE_OFFSET = 0.45;
const DISTANCE_BEHIND_MOUND_CENTER = 0.7;

const IDLE_WHEEL_SPEED = 2;
const FIRING_WHEEL_SPEED = 40;
const WHEEL_RESPONSIVENESS = 3;
const AIM_RESPONSIVENESS = 5;
const RECOIL_DISTANCE = 0.14;
const RECOIL_DECAY = 8;

/**
 * A tripod-mounted pitching machine. The aim pivot rotates toward a launch
 * direction, the throwing wheels spin up before a pitch, and the barrel
 * recoils when the ball is released.
 */
export class PitchingMachine {
  #pivot = new THREE.Group();
  #assembly = new THREE.Group();
  #muzzle = new THREE.Object3D();
  #wheels = [];
  #materials = {
    steel: createMaterial(COLORS.steel, { metalness: 0.4, roughness: 0.5 }),
    body: createMaterial(COLORS.body, { metalness: 0.3, roughness: 0.5 }),
    rubber: createMaterial(COLORS.rubber, { roughness: 0.9 }),
    hopper: createMaterial(COLORS.hopper, { metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    barrel: createMaterial(COLORS.barrel, { metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide }),
    tread: createMaterial(COLORS.tread, { roughness: 0.9 }),
    ball: createMaterial(COLORS.ball, { roughness: 0.4 }),
  };

  #targetYaw = 0;
  #targetPitch = 0;
  #wheelSpeed = IDLE_WHEEL_SPEED;
  #spinning = false;
  #recoil = 0;

  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(0, FIELD.moundTop, FIELD.moundZ - DISTANCE_BEHIND_MOUND_CENTER);
    this.group.scale.setScalar(MODEL_SCALE);
    scene.add(this.group);

    this.#pivot.position.y = PIVOT_HEIGHT;
    this.#pivot.rotation.order = 'YXZ';
    this.#muzzle.position.z = MUZZLE_OFFSET;
    this.group.add(this.#pivot);
    this.#pivot.add(this.#assembly);
    this.#assembly.add(this.#muzzle);

    this.#buildStand();
    this.#buildAssembly();
  }

  /** Writes the world position of the barrel opening into `target`. */
  getMuzzlePosition(target) {
    this.group.updateMatrixWorld(true);
    return this.#muzzle.getWorldPosition(target);
  }

  /** Turns the barrel toward a world-space direction. */
  aim(direction) {
    const length = direction.length();
    if (length === 0) return;

    this.#targetYaw = Math.atan2(direction.x, direction.z);
    this.#targetPitch = -Math.asin(THREE.MathUtils.clamp(direction.y / length, -1, 1));
  }

  setSpinning(active) {
    this.#spinning = active;
  }

  fire() {
    this.#recoil = RECOIL_DISTANCE;
  }

  update(dt) {
    const aimBlend = 1 - Math.exp(-AIM_RESPONSIVENESS * dt);
    this.#pivot.rotation.y += (this.#targetYaw - this.#pivot.rotation.y) * aimBlend;
    this.#pivot.rotation.x += (this.#targetPitch - this.#pivot.rotation.x) * aimBlend;

    const wheelTarget = this.#spinning ? FIRING_WHEEL_SPEED : IDLE_WHEEL_SPEED;
    this.#wheelSpeed += (wheelTarget - this.#wheelSpeed) * Math.min(1, dt * WHEEL_RESPONSIVENESS);
    this.#wheels[0].rotation.y += this.#wheelSpeed * dt;
    this.#wheels[1].rotation.y -= this.#wheelSpeed * dt;

    this.#recoil *= Math.exp(-RECOIL_DECAY * dt);
    this.#assembly.position.z = -this.#recoil;
  }

  #buildStand() {
    const { steel, rubber } = this.#materials;
    const legTop = new THREE.Vector3(0, PIVOT_HEIGHT - 0.3, 0);

    const post = addTaperedLimb(this.group, 0.05, 0.05, steel);
    stretchBetween(post, new THREE.Vector3(), new THREE.Vector3(0, PIVOT_HEIGHT - 0.2, 0));

    for (let i = 0; i < 3; i += 1) {
      const angle = Math.PI / 2 + (i * 2 * Math.PI) / 3;
      const foot = new THREE.Vector3(Math.cos(angle) * 0.65, 0.02, Math.sin(angle) * 0.65);

      stretchBetween(addTaperedLimb(this.group, 0.035, 0.035, steel), legTop, foot);

      const pad = addMesh(this.group, new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16), rubber);
      pad.position.copy(foot);
    }
  }

  #buildAssembly() {
    const { steel, body, hopper, barrel, ball } = this.#materials;

    addMesh(this.#assembly, new THREE.BoxGeometry(0.5, 0.4, 0.7), body).position.set(0, 0, -0.5);
    addMesh(this.#assembly, new THREE.BoxGeometry(0.26, 0.3, 0.4), steel).position.set(0, 0, 0.05);

    const funnel = addMesh(
      this.#assembly,
      new THREE.CylinderGeometry(0.34, 0.14, 0.32, 24, 1, true),
      hopper,
    );
    funnel.position.set(0, 0.36, -0.5);

    const hopperBalls = [
      [0.12, 0.42, -0.5],
      [-0.12, 0.42, -0.5],
      [0, 0.42, -0.38],
      [0, 0.42, -0.62],
      [0, 0.5, -0.5],
    ];
    for (const [x, y, z] of hopperBalls) {
      addEllipsoid(this.#assembly, 0.11, ball).position.set(x, y, z);
    }

    const tube = addMesh(this.#assembly, new THREE.CylinderGeometry(0.16, 0.16, 0.38, 24, 1, true), barrel);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0, 0.44);

    const rim = addMesh(this.#assembly, new THREE.TorusGeometry(0.16, 0.025, 10, 28), steel);
    rim.position.set(0, 0, 0.63);

    for (const side of [-1, 1]) {
      this.#wheels.push(this.#createWheel(side));
    }
  }

  #createWheel(side) {
    const { steel, rubber, tread } = this.#materials;
    const wheel = new THREE.Group();
    wheel.position.set(side * 0.33, 0, 0.05);
    this.#assembly.add(wheel);

    addMesh(wheel, new THREE.CylinderGeometry(0.2, 0.2, 0.14, 28), rubber);
    addMesh(wheel, new THREE.CylinderGeometry(0.08, 0.08, 0.18, 14), steel);

    // Tread blocks make the rotation readable from a distance.
    const blockCount = 8;
    for (let i = 0; i < blockCount; i += 1) {
      const angle = (i * 2 * Math.PI) / blockCount;
      const block = addMesh(wheel, new THREE.BoxGeometry(0.05, 0.15, 0.04), tread);
      block.position.set(Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2);
      block.rotation.y = -angle;
    }
    return wheel;
  }
}
