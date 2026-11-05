import * as THREE from 'three';

/** Gravitational acceleration in m/s^2. */
export const GRAVITY = 9.8;

/**
 * Field layout. The plate sits at the origin and the pitcher faces -Z.
 * Distances are in metres.
 */
export const FIELD = Object.freeze({
  plateZ: 0,
  moundZ: -18.4,
  moundTop: 0.225,
  fenceRadius: 95,
  fenceHeight: 3.5,
  foulAngle: Math.PI / 4,
  distanceMarkers: Object.freeze([30, 60, 90]),
});

export const STRIKE_ZONE = Object.freeze({
  halfWidth: 0.215,
  bottom: 0.5,
  top: 1.15,
});

export const BATTER = Object.freeze({
  root: new THREE.Vector3(-0.9, 1.0, 0),
  yaw: 0,
});

export const CAMERA = Object.freeze({
  fov: 60,
  position: new THREE.Vector3(-2.0, 1.7, 2.6),
  lookTarget: new THREE.Vector3(-0.2, 1.15, -3.5),
  followResponsiveness: 4,
});

export const BALL = Object.freeze({
  radius: 0.14,
  restitution: 0.45,
  bounceFriction: 0.8,
  minBounceSpeed: 0.6,
  rollingDrag: 1.2,
  /** Quadratic air resistance (1/m) applied to batted balls only. */
  airDrag: 0.005,
  trailLength: 28,
});

export const PITCHING = Object.freeze({
  minSpeed: 12,
  maxSpeed: 17,
  targetHalfWidth: 0.35,
  targetMinHeight: 0.45,
  targetMaxHeight: 1.3,
  firstPitchDelay: 3,
  pauseSeconds: 3,
  windupSeconds: 1,
  passedPlateZ: 2.5,
});

export const SWING = Object.freeze({
  /** Delay between swing onset and the moment the bat reaches the ball. */
  contactDelayMs: 120,
  /** Maximum distance (m) between ball and plate for contact to count. */
  contactWindow: 2.0,
  /** Flip to -1 / 1 if the ball is sent to the wrong side. */
  yawSign: -1,
  yawToDirection: 0.6,
  maxDirectionYaw: 40,
  /** Extra sideways pull (degrees) applied to early or late contact. */
  latePull: 25,
  keyboardPeak: 30,
});

export const LAUNCH = Object.freeze({
  baseSpeed: 10,
  speedPerPeak: 1.3,
  minPower: 0.5,
  baseElevation: 8,
  elevationGain: 30,
});

export const SCORING = Object.freeze({
  greatContactQuality: 0.7,
  maxFlightSeconds: 8,
  battedSettleSeconds: 2,
  missedSettleSeconds: 1,
  wallRestitution: 0.3,
  bases: Object.freeze([
    { label: 'Single', maxDistance: 45 },
    { label: 'Double', maxDistance: 75 },
    { label: 'Triple', maxDistance: Infinity },
  ]),
});

export const INPUT = Object.freeze({
  eventsUrl: '/events',
  staleAfterMs: 1000,
});

/** How the webcam pose is turned into avatar motion. */
export const POSE = Object.freeze({
  /** Per-frame blend toward each tracked joint (0-1, higher is snappier). */
  smoothing: 0.4,
  /** Chest height above the pelvis; the chest itself never translates. */
  torsoHeight: 0.5,
  /** Largest pelvis rotation away from facing straight ahead. */
  maxTwistDegrees: 70,
  /** Upper arm and forearm length in metres; adapts slowly to the player. */
  armLengths: Object.freeze([0.29, 0.27]),
  armLengthBounds: Object.freeze([0.18, 0.4]),
  armLengthAdaptation: 0.02,
});

export const POSE_MODEL = Object.freeze({
  wasmRoot: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  modelUrl:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
});