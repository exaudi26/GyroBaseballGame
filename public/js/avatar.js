import * as THREE from 'three';
import { BATTER, POSE } from './config.js';
import {
  RADIAL_SEGMENTS,
  addEllipsoid,
  addMesh,
  addTaperedLimb,
  createMaterial,
  stretchBetween,
} from './rig-utils.js';

/** MediaPipe pose landmark indices, indexed by side (0 = left, 1 = right). */
const LANDMARK = Object.freeze({
  nose: 0,
  shoulder: [11, 12],
  elbow: [13, 14],
  wrist: [15, 16],
  hip: [23, 24],
});

const LANDMARK_COUNT = 33;
const SIDES = [0, 1];
const MIN_BONE_LENGTH = 1e-4;
const MIN_HEADING_SPAN = 1e-3;
const HEAD_LIFT = new THREE.Vector3(0, 0.06, 0);
const CHEST_CAP_DROP = 0.02;

const HIP_OFFSET = Object.freeze({ x: 0.12, y: -0.02 });
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const MAX_PELVIS_TWIST = THREE.MathUtils.degToRad(POSE.maxTwistDegrees);

const PALETTE = Object.freeze({
  jersey: 0x2a8a8f,
  helmet: 0x174349,
  pants: 0x2f3440,
  glove: 0x1c1c1c,
  skin: 0xd9a77c,
  shoe: 0x111111,
});

const { clamp } = THREE.MathUtils;

const vectors = (count) => Array.from({ length: count }, () => new THREE.Vector3());

/** Converts side index (0 = left, 1 = right) to a mirror sign (-1 / +1). */
const sideSign = (side) => (side === 0 ? -1 : 1);

/**
 * Heading of the line from `from` to `to`, seen from above, in radians.
 * Returns null when the two points are almost on top of each other.
 */
function headingBetween(from, to) {
  const across = to.x - from.x;
  const depth = to.z - from.z;
  if (Math.hypot(across, depth) < MIN_HEADING_SPAN) return null;
  return Math.atan2(-depth, across);
}

/**
 * A batter built from tapered limbs and joint spheres.
 *
 * Feet and knees are planted and the pelvis stays at one spot; it only turns
 * with the player's hips. The chest is anchored above the pelvis, while the
 * shoulders, arms and head follow the webcam pose, so the upper body can
 * twist, reach and swing freely.
 */
export class Avatar {
  /** Midpoint between the wrists, used as the bat grip. */
  grip = new THREE.Vector3();
  group = new THREE.Group();

