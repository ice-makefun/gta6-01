// Solmar Bay — the player on foot.
// One job: third-person walking with a mouse-orbit camera, entering and
// leaving cars, and the chase camera that follows a driven car.

import * as THREE from 'three';
import { CFG, clamp } from './config.js';
import { resolveBuildingCollision } from './world.js';

export class Player {
  constructor(scene, x, z) {
    this.x = x;
    this.z = z;
    this.heading = 0; // facing, radians
    this.camYaw = 0; // camera orbit around the player
    this.camPitch = 0.32;
    this.camDist = 7;
    this.health = CFG.playerHealth;
    this.money = 0;
    this.inCar = null; // Car instance or null
    this.walkPhase = 0;
    this.moving = false;
    this.group = new THREE.Group();
    // Simple low-poly Rico: jacket, head, cap, legs that swing while walking.
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6f8e });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a070 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
    const capMat = new THREE.MeshLambertMaterial({ color: 0xe8734a });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.4), jacket);
    this.body.position.y = 1.15;
    this.body.castShadow = true;
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
    this.head.position.y = 1.85;
    this.head.castShadow = true;
    this.cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.46), capMat);
    this.cap.position.y = 2.1;
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), pants);
    this.legL.position.set(-0.18, 0.35, 0);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), pants);
    this.legR.position.set(0.18, 0.35, 0);
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), jacket);
    this.armL.position.set(-0.48, 1.15, 0);
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), jacket);
    this.armR.position.set(0.48, 1.15, 0);
    this.group.add(this.body, this.head, this.cap, this.legL, this.legR, this.armL, this.armR);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.scene = scene;
  }

  // On-foot step. keys: {w,a,s,d,shift}. camYaw is driven by the mouse.
  stepOnFoot(dt, keys, colliders, cars) {
    let mx = 0;
    let mz = 0;
    if (keys.w) mz -= 1;
    if (keys.s) mz += 1;
    if (keys.a) mx -= 1;
    if (keys.d) mx += 1;
    this.moving = mx !== 0 || mz !== 0;
    if (this.moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      // Movement is relative to the camera yaw.
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const wx = mx * cos - mz * sin;
      const wz = mx * sin + mz * cos;
      const speed = keys.shift ? CFG.runSpeed : CFG.walkSpeed;
      let nx = this.x + wx * speed * dt;
      let nz = this.z + wz * speed * dt;
      const fixed = resolveBuildingCollision(nx, nz, CFG.playerRadius, colliders);
      nx = fixed.x;
      nz = fixed.z;
      // Don't walk through parked/driven cars.
      for (const c of cars) {
        if (!c.alive) continue;
        const dx = nx - c.x;
        const dz = nz - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.2 && d > 0.001) {
          nx = c.x + (dx / d) * 2.2;
          nz = c.z + (dz / d) * 2.2;
        }
      }
      this.x = clamp(nx, -CFG.cityHalf - 8, 368);
      this.z = clamp(nz, -CFG.cityHalf - 8, CFG.cityHalf + 8);
      this.heading = Math.atan2(wx, wz);
      this.walkPhase += dt * speed * 1.6;
    }
    // Face the movement direction; swing limbs.
    this.group.rotation.y = this.heading;
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.7;
    this.armR.rotation.x = swing * 0.7;
    this.group.position.set(this.x, 0, this.z);
    this.group.visible = true;
  }

  enterCar(car) {
    this.inCar = car;
    this.group.visible = false;
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    // Step out to the driver's side.
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.x = car.x + side.x * 2.4;
    this.z = car.z + side.z * 2.4;
    this.heading = car.heading;
    this.group.visible = true;
    this.group.position.set(this.x, 0, this.z);
  }

  // Camera: orbit behind the player on foot, chase-cam behind the car.
  updateCamera(camera, dt) {
    const target = new THREE.Vector3();
    if (this.inCar) {
      const car = this.inCar;
      // Chase cam: behind the car, lerping toward the car's heading.
      const back = { x: -Math.sin(car.heading), z: -Math.cos(car.heading) };
      const desired = new THREE.Vector3(
        car.x + back.x * 10,
        4.6,
        car.z + back.z * 10
      );
      camera.position.lerp(desired, Math.min(1, dt * 5));
      target.set(car.x + Math.sin(car.heading) * 6, 1.6, car.z + Math.cos(car.heading) * 6);
      camera.lookAt(target);
    } else {
      const cx = this.x - Math.sin(this.camYaw) * this.camDist * Math.cos(this.camPitch);
      const cz = this.z - Math.cos(this.camYaw) * this.camDist * Math.cos(this.camPitch);
      const cy = 2.2 + Math.sin(this.camPitch) * this.camDist;
      camera.position.set(cx, cy, cz);
      target.set(this.x, 1.6, this.z);
      camera.lookAt(target);
    }
  }
}
