import * as THREE from 'three';
import {
  BALL,
  FIELD,
  GRAVITY,
  LAUNCH,
  PITCHING,
  SCORING,
  STRIKE_ZONE,
  SWING,
} from './config.js';

const Phase = Object.freeze({
  /** Waiting for the next pitch; the machine winds up near the end. */
  Idle: 'idle',
  /** Ball in flight toward the plate. */
  Pitched: 'pitched',
  /** Ball has been struck and has not landed yet. */
  Batted: 'batted',
  /** Ball has landed (or passed the plate); letting the play finish. */
  Settling: 'settling',
});

const MS_TO_KMH = 3.6;
const { clamp, degToRad, randFloat, randFloatSpread } = THREE.MathUtils;

/**
 * Owns the rules of the game: when pitches are thrown, whether a swing makes
 * contact, where the ball goes, and how each play is scored.
 */
export class Game {
  stats = {
    pitches: 0,
    hits: 0,
    homeRuns: 0,
    fouls: 0,
    streak: 0,
    bestDistance: 0,
    lastExitSpeed: 0,
    lastDistance: 0,
  };

  #ball;
  #machine;
  #sounds;
  #announce;

  #phase = Phase.Idle;
  #countdown = PITCHING.firstPitchDelay;
  #settleRemaining = 0;
  #pitch;
  #swungAtPitch = false;
  #play = null;

  #muzzle = new THREE.Vector3();
  #velocity = new THREE.Vector3();
  #radial = new THREE.Vector3();

  /**
   * @param {object} options
   * @param {import('./ball.js').Ball} options.ball
   * @param {import('./pitching-machine.js').PitchingMachine} options.machine
   * @param {import('./sound-bank.js').SoundBank} options.sounds
   * @param {(text: string, durationMs?: number) => void} options.announce
   */
  constructor({ ball, machine, sounds, announce }) {
    this.#ball = ball;
    this.#machine = machine;
    this.#sounds = sounds;
    this.#announce = announce;
    this.#pitch = this.#rollPitch();
  }

  /** The point the camera should watch, or null when the ball is not in play. */
  get followTarget() {
    const ballInPlay = this.#phase === Phase.Batted || (this.#phase === Phase.Settling && this.#play);
    return ballInPlay ? this.#ball.position : null;
  }

  update(dt) {
    switch (this.#phase) {
      case Phase.Idle:
        this.#updateIdle(dt);
        break;
      case Phase.Pitched:
        this.#updatePitched(dt);
        break;
      case Phase.Batted:
        this.#updateBatted(dt);
        break;
      case Phase.Settling:
        this.#updateSettling(dt);
        break;
    }
  }

  /**
   * Called when a swing reaches the moment of contact.
   * @param {number} peak Swing intensity from the phone.
   * @param {number} yawDegrees Phone heading relative to calibration.
   */
  resolveSwing(peak, yawDegrees) {
    this.#sounds.playSwing(peak);
    if (this.#phase !== Phase.Pitched || this.#swungAtPitch) return;
    this.#swungAtPitch = true;

    const offset = this.#ball.position.z - FIELD.plateZ;
    const distance = Math.abs(offset);

    if (distance > SWING.contactWindow) {
      this.stats.streak = 0;
      this.#announce(offset < 0 ? 'Too early' : 'Too late');
      return;
    }

    const quality = 1 - distance / SWING.contactWindow;
    this.#launchBattedBall({ quality, late: offset > 0, peak, yawDegrees });
  }

  #rollPitch() {
    return {
      speed: randFloat(PITCHING.minSpeed, PITCHING.maxSpeed),
      target: new THREE.Vector3(
        randFloatSpread(PITCHING.targetHalfWidth * 2),
        randFloat(PITCHING.targetMinHeight, PITCHING.targetMaxHeight),
        FIELD.plateZ,
      ),
    };
  }