  #root = BATTER.root;
  #materials = Object.fromEntries(
    Object.entries(PALETTE).map(([name, color]) => [name, createMaterial(color)]),
  );
  #legs = null;
  #parts = null;

  #joints = vectors(LANDMARK_COUNT);
  #armLengths = SIDES.map(() => [...POSE.armLengths]);
  #pelvisYaw = 0;

  #chest = new THREE.Vector3();
  #shoulderCenter = new THREE.Vector3();
  #head = new THREE.Vector3();
  #shoulders = vectors(2);
  #elbows = vectors(2);
  #wrists = vectors(2);
  #hips = vectors(2);
  #knees = vectors(2);

  #scratch = new THREE.Vector3();
  #bone = new THREE.Vector3();
  #rawElbow = new THREE.Vector3();
  #rawWrist = new THREE.Vector3();

  constructor(scene) {
    this.group.rotation.y = BATTER.yaw;
    this.group.visible = false;
    scene.add(this.group);

    this.#chest.copy(this.#root);
    this.#chest.y += POSE.torsoHeight;

    this.#legs = this.#buildLegs();
    this.#parts = this.#buildUpperBody();
    this.#poseLegs(0);
    this.#placeTorso();
  }

  get isTracking() {
    return this.group.visible;
  }

  /** Updates the pose from MediaPipe world landmarks. */
  update(worldLandmarks) {
    this.#smoothJoints(worldLandmarks);
    this.#solveSkeleton();
    this.#applySkeleton();
    this.#rotatePelvis();
    this.group.visible = true;
  }

  #buildLegs() {
    const { pants, shoe } = this.#materials;
    const root = this.#root;

    const pelvis = addEllipsoid(this.group, 0.15, pants, [1.3, 0.85, 0.85]);
    pelvis.position.copy(root);

    const legs = { pelvis, hipJoints: [], thighs: [] };

    for (const side of SIDES) {
      const sign = sideSign(side);
      const knee = this.#knees[side].set(root.x + sign * 0.3, 0.52, root.z + 0.06);
      const ankle = new THREE.Vector3(root.x + sign * 0.34, 0.1, root.z);

      legs.hipJoints.push(addEllipsoid(this.group, 0.105, pants));
      legs.thighs.push(addTaperedLimb(this.group, 0.105, 0.075, pants));

      addEllipsoid(this.group, 0.075, pants).position.copy(knee);
      stretchBetween(addTaperedLimb(this.group, 0.075, 0.052, pants), knee, ankle);
      addEllipsoid(this.group, 0.052, pants).position.copy(ankle);

      addEllipsoid(this.group, 0.062, shoe, [1.1, 0.8, 2.6]).position.set(ankle.x, 0.055, ankle.z - 0.07);
    }
    return legs;
  }

  #buildUpperBody() {
    const { jersey, glove, skin } = this.#materials;
    const group = this.group;
    const perSide = (create) => SIDES.map(create);

    return {
      torso: addTaperedLimb(group, 0.13, 0.15, jersey, [1.4, 0.8]),
      chestCap: addEllipsoid(group, 0.15, jersey, [1.35, 0.5, 0.8]),
      shoulderBar: addTaperedLimb(group, 0.06, 0.06, jersey),
      neck: addTaperedLimb(group, 0.052, 0.046, skin),
      shoulders: perSide(() => addEllipsoid(group, 0.068, jersey)),
      upperArms: perSide(() => addTaperedLimb(group, 0.068, 0.052, jersey)),
      elbows: perSide(() => addEllipsoid(group, 0.052, jersey)),
      forearms: perSide(() => addTaperedLimb(group, 0.052, 0.04, jersey)),
      hands: perSide(() => addEllipsoid(group, 0.06, glove, [1, 1.15, 1.1])),
      head: this.#buildHead(),
    };
  }

  #buildHead() {
    const { skin, helmet } = this.#materials;
    const head = new THREE.Group();
    this.group.add(head);

    const skull = new THREE.SphereGeometry(0.105, RADIAL_SEGMENTS, 20).scale(0.92, 1.12, 1);
    addMesh(head, skull, skin);

    const shell = new THREE.SphereGeometry(0.122, RADIAL_SEGMENTS, 16, 0, Math.PI * 2, 0, Math.PI * 0.55)
      .scale(0.95, 1.05, 1.02);
    addMesh(head, shell, helmet).position.y = 0.025;

    return head;
  }

  /** The chest never moves, so the torso and chest cap are placed once. */
  #placeTorso() {
    const { torso, chestCap } = this.#parts;

    stretchBetween(torso, this.#root, this.#chest);
    chestCap.position.copy(this.#chest);
    chestCap.position.y -= CHEST_CAP_DROP;
  }

  #smoothJoints(worldLandmarks) {
    const count = Math.min(worldLandmarks.length, LANDMARK_COUNT);
    for (let i = 0; i < count; i += 1) {
      const { x, y, z } = worldLandmarks[i];
      // Mirror horizontally and flip Y so the avatar moves like the player's reflection.
      this.#scratch.set(-x, -y, z);
      this.#joints[i].lerp(this.#scratch, POSE.smoothing);
    }
  }

  /** Positions a joint relative to the shoulder midpoint, re-anchored on the chest. */
  #relativeToChest(index, target) {
    return target.copy(this.#joints[index]).sub(this.#shoulderCenter).add(this.#chest);
  }

  /**
   * Returns the vector from `from` toward `to`, rescaled to a stable bone length.
   * Pose estimates are noisy; only the direction is trusted, while the length
   * adapts slowly to the player.
   */
  #constrainedBone(side, segment, from, to) {
    const bone = this.#bone.subVectors(to, from);
    const measured = bone.length();
    if (measured < MIN_BONE_LENGTH) return bone.set(0, 0, 0);

    const lengths = this.#armLengths[side];
    const [min, max] = POSE.armLengthBounds;
    lengths[segment] += (clamp(measured, min, max) - lengths[segment]) * POSE.armLengthAdaptation;

    return bone.multiplyScalar(lengths[segment] / measured);
  }

  #solveSkeleton() {
    const joints = this.#joints;

    this.#shoulderCenter
      .addVectors(joints[LANDMARK.shoulder[0]], joints[LANDMARK.shoulder[1]])
      .multiplyScalar(0.5);

    for (const side of SIDES) {
      const shoulder = this.#relativeToChest(LANDMARK.shoulder[side], this.#shoulders[side]);
      this.#relativeToChest(LANDMARK.elbow[side], this.#rawElbow);
      this.#relativeToChest(LANDMARK.wrist[side], this.#rawWrist);

      const elbow = this.#elbows[side].copy(shoulder);
      elbow.add(this.#constrainedBone(side, 0, shoulder, this.#rawElbow));

      const wrist = this.#wrists[side].copy(elbow);
      wrist.add(this.#constrainedBone(side, 1, this.#rawElbow, this.#rawWrist));
    }

    this.#relativeToChest(LANDMARK.nose, this.#head).add(HEAD_LIFT);
    this.grip.addVectors(this.#wrists[0], this.#wrists[1]).multiplyScalar(0.5);
  }

  #applySkeleton() {
    const parts = this.#parts;

    stretchBetween(parts.shoulderBar, this.#shoulders[0], this.#shoulders[1]);
    stretchBetween(parts.neck, this.#chest, this.#head);
    parts.head.position.copy(this.#head);

    // The chest stays put but turns with the shoulders, like a twisting torso.
    const shoulderHeading = headingBetween(this.#shoulders[0], this.#shoulders[1]);
    if (shoulderHeading !== null) {
      parts.torso.rotation.y = shoulderHeading;
      parts.chestCap.rotation.y = shoulderHeading;
    }

    for (const side of SIDES) {
      stretchBetween(parts.upperArms[side], this.#shoulders[side], this.#elbows[side]);
      stretchBetween(parts.forearms[side], this.#elbows[side], this.#wrists[side]);
      parts.shoulders[side].position.copy(this.#shoulders[side]);
      parts.elbows[side].position.copy(this.#elbows[side]);
      parts.hands[side].position.copy(this.#wrists[side]);
    }
  }

  /** Turns the pelvis to match the player's hip line; it never moves sideways. */
  #rotatePelvis() {
    const hips = LANDMARK.hip.map((index) => this.#joints[index]);
    const heading = headingBetween(hips[0], hips[1]);
    if (heading !== null) {
      this.#pelvisYaw = clamp(heading, -MAX_PELVIS_TWIST, MAX_PELVIS_TWIST);
    }
    this.#poseLegs(this.#pelvisYaw);
  }

  /** Rotates the pelvis and re-stretches the thighs between the turned hips and the planted knees. */
  #poseLegs(yaw) {
    const { pelvis, hipJoints, thighs } = this.#legs;
    pelvis.rotation.y = yaw;

    for (const side of SIDES) {
      const hip = this.#hips[side]
        .set(sideSign(side) * HIP_OFFSET.x, HIP_OFFSET.y, 0)
        .applyAxisAngle(Y_AXIS, yaw)
        .add(this.#root);

      hipJoints[side].position.copy(hip);
      stretchBetween(thighs[side], hip, this.#knees[side]);
    }
  }
}