import * as THREE from 'three';
import { FIELD, STRIKE_ZONE } from './config.js';

const COLORS = Object.freeze({
  sky: 0x7fb2e5,
  dirt: 0xb5653a,
  mound: 0xa8582f,
  plate: 0xe8e4d8,
  line: 0xffffff,
  fence: 0x1d4d2b,
  fenceTop: 0xf2c230,
});

const GRASS_STRIPES = Object.freeze({ light: '#2f7230', dark: '#2a6a2c' });
const GROUND_SIZE = 400;
const LINE_HEIGHT = 0.03;

function matte(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...options });
}

function lineMaterial(opacity = 1) {
  return new THREE.LineBasicMaterial({ color: COLORS.line, transparent: opacity < 1, opacity });
}

/** Builds the static environment and adds it to the scene. */
export function createStadium(scene) {
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 90, 260);

  addLighting(scene);
  addGrass(scene);
  addInfield(scene);
  addBattersBoxes(scene);
  addFoulLines(scene);
  addDistanceMarkers(scene);
  addStrikeZone(scene);
  addFence(scene);
}

function addLighting(scene) {
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x446644, 1.1);

  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(6, 14, 4);
  sun.target.position.set(-0.5, 0, -9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });

  scene.add(hemisphere, sun, sun.target);
}

function createStripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;

  const context = canvas.getContext('2d');
  context.fillStyle = GRASS_STRIPES.light;
  context.fillRect(0, 0, 2, 1);
  context.fillStyle = GRASS_STRIPES.dark;
  context.fillRect(0, 1, 2, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.repeat.set(1, 40);
  return texture;
}

function addGrass(scene) {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ map: createStripeTexture(), roughness: 0.95 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
}

function createHomePlateShape() {
  const half = 0.215;
  const shape = new THREE.Shape();
  // Shape Y maps to -Z once laid flat, so the point faces the catcher (+Z).
  shape.moveTo(-half, half);
  shape.lineTo(half, half);
  shape.lineTo(half, 0);
  shape.lineTo(0, -half);
  shape.lineTo(-half, 0);
  shape.closePath();
  return shape;
}

function addInfield(scene) {
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(14, 64), matte(COLORS.dirt));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0, 0.01, -8);
  dirt.receiveShadow = true;

  const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 0.25, 32), matte(COLORS.mound));
  mound.position.set(0, 0.1, FIELD.moundZ);
  mound.receiveShadow = true;

  const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.15), matte(COLORS.plate));
  rubber.position.set(0, FIELD.moundTop + 0.015, FIELD.moundZ);

  const plate = new THREE.Mesh(
    new THREE.ShapeGeometry(createHomePlateShape()),
    matte(COLORS.plate, { side: THREE.DoubleSide }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, LINE_HEIGHT, FIELD.plateZ);

  scene.add(dirt, mound, rubber, plate);
}

function createGroundRectangle(width, depth, x, z) {
  const hw = width / 2;
  const hd = depth / 2;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, 0, -hd),
    new THREE.Vector3(hw, 0, -hd),
    new THREE.Vector3(hw, 0, hd),
    new THREE.Vector3(-hw, 0, hd),
  ]);
  const outline = new THREE.LineLoop(geometry, lineMaterial());
  outline.position.set(x, LINE_HEIGHT, z);
  return outline;
}

function addBattersBoxes(scene) {
  for (const x of [-1.4, 1.4]) {
    scene.add(createGroundRectangle(1.2, 2, x, FIELD.plateZ));
  }
}

function addFoulLines(scene) {
  const material = new THREE.MeshBasicMaterial({ color: COLORS.line });

  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, FIELD.fenceRadius), material);
    const bearing = side * (Math.PI - FIELD.foulAngle);
    line.rotation.y = bearing;
    line.position.set(
      Math.sin(bearing) * FIELD.fenceRadius * 0.5,
      LINE_HEIGHT,
      Math.cos(bearing) * FIELD.fenceRadius * 0.5,
    );
    scene.add(line);
  }
}

function addDistanceMarkers(scene) {
  const material = new THREE.MeshBasicMaterial({
    color: COLORS.line,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const thetaStart = Math.PI / 2 - FIELD.foulAngle;
  const thetaLength = FIELD.foulAngle * 2;

  for (const distance of FIELD.distanceMarkers) {
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(distance - 0.12, distance + 0.12, 128, 1, thetaStart, thetaLength),
      material,
    );
    arc.rotation.x = -Math.PI / 2;
    arc.position.y = 0.02;
    scene.add(arc);
  }
}

function addStrikeZone(scene) {
  const { halfWidth, bottom, top } = STRIKE_ZONE;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfWidth, bottom, FIELD.plateZ),
    new THREE.Vector3(halfWidth, bottom, FIELD.plateZ),
    new THREE.Vector3(halfWidth, top, FIELD.plateZ),
    new THREE.Vector3(-halfWidth, top, FIELD.plateZ),
  ]);
  scene.add(new THREE.LineLoop(geometry, lineMaterial(0.35)));
}

function addFence(scene) {
  const thetaStart = Math.PI - FIELD.foulAngle;
  const thetaLength = FIELD.foulAngle * 2;
  const segments = 96;

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(
      FIELD.fenceRadius, FIELD.fenceRadius, FIELD.fenceHeight, segments, 1, true, thetaStart, thetaLength,
    ),
    matte(COLORS.fence, { side: THREE.DoubleSide }),
  );
  wall.position.y = FIELD.fenceHeight / 2;

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(
      FIELD.fenceRadius, FIELD.fenceRadius, 0.2, segments, 1, true, thetaStart, thetaLength,
    ),
    matte(COLORS.fenceTop, { side: THREE.DoubleSide }),
  );
  cap.position.y = FIELD.fenceHeight;

  scene.add(wall, cap);
}
