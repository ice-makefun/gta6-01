// Solmar Bay — cars.
// One job: build a car mesh and drive it with simple arcade physics
// (acceleration, braking, steering that weakens with speed, handbrake drift,
// AABB building collision and a soft car-to-car push).

import * as THREE from 'three';
import { CFG, clamp } from './config.js';
import { resolveBuildingCollision as resolveBuildings } from './world.js';

const CAR_COLORS = [0xe8e8e8, 0x3a6fd8, 0xd84a4a, 0x4ad8a0, 0xf2c14a, 0x8a8a96, 0x2c2c34, 0xd8d8d8, 0x7a4ad8];

export function carColorAt(i) {
  return CAR_COLORS[i % CAR_COLORS.length];
}

// Build a low-poly car. `color` is the body colour; police cars get a light bar.
export function buildCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c2028 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), darkMat);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.36, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  // Headlights and brake lights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    h.position.set(hx, 0.62, 2.22);
    g.add(h);
  }
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const brakeL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), brakeMat);
  brakeL.position.set(-0.6, 0.62, -2.22);
  g.add(brakeL);
  const brakeR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), brakeMat);
  brakeR.position.set(0.6, 0.62, -2.22);
  g.add(brakeR);
  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    blue.position.x = 0.35;
    lightBar.add(red, blue);
    lightBar.position.set(0, 1.5, -0.2);
    g.add(lightBar);
  }
  return { group: g, wheels, brakeL, brakeR, lightBar };
}

export class Car {
  constructor(scene, x, z, heading, color, isPolice = false) {
    const built = buildCarMesh(color, isPolice);
    this.group = built.group;
    this.wheels = built.wheels;
    this.brakeL = built.brakeL;
    this.brakeR = built.brakeR;
    this.lightBar = built.lightBar;
    this.mesh = this.group;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.isPolice = isPolice;
    this.color = color;
    this.spin = 0;
    this.braking = false;
    this.handbrake = false;
    this.alive = true;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    scene.add(this.group);
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Arcade step. input: {throttle -1..1, steer -1..1, brake, handbrake}
  // colliders: building AABBs; others: other cars to push away from.
  // Returns {hitBuilding} for spark/sound hooks.
  step(dt, input, colliders, others) {
    const fwd = this.forward();
    const speedSign = this.speed >= 0 ? 1 : -1;
    // Steering: full lock at low speed, weaker as speed rises.
    const steerTarget = clamp(input.steer, -1, 1) * (this.handbrake ? 1.4 : 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const steerFactor = clamp(Math.abs(this.speed) / 8, 0, 1) * (1 - clamp(Math.abs(this.speed) / CFG.carMaxSpeed, 0, 0.6));
    // Turning reverses when reversing, like a real car.
    this.heading += this.steer * CFG.carTurnRate * steerFactor * speedSign * dt;
    // Longitudinal.
    if (input.throttle > 0) this.speed += CFG.carAccel * input.throttle * dt;
    else if (input.throttle < 0) this.speed += CFG.carReverseAccel * input.throttle * dt;
    if (input.brake) {
      const before = this.speed;
      this.speed -= Math.sign(this.speed) * CFG.carBrake * dt;
      if (Math.sign(before) !== Math.sign(this.speed)) this.speed = 0;
    }
    this.braking = !!input.brake;
    this.handbrake = !!input.handbrake;
    // Drag + rolling resistance.
    this.speed -= this.speed * (this.handbrake ? 1.4 : 0.35) * dt;
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0) this.speed = 0;
    this.speed = clamp(this.speed, -CFG.carMaxReverse, CFG.carMaxSpeed);

    const nf = this.forward();
    let nx = this.x + nf.x * this.speed * dt;
    let nz = this.z + nf.z * this.speed * dt;
    let hitBuilding = false;
    const before = { x: nx, z: nz };
    const fixed = resolveBuildings(nx, nz, 1.5, colliders);
    nx = fixed.x;
    nz = fixed.z;
    if (Math.abs(fixed.x - before.x) > 0.001 || Math.abs(fixed.z - before.z) > 0.001) {
      hitBuilding = true;
      this.speed *= 0.45; // thud: lose speed on impact
    }
    // Soft push away from other cars.
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const dx = nx - o.x;
      const dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.001) {
        const push = (3.4 - d) * 0.5;
        nx += (dx / d) * push;
        nz += (dz / d) * push;
        this.speed *= 0.85;
      }
    }
    // Keep inside the drivable world (city + beach).
    nx = clamp(nx, -CFG.cityHalf - 8, 368);
    nz = clamp(nz, -CFG.cityHalf - 8, CFG.cityHalf + 8);
    this.x = nx;
    this.z = nz;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    // Wheel spin + brake light glow.
    this.spin += this.speed * dt * 2.2;
    for (const w of this.wheels) w.rotation.x = this.spin;
    const brakeColor = this.braking ? 0xff6060 : 0xff2a2a;
    this.brakeL.material.color.setHex(brakeColor);
    this.brakeR.material.color.setHex(brakeColor);
    // Police light bar flash.
    if (this.lightBar) {
      const t = performance.now() / 1000;
      this.lightBar.children[0].material.color.setHex(Math.floor(t * 4) % 2 === 0 ? 0xff2020 : 0x550000);
      this.lightBar.children[1].material.color.setHex(Math.floor(t * 4) % 2 === 0 ? 0x102060 : 0x2050ff);
    }
    return { hitBuilding };
  }

  remove(scene) {
    this.alive = false;
    scene.remove(this.group);
  }
}
