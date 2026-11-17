// Solmar Bay — the Solmar Bay Police Department.
// One job: when the wanted level rises, spawn police cars that chase and ram
// the player's car, and foot cops who close in and bust the player if they
// stay close for three seconds while wanted.

import * as THREE from 'three';
import { CFG, clamp, dist2D, wrapAngle } from './config.js';
import { Car } from './vehicles.js';
import { nearestRoadPoint } from './world.js';

export class PoliceManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    this.cops = [];
    this.onBusted = null; // () => void, wired by main.js
    this.spawnTimer = 0;
  }

  // Spawn one police car immediately (used by the chase screenshot staging).
  spawnChaseCar(x, z, heading) {
    const car = new Car(this.scene, x, z, heading, CFG.policeColor, true);
    car.cruise = 26;
    this.cars.push(car);
    return car;
  }

  wantedCarCount(wanted) {
    if (wanted <= 0) return 0;
    if (wanted === 1) return 1;
    if (wanted === 2) return 2;
    if (wanted === 3) return 3;
    return 4;
  }

  step(dt, wanted, player, playerCar) {
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    const wantCars = this.wantedCarCount(wanted);

    // Spawn / despawn police cars to match the wanted level.
    this.spawnTimer -= dt;
    if (this.cars.length < wantCars && this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const near = nearestRoadPoint(px + (Math.random() - 0.5) * 120, pz + (Math.random() - 0.5) * 120);
      const car = new Car(this.scene, near.x, near.z, Math.random() * Math.PI * 2, CFG.policeColor, true);
      car.cruise = 26;
      this.cars.push(car);
    }
    while (this.cars.length > wantCars) {
      const car = this.cars.pop();
      car.remove(this.scene);
    }
    if (wanted === 0) {
      for (const cop of this.cops) this.scene.remove(cop.group);
      this.cops = [];
    }

    // Chase: steer toward the player and ram.
    for (const car of this.cars) {
      const dx = px - car.x;
      const dz = pz - car.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      const diff = wrapAngle(targetHeading - car.heading);
      const input = {
        throttle: dist > 6 ? 1 : 0.4,
        steer: clamp(diff * 1.6, -1, 1),
        brake: dist < 4 && Math.abs(car.speed) > 4,
        handbrake: false,
      };
      const others = [...this.cars];
      const res = car.step(dt, input, this.colliders, others);
      if (res.hitBuilding) car.speed *= 0.5;
      // Ramming the player's car slows it and shakes the camera (handled by main).
      if (playerCar && dist < 3.6) {
        playerCar.speed *= 0.92;
      }
    }

    // Foot cops: spawn when wanted and the player is on foot, walk at them.
    if (wanted > 0 && !playerCar && this.cops.length < Math.min(wanted, 3) && this.spawnTimer <= 0) {
      this.spawnTimer = 2;
      const near = nearestRoadPoint(px + (Math.random() - 0.5) * 60, pz + (Math.random() - 0.5) * 60);
      const cop = this.makeCop(near.x, near.z);
      this.cops.push(cop);
    }
    for (const cop of this.cops) {
      const d = dist2D(cop.x, cop.z, player.x, player.z);
      cop.heading = Math.atan2(player.x - cop.x, player.z - cop.z);
      const speed = d > 3 ? 4.2 : 0;
      cop.x += Math.sin(cop.heading) * speed * dt;
      cop.z += Math.cos(cop.heading) * speed * dt;
      cop.phase += dt * speed * 2;
      const swing = Math.sin(cop.phase) * 0.5;
      cop.legL.rotation.x = swing;
      cop.legR.rotation.x = -swing;
      cop.group.position.set(cop.x, 0, cop.z);
      cop.group.rotation.y = cop.heading;
      if (d < 2.6 && wanted > 0) {
        cop.bustTimer += dt;
        if (cop.bustTimer >= 3 && this.onBusted) {
          cop.bustTimer = 0;
          this.onBusted();
        }
      } else {
        cop.bustTimer = 0;
      }
    }
  }

  makeCop(x, z) {
    const g = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f6e });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89060 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.4), navy);
    body.position.y = 1.15;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skin);
    head.position.y = 1.85;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.44), new THREE.MeshLambertMaterial({ color: 0x101840 }));
    cap.position.y = 2.08;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.28), navy);
    legL.position.set(-0.17, 0.35, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.28), navy);
    legR.position.set(0.17, 0.35, 0);
    g.add(body, head, cap, legL, legR);
    g.position.set(x, 0, z);
    this.scene.add(g);
    return { group: g, legL, legR, x, z, heading: 0, phase: 0, bustTimer: 0 };
  }

  nearestCopDistance(player) {
    let best = Infinity;
    for (const cop of this.cops) best = Math.min(best, dist2D(cop.x, cop.z, player.x, player.z));
    return best;
  }

  allCars() {
    return this.cars;
  }
}
