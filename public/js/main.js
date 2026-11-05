import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { Ball } from './ball.js';
import { Bat } from './bat.js';
import { CameraRig } from './camera-rig.js';
import { CAMERA, SWING } from './config.js';
import { Game } from './game.js';
import { Banner, Hud } from './hud.js';
import { PhoneInput } from './phone-input.js';
import { PitchingMachine } from './pitching-machine.js';
import { PoseTracker } from './pose-tracker.js';
import { SoundBank } from './sound-bank.js';
import { createStadium } from './stadium.js';

const MAX_FRAME_SECONDS = 0.05;
const MAX_PIXEL_RATIO = 2;

// Rendering

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, 400);
const cameraRig = new CameraRig(camera);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// World and game objects

createStadium(scene);

const machine = new PitchingMachine(scene);
const avatar = new Avatar(scene);
const bat = new Bat(scene);
const ball = new Ball(scene);

const sounds = new SoundBank();
const hud = new Hud(document.getElementById('hud'));
const banner = new Banner(document.getElementById('banner'));
const game = new Game({
  ball,
  machine,
  sounds,
  announce: (text, durationMs) => banner.show(text, durationMs),
});

// Input

const phone = new PhoneInput();
phone.connect();

const tracker = new PoseTracker({
  video: document.getElementById('webcam'),
  overlay: document.getElementById('pose-overlay'),
  onError: (message) => banner.show(message, 4000),
});
tracker.start();

function unlockAudio() {
  sounds.unlock();
}

window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', (event) => {
  unlockAudio();

  if (event.code === 'Space') {
    event.preventDefault();
    phone.triggerSwing(SWING.keyboardPeak);
  } else if (event.code === 'KeyC') {
    phone.calibrate();
  }
});

// Main loop

function describeCamera() {
  if (!tracker.isReady) return 'loading';
  return avatar.isTracking ? 'tracking' : 'no body';
}

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);

  const dt = Math.min(clock.getDelta(), MAX_FRAME_SECONDS);
  const now = performance.now();

  const pose = tracker.detect(now);
  if (pose) avatar.update(pose.world);

  if (avatar.isTracking) bat.setHandlePosition(avatar.grip);
  bat.setOrientation(phone.orientation);

  const swing = phone.takeDueSwing(now);
  if (swing) game.resolveSwing(swing.peak, phone.orientation.yaw);

  game.update(dt);
  machine.update(dt);
  cameraRig.update(dt, game.followTarget);

  hud.render({
    phoneConnected: phone.isConnected(now),
    cameraStatus: describeCamera(),
    orientation: phone.orientation,
    peak: phone.peak,
    swinging: phone.swinging,
    stats: game.stats,
  });

  renderer.render(scene, camera);
}

frame();
