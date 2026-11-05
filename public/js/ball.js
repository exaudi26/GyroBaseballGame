import * as THREE from 'three';
import { BALL, GRAVITY } from './config.js';

const SHADOW_HEIGHT = 0.035;
const SHADOW_MAX_OPACITY = 0.45;
const SHADOW_FADE_PER_METRE = 0.02;
const VALUES_PER_POINT = 3;

/** The baseball: simple ballistic motion, ground bounces, a blob shadow and a motion trail. */
export class Ball {
  velocity = new THREE.Vector3();
  /** Quadratic drag coefficient (1/m). Zero for pitches, set when the ball is struck. */
  airDrag = 0;

  #shadow;
  #trail;
  #grounded = false;
  #trailPoints = 0;
  #trailPositions = new Float32Array(BALL.trailLength * VALUES_PER_POINT);

  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    );

    this.#shadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL.radius * 1.3, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false }),
    );
    this.#shadow.rotation.x = -Math.PI / 2;

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.#trailPositions, VALUES_PER_POINT));
    trailGeometry.setDrawRange(0, 0);
    this.#trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
    );
    this.#trail.frustumCulled = false;

    scene.add(this.mesh, this.#shadow, this.#trail);
    this.hide();
  }

  get position() {
    return this.mesh.position;
  }

  /** Shows the ball at rest at `position`, clearing any previous motion. */
  place(position) {
    this.mesh.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.airDrag = 0;
    this.#grounded = false;
    this.#trailPoints = 0;
    this.#trail.geometry.setDrawRange(0, 0);
    this.#setVisible(true);
    this.#updateShadow();
  }

  hide() {
    this.#setVisible(false);
  }

  /**
   * Advances the simulation by `dt` seconds.
   * @returns {boolean} true if the ball touched the ground during this step.
   */
  step(dt) {
    if (this.airDrag > 0) {
      const slowdown = 1 - this.airDrag * this.velocity.length() * dt;
      this.velocity.multiplyScalar(Math.max(0, slowdown));
    }
    this.velocity.y -= GRAVITY * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);

    const touchedDown = this.#resolveGround(dt);
    this.#updateShadow();
    this.#recordTrail();
    return touchedDown;
  }

  #setVisible(visible) {
    this.mesh.visible = visible;
    this.#shadow.visible = visible;
    this.#trail.visible = visible;
  }

  #resolveGround(dt) {
    const { position } = this.mesh;
    if (position.y > BALL.radius) {
      this.#grounded = false;
      return false;
    }

    position.y = BALL.radius;
    const touchedDown = !this.#grounded;
    this.#grounded = true;

    if (this.velocity.y < -BALL.minBounceSpeed) {
      this.velocity.y *= -BALL.restitution;
      this.velocity.x *= BALL.bounceFriction;
      this.velocity.z *= BALL.bounceFriction;
      this.#grounded = false;
    } else {
      this.velocity.y = 0;
      const drag = Math.exp(-BALL.rollingDrag * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
    }
    return touchedDown;
  }

  #updateShadow() {
    const { x, y, z } = this.mesh.position;
    this.#shadow.position.set(x, SHADOW_HEIGHT, z);
    this.#shadow.material.opacity = THREE.MathUtils.clamp(
      SHADOW_MAX_OPACITY - y * SHADOW_FADE_PER_METRE,
      0.1,
      SHADOW_MAX_OPACITY,
    );
  }

  #recordTrail() {
    const positions = this.#trailPositions;
    positions.copyWithin(VALUES_PER_POINT, 0, positions.length - VALUES_PER_POINT);
    this.mesh.position.toArray(positions, 0);

    this.#trailPoints = Math.min(this.#trailPoints + 1, BALL.trailLength);
    this.#trail.geometry.setDrawRange(0, this.#trailPoints);
    this.#trail.geometry.attributes.position.needsUpdate = true;
  }
}