  /** Velocity that carries a ball from `start` through the pitch target at constant forward speed. */
  #pitchVelocity(start, { speed, target }, out) {
    const flightTime = (target.z - start.z) / speed;
    return out.set(
      (target.x - start.x) / flightTime,
      (target.y - start.y + 0.5 * GRAVITY * flightTime ** 2) / flightTime,
      speed,
    );
  }

  #isStrike({ target }) {
    const margin = BALL.radius;
    return (
      Math.abs(target.x) <= STRIKE_ZONE.halfWidth + margin &&
      target.y >= STRIKE_ZONE.bottom - margin &&
      target.y <= STRIKE_ZONE.top + margin
    );
  }

  #updateIdle(dt) {
    this.#countdown -= dt;
    const winding = this.#countdown <= PITCHING.windupSeconds;
    this.#machine.setSpinning(winding);

    this.#machine.getMuzzlePosition(this.#muzzle);
    this.#pitchVelocity(this.#muzzle, this.#pitch, this.#velocity);
    this.#machine.aim(this.#velocity);

    if (winding) this.#ball.place(this.#muzzle);
    if (this.#countdown <= 0) this.#releasePitch();
  }

  #releasePitch() {
    this.#ball.velocity.copy(this.#velocity);
    this.#machine.fire();
    this.#sounds.playPitch();

    this.#swungAtPitch = false;
    this.#phase = Phase.Pitched;
    this.stats.pitches += 1;

    const kmh = Math.round(this.#pitch.speed * MS_TO_KMH);
    this.#announce(`Pitch  ${kmh} km/h`, 800);
  }

  #updatePitched(dt) {
    this.#ball.step(dt);
    if (this.#ball.position.z <= PITCHING.passedPlateZ) return;

    if (!this.#swungAtPitch) {
      this.#announce(this.#isStrike(this.#pitch) ? 'Strike' : 'Ball');
    }
    this.#beginSettling(SCORING.missedSettleSeconds);
  }

  #launchBattedBall({ quality, late, peak, yawDegrees }) {
    const lateness = late ? 1 : -1;
    const direction = clamp(
      yawDegrees * SWING.yawSign * SWING.yawToDirection,
      -SWING.maxDirectionYaw,
      SWING.maxDirectionYaw,
    );
    const azimuth = degToRad(direction + lateness * (1 - quality) * SWING.latePull);
    const elevation = degToRad(LAUNCH.baseElevation + quality * LAUNCH.elevationGain);
    const power = LAUNCH.minPower + (1 - LAUNCH.minPower) * quality;
    const speed = (LAUNCH.baseSpeed + peak * LAUNCH.speedPerPeak) * power;

    this.#ball.velocity
      .set(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        -Math.cos(azimuth) * Math.cos(elevation),
      )
      .multiplyScalar(speed);
    this.#ball.airDrag = BALL.airDrag;

    this.#play = { elapsed: 0, homeRun: false };
    this.#phase = Phase.Batted;
    this.stats.lastExitSpeed = speed;

    this.#sounds.playHit(quality);
    this.#announce(quality >= SCORING.greatContactQuality ? 'Great contact!' : 'Hit!');
  }

  #updateBatted(dt) {
    const landed = this.#stepBattedBall(dt);
    this.#play.elapsed += dt;

    if (landed || this.#play.elapsed > SCORING.maxFlightSeconds) {
      this.#scoreBattedBall();
      this.#beginSettling(SCORING.battedSettleSeconds);
    }
  }

  #updateSettling(dt) {
    if (this.#play) {
      this.#stepBattedBall(dt);
    } else {
      this.#ball.step(dt);
    }

    this.#settleRemaining -= dt;
    if (this.#settleRemaining <= 0) this.#beginIdle();
  }

  #stepBattedBall(dt) {
    const landed = this.#ball.step(dt);
    this.#handleFence();
    return landed;
  }

  /** Bounces the ball off the outfield wall, or flags a home run if it clears it. */
  #handleFence() {
    const { x, y, z } = this.#ball.position;
    const radius = Math.hypot(x, z);
    const withinFairArc = Math.abs(Math.atan2(x, -z)) <= FIELD.foulAngle;
    if (radius < FIELD.fenceRadius || !withinFairArc) return;

    if (y > FIELD.fenceHeight) {
      this.#play.homeRun = true;
      return;
    }
    if (this.#play.homeRun) return;

    this.#radial.set(x / radius, 0, z / radius);
    const limit = FIELD.fenceRadius - BALL.radius;
    this.#ball.position.x = this.#radial.x * limit;
    this.#ball.position.z = this.#radial.z * limit;

    const outwardSpeed = this.#ball.velocity.dot(this.#radial);
    if (outwardSpeed > 0) {
      this.#ball.velocity.addScaledVector(this.#radial, -outwardSpeed * (1 + SCORING.wallRestitution));
    }
  }

  #scoreBattedBall() {
    const { x, z } = this.#ball.position;
    const distance = Math.hypot(x, z);
    const fair = z < 0 && Math.abs(Math.atan2(x, -z)) <= FIELD.foulAngle;
    const { stats } = this;

    stats.lastDistance = distance;

    let label;
    if (!fair) {
      label = 'Foul ball';
      stats.fouls += 1;
    } else {
      stats.hits += 1;
      stats.streak += 1;
      stats.bestDistance = Math.max(stats.bestDistance, distance);

      if (this.#play.homeRun) {
        label = 'Home run!';
        stats.homeRuns += 1;
      } else {
        label = SCORING.bases.find((base) => distance <= base.maxDistance).label;
      }
    }

    this.#announce(`${label}  ${distance.toFixed(0)} m`, 2500);
  }

  #beginSettling(seconds) {
    this.#phase = Phase.Settling;
    this.#settleRemaining = seconds;
  }

  #beginIdle() {
    this.#ball.hide();
    this.#play = null;
    this.#pitch = this.#rollPitch();
    this.#countdown = PITCHING.pauseSeconds + PITCHING.windupSeconds;
    this.#phase = Phase.Idle;
  }
}
