import { INPUT, SWING } from './config.js';

/** Wraps an angle in degrees into the range [-180, 180). */
function wrapDegrees(angle) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

/**
 * Receives phone telemetry from the bridge server over server-sent events.
 *
 * Messages are either `CALIBRATE` or `pitch,roll,yaw,isSwing,peak`.
 */
export class PhoneInput {
  /** Orientation in degrees; yaw is relative to the last calibration. */
  orientation = { pitch: 0, roll: 0, yaw: 0 };
  peak = 0;
  swinging = false;

  #source = null;
  #lastSeen = 0;
  #rawYaw = 0;
  #yawOffset = 0;
  #calibrationPending = false;
  #hasData = false;
  #pendingSwing = null;

  connect(url = INPUT.eventsUrl) {
    this.#source = new EventSource(url);
    this.#source.onmessage = (event) => this.#handleMessage(event.data, performance.now());
  }

  /** Treats the current heading as straight ahead. */
  calibrate() {
    this.#yawOffset = this.#rawYaw;
  }

  isConnected(now) {
    return now - this.#lastSeen < INPUT.staleAfterMs;
  }

  /** Registers a swing that did not come from the phone (keyboard testing). */
  triggerSwing(peak, now = performance.now()) {
    this.#pendingSwing = { startedAt: now, peak };
  }

  /**
   * Returns the pending swing once enough time has passed for the bat to
   * reach the plate, or null if there is none yet.
   */
  takeDueSwing(now) {
    const swing = this.#pendingSwing;
    if (!swing || now - swing.startedAt < SWING.contactDelayMs) return null;

    this.#pendingSwing = null;
    return swing;
  }

  #handleMessage(data, now) {
    if (data === 'CALIBRATE') {
      this.#calibrationPending = true;
      return;
    }

    const values = data.split(',').map(Number);
    if (values.length < 5 || values.some(Number.isNaN)) return;
    const [pitch, roll, yaw, swingFlag, peak] = values;

    this.#rawYaw = yaw;
    if (this.#calibrationPending || !this.#hasData) {
      this.#yawOffset = yaw;
      this.#calibrationPending = false;
      this.#hasData = true;
    }

    this.orientation.pitch = wrapDegrees(pitch);
    this.orientation.roll = wrapDegrees(roll);
    this.orientation.yaw = wrapDegrees(yaw - this.#yawOffset);
    this.peak = peak;
    this.#lastSeen = now;

    const swinging = swingFlag !== 0;
    if (swinging && !this.swinging) {
      this.#pendingSwing = { startedAt: now, peak };
    } else if (swinging && this.#pendingSwing) {
      this.#pendingSwing.peak = Math.max(this.#pendingSwing.peak, peak);
    }
    this.swinging = swinging;
  }
}
