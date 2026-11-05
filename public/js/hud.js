const MS_TO_KMH = 3.6;

/** Updates the stats panel. Fields are looked up once via `data-field` attributes. */
export class Hud {
  #fields = new Map();

  constructor(root) {
    for (const element of root.querySelectorAll('[data-field]')) {
      this.#fields.set(element.dataset.field, element);
    }
  }

  /**
   * @param {object} snapshot
   * @param {boolean} snapshot.phoneConnected
   * @param {string} snapshot.cameraStatus
   * @param {{pitch: number, roll: number, yaw: number}} snapshot.orientation
   * @param {number} snapshot.peak
   * @param {boolean} snapshot.swinging
   * @param {object} snapshot.stats
   */
  render({ phoneConnected, cameraStatus, orientation, peak, swinging, stats }) {
    this.#set('phone', phoneConnected ? 'connected' : 'waiting', phoneConnected ? 'ok' : 'bad');
    this.#set('camera', cameraStatus);
    this.#set('hits', `${stats.hits} / ${stats.pitches}`);
    this.#set('homeRuns', String(stats.homeRuns));
    this.#set('streak', String(stats.streak));
    this.#set('best', `${stats.bestDistance.toFixed(0)} m`);
    this.#set('lastHit', this.#describeLastHit(stats));
    this.#set(
      'orientation',
      `${orientation.pitch.toFixed(0)}° / ${orientation.roll.toFixed(0)}° / ${orientation.yaw.toFixed(0)}°`,
    );
    this.#set('peak', `${peak.toFixed(0)}${swinging ? '  swing' : ''}`);
  }

  #describeLastHit({ lastExitSpeed, lastDistance }) {
    if (lastExitSpeed === 0) return '-';
    return `${(lastExitSpeed * MS_TO_KMH).toFixed(0)} km/h, ${lastDistance.toFixed(0)} m`;
  }

  #set(name, text, state = '') {
    const element = this.#fields.get(name);
    if (!element) return;

    if (element.textContent !== text) element.textContent = text;
    if (element.dataset.state !== state) element.dataset.state = state;
  }
}

/** Large transient text shown over the scene. */
export class Banner {
  #element;
  #hideTimer = null;

  constructor(element) {
    this.#element = element;
  }

  show(text, durationMs = 1500) {
    clearTimeout(this.#hideTimer);
    this.#element.textContent = text;
    this.#hideTimer = setTimeout(() => {
      this.#element.textContent = '';
    }, durationMs);
  }
}
