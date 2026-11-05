import {
  FilesetResolver,
  PoseLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { POSE_MODEL } from './config.js';

const HAVE_CURRENT_DATA = 2;
const OVERLAY_COLOR = '#33ff33';
const OVERLAY_DOT = 4;

/** Captures the webcam and runs MediaPipe pose detection on each new frame. */
export class PoseTracker {
  #video;
  #overlay;
  #context;
  #onError;
  #landmarker = null;
  #lastVideoTime = -1;

  /**
   * @param {object} options
   * @param {HTMLVideoElement} options.video
   * @param {HTMLCanvasElement} options.overlay Canvas used to draw detected landmarks.
   * @param {(message: string) => void} options.onError
   */
  constructor({ video, overlay, onError }) {
    this.#video = video;
    this.#overlay = overlay;
    this.#context = overlay.getContext('2d');
    this.#onError = onError;
  }

  get isReady() {
    return this.#landmarker !== null;
  }

  async start() {
    await Promise.all([this.#startCamera(), this.#loadModel()]);
  }

  /**
   * Runs detection if the video has a new frame.
   * @returns {{world: object[], image: object[]} | null}
   */
  detect(timestamp) {
    const video = this.#video;
    if (!this.#landmarker || video.readyState < HAVE_CURRENT_DATA) return null;
    if (video.currentTime === this.#lastVideoTime) return null;
    this.#lastVideoTime = video.currentTime;

    const result = this.#landmarker.detectForVideo(video, timestamp);
    const world = result.worldLandmarks[0];
    const image = result.landmarks[0];
    if (!world || !image) return null;

    this.#drawOverlay(image);
    return { world, image };
  }

  async #startCamera() {
    try {
      this.#video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
    } catch {
      this.#onError('Allow webcam access');
    }
  }

  async #loadModel() {
    try {
      const fileset = await FilesetResolver.forVisionTasks(POSE_MODEL.wasmRoot);
      const create = (delegate) =>
        PoseLandmarker.createFromOptions(fileset, {
          runningMode: 'VIDEO',
          numPoses: 1,
          baseOptions: { modelAssetPath: POSE_MODEL.modelUrl, delegate },
        });

      try {
        this.#landmarker = await create('GPU');
      } catch {
        this.#landmarker = await create('CPU');
      }
    } catch {
      this.#onError('Pose model failed to load');
    }
  }

  #drawOverlay(landmarks) {
    const { width, height } = this.#overlay;
    this.#context.clearRect(0, 0, width, height);
    this.#context.fillStyle = OVERLAY_COLOR;

    for (const { x, y } of landmarks) {
      this.#context.fillRect(
        x * width - OVERLAY_DOT / 2,
        y * height - OVERLAY_DOT / 2,
        OVERLAY_DOT,
        OVERLAY_DOT,
      );
    }
  }
}
