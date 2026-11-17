// Solmar Bay — traffic.
// One job: civilian cars that cruise the road grid, turn at intersections,
// brake behind the car ahead, and stop for nothing else.

import { CFG, randRange, wrapAngle } from './config.js';
import { roadLines } from './world.js';
import { Car, carColorAt } from './vehicles.js';

export class TrafficManager {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.cars = [];
    const lines = roadLines();
    for (let i = 0; i < CFG.trafficCount; i++) {
      const horizontal = rng() < 0.5;
      const line = lines[Math.floor(rng() * lines.length)];
      const along = randRange(rng, -260, 260);
      const dir = rng() < 0.5 ? 1 : -1;
      const x = horizontal ? along : line;
      const z = horizontal ? line : along;
      // Heading: cars drive along +Z on vertical roads, +X on horizontal ones.
      const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const car = new Car(scene, x, z, heading, carColorAt(i));
      car.speed = CFG.trafficSpeed * randRange(rng, 0.8, 1.15);
      car.cruise = car.speed;
      this.cars.push(car);
    }
  }

  allCars() {
    return this.cars;
  }

  step(dt, playerCar) {
    const lines = roadLines();
    for (const car of this.cars) {
      if (!car.alive) continue;
      // Car ahead on the same lane? Brake.
      let ahead = Infinity;
      const fwd = car.forward();
      for (const other of this.cars) {
        if (other === car || !other.alive) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const along = dx * fwd.x + dz * fwd.z;
        const side = Math.abs(dx * fwd.z - dz * fwd.x);
        if (along > 0 && along < 16 && side < 2.5) ahead = Math.min(ahead, along);
      }
      if (playerCar && playerCar.alive) {
        const dx = playerCar.x - car.x;
        const dz = playerCar.z - car.z;
        const along = dx * fwd.x + dz * fwd.z;
        const side = Math.abs(dx * fwd.z - dz * fwd.x);
        if (along > 0 && along < 16 && side < 2.5) ahead = Math.min(ahead, along);
      }
      const wantSpeed = ahead < 14 ? 0 : car.cruise;
      const input = { throttle: 0, steer: 0, brake: false, handbrake: false };
      if (car.speed < wantSpeed - 0.5) input.throttle = 0.6;
      else if (car.speed > wantSpeed + 0.5) input.brake = true;

      // At an intersection, sometimes turn: snap the heading toward a new road.
      const nearX = lines.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
      const nearZ = lines.reduce((a, b) => (Math.abs(b - car.z) < Math.abs(a - car.z) ? b : a));
      const atJunction = Math.abs(car.x - nearX) < 2.5 && Math.abs(car.z - nearZ) < 2.5;
      if (atJunction && !car.turnedAt) {
        car.turnedAt = `${nearX},${nearZ}`;
        const r = this.rng();
        if (r < 0.3) {
          // Turn left or right: pick a perpendicular heading.
          const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
          const cur = headings.reduce((a, b) => (Math.abs(wrapAngle(b - car.heading)) < Math.abs(wrapAngle(a - car.heading)) ? b : a));
          const perp = headings.filter((h) => Math.abs(wrapAngle(h - cur)) > 1.5);
          car.targetHeading = perp[Math.floor(this.rng() * perp.length)];
        }
      } else if (!atJunction) {
        car.turnedAt = null;
      }
      if (car.targetHeading !== undefined) {
        const diff = wrapAngle(car.targetHeading - car.heading);
        input.steer = Math.max(-1, Math.min(1, diff * 2));
        if (Math.abs(diff) < 0.05) car.targetHeading = undefined;
      }
      car.step(dt, input, this.colliders, this.cars);
    }
  }
}
