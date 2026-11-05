import * as THREE from 'three';

export const RADIAL_SEGMENTS = 28;

const UP = new THREE.Vector3(0, 1, 0);
const MIN_LENGTH = 1e-3;
const direction = new THREE.Vector3();

export function createMaterial(color, { roughness = 0.7, metalness = 0, side = THREE.FrontSide } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, side });
}

export function addMesh(parent, geometry, material, { castShadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  parent.add(mesh);
  return mesh;
}

/** Adds a sphere, optionally squashed into an ellipsoid via per-axis scale. */
export function addEllipsoid(parent, radius, material, scale = [1, 1, 1]) {
  const geometry = new THREE.SphereGeometry(radius, RADIAL_SEGMENTS, 20);
  geometry.scale(...scale);
  return addMesh(parent, geometry, material);
}

/**
 * Adds a unit-length cylinder that narrows from `startRadius` to `endRadius`.
 * Position it with `stretchBetween`; `crossSection` makes it elliptical.
 */
export function addTaperedLimb(parent, startRadius, endRadius, material, crossSection = [1, 1]) {
  const geometry = new THREE.CylinderGeometry(endRadius, startRadius, 1, RADIAL_SEGMENTS, 1);
  geometry.scale(crossSection[0], 1, crossSection[1]);
  return addMesh(parent, geometry, material);
}

/** Orients and stretches a unit-length limb mesh so it spans `start` to `end`. */
export function stretchBetween(mesh, start, end) {
  direction.subVectors(end, start);
  const length = direction.length();

  mesh.position.addVectors(start, end).multiplyScalar(0.5);
  mesh.scale.y = Math.max(length, MIN_LENGTH);

  if (length > MIN_LENGTH) {
    mesh.quaternion.setFromUnitVectors(UP, direction.divideScalar(length));
  }
}
