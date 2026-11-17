// Solmar Bay — pedestrians.
// One job: people strolling the sidewalks who panic and run when a car
// screams past, and who can be knocked down (which raises the wanted level).

import * as THREE from 'three';
import { CFG, clamp, dist2D, randRange } from './config.js';
import { onRoad } from './world.js';

const SHIRT_COLORS = [0xe8b04a, 0x4a90d8, 0xd84a7a, 0x7ab04a, 0xe8e8e8, 0x8a6fc0, 0x4ad8c0];

export class PedManager {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.peds = [];
    this.onPedHit = null; // (ped) => void, wired by main.js
    for (let i = 0; i < CFG.pedCount; i++) {
      this.spawnPed(true);
    }
  }

  spawnPed(anywhere = false) {
    const rng = this.rng;
    // Sidewalk spot: just off a road centreline.
    let x;
    let z;
    let tries = 0;
    do {
      x = randRange(rng, -260, 260);
      z = randRange(rng, -260, 260);
      tries++;
    } while (tries < 20 && onRoad(x, z));
    const ped = this.makePed(x, z);
    this.peds.push(ped);
    return ped;
  }

  makePed(x, z) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({
      color: SHIRT_COLORS[Math.floor(this.rng() * SHIRT_COLORS.length)],
    });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89060 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x33333c });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.36), shirt);
    body.position.y = 1.1;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skin);
    head.position.y = 1.78;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.26), pants);
    legL.position.set(-0.15, 0.34, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.26), pants);
    legR.position.set(0.15, 0.34, 0);
    g.add(body, head, legL, legR);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const angle = this.rng() * Math.PI * 2;
    return {
      group: g, legL, legR, x, z,
      heading: angle,
      speed: randRange(this.rng, 1.2, 2.2),
      phase: this.rng() * 6,
      panic: 0,
      down: false,
      downTimer: 0,
      wanderTimer: randRange(this.rng, 2, 6),
    };
  }

  step(dt, cars, player) {
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        ped.group.rotation.x = -Math.PI / 2 + 0.15;
        if (ped.downTimer <= 0) {
          // Gets back up, shaken, and walks away.
          ped.down = false;
          ped.panic = 3;
          ped.group.rotation.x = 0;
        }
        continue;
      }
      // Panic: a fast car nearby, or the player sprinting at them.
      let threat = null;
      for (const car of cars) {
        if (!car.alive) continue;
        const d = dist2D(ped.x, ped.z, car.x, car.z);
        if (d < 10 && Math.abs(car.speed) > 8) { threat = car; break; }
      }
      if (threat) ped.panic = 2.5;
      if (ped.panic > 0) {
        ped.panic -= dt;
        // Run away from the threat.
        const dx = ped.x - (threat ? threat.x : player.x);
        const dz = ped.z - (threat ? threat.z : player.z);
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
        ped.speed = 5.5;
      } else {
        ped.wanderTimer -= dt;
        if (ped.wanderTimer <= 0) {
          ped.wanderTimer = randRange(this.rng, 2, 7);
          ped.heading = this.rng() * Math.PI * 2;
        }
        ped.speed = 1.6;
      }
      let nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
      let nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
      nx = clamp(nx, -272, 360);
      nz = clamp(nz, -272, 272);
      ped.x = nx;
      ped.z = nz;
      ped.phase += dt * ped.speed * 2.4;
      const swing = Math.sin(ped.phase) * 0.55;
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
      ped.group.position.set(ped.x, 0, ped.z);
      ped.group.rotation.y = ped.heading;

      // Knocked down by a moving car (or the player's car).
      for (const car of cars) {
        if (!car.alive || Math.abs(car.speed) < 3) continue;
        if (dist2D(ped.x, ped.z, car.x, car.z) < 1.9) {
          ped.down = true;
          ped.downTimer = 6;
          ped.group.rotation.x = -Math.PI / 2 + 0.15;
          if (this.onPedHit) this.onPedHit(ped);
          break;
        }
      }
    }
  }
}
