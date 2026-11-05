const SILENCE = 0.0001;

/**
 * Procedural sound effects (no audio assets). Browsers only allow audio after
 * a user gesture, so call `unlock()` from a click or key handler.
 */
export class SoundBank {
  #context = null;
  #noiseBuffer = null;

  unlock() {
    if (!this.#context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.#context = new AudioContextClass();
      this.#noiseBuffer = this.#createNoiseBuffer();
    }
    if (this.#context.state === 'suspended') this.#context.resume();
  }

  playPitch() {
    this.#tone({ type: 'sine', from: 140, to: 55, duration: 0.14, volume: 0.35 });
  }

  /** @param {number} peak Swing intensity reported by the phone. */
  playSwing(peak) {
    const volume = Math.min(0.3, Math.max(0.05, peak / 150));
    this.#burst({ filter: 'bandpass', from: 300, to: 1400, duration: 0.22, volume });
  }

  /** @param {number} quality Contact quality from 0 (barely touched) to 1 (sweet spot). */
  playHit(quality) {
    this.#burst({ filter: 'highpass', from: 1800, to: 900, duration: 0.07, volume: 0.35 + quality * 0.35 });
    this.#tone({ type: 'triangle', from: 220, to: 80, duration: 0.14, volume: 0.25 + quality * 0.3 });
  }

  #createNoiseBuffer() {
    const length = this.#context.sampleRate;
    const buffer = this.#context.createBuffer(1, length, this.#context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) samples[i] = Math.random() * 2 - 1;
    return buffer;
  }

  #envelope(volume, duration) {
    const gain = this.#context.createGain();
    const now = this.#context.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(SILENCE, now + duration);
    return gain;
  }

  #tone({ type, from, to, duration, volume }) {
    if (!this.#context) return;

    const now = this.#context.currentTime;
    const oscillator = this.#context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);

    oscillator.connect(this.#envelope(volume, duration)).connect(this.#context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  #burst({ filter, from, to, duration, volume }) {
    if (!this.#context) return;

    const now = this.#context.currentTime;
    const source = this.#context.createBufferSource();
    source.buffer = this.#noiseBuffer;

    const biquad = this.#context.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(from, now);
    biquad.frequency.exponentialRampToValueAtTime(to, now + duration);

    source.connect(biquad).connect(this.#envelope(volume, duration)).connect(this.#context.destination);
    source.start(now);
    source.stop(now + duration);
  }
}
