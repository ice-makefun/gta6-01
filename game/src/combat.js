// Solmar Bay — combat.
// One job: the player's pistol (hitscan raycast, headshot bonus, reload,
// muzzle flash and tracer) and the rival Vultures who shoot back.

import * as THREE from 'three';
import { CFG, clamp, dist2D } from './config.js';

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.ammo = CFG.pistolMag;
    this.reserve = Infinity;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.enemies = [];
    this.onEnemyKilled = null; // (enemy) => void
    this.onPlayerShot = null; // () => void (enemy bullet hits the player)
    // Muzzle flash: a bright sprite at the gun, shown for a few frames.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.flashTimer = 0;
    scene.add(this.flash);
    // Tracer pool.
    this.tracers = [];
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 8; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1), tracerMat.clone());
      t.visible = false;
      scene.add(t);
      this.tracers.push({ mesh: t, life: 0 });
    }
    this.raycaster = new THREE.Raycaster();
  }

  spawnEnemy(x, z, rng) {
    const g = new THREE.Group();
    const vest = new THREE.MeshLambertMaterial({ color: CFG.enemyColor });
    const skin = new THREE.MeshLambertMaterial({ color: 0xb08050 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.4), vest);
    body.position.y = 1.15;
    body.castShadow = true;
    body.userData.enemyPart = 'body';
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
    head.position.y = 1.85;
    head.userData.enemyPart = 'head';
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshLambertMaterial({ color: 0x2a1a2a }));
    cap.position.y = 2.08;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.28), pants);
    legL.position.set(-0.17, 0.35, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.28), pants);
    legR.position.set(0.17, 0.35, 0);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x141414 }));
    gun.position.set(0.45, 1.3, 0.4);
    g.add(body, head, cap, legL, legR, gun);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const enemy = {
      group: g, body, head, legL, legR,
      x, z, heading: rng() * Math.PI * 2,
      health: CFG.enemyHealth,
      shootTimer: 1 + rng() * 1.5,
      moveTimer: 0,
      alive: true,
      phase: rng() * 6,
    };
    body.userData.enemy = enemy;
    head.userData.enemy = enemy;
    this.enemies.push(enemy);
    return enemy;
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
  }

  // Player fires from the camera toward the crosshair.
  shoot(camera, player) {
    if (this.cooldown > 0 || this.reloading) return false;
    if (this.ammo <= 0) {
      this.startReload();
      return false;
    }
    this.cooldown = 0.22;
    this.ammo -= 1;
    if (this.audio) this.audio.gunshot();
    // Muzzle flash at the camera, slightly right and down.
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone().add(dir.clone().multiplyScalar(1.2));
    origin.x += 0.35;
    origin.y -= 0.25;
    this.flash.position.copy(origin);
    this.flash.lookAt(camera.position.clone().add(dir.clone().multiplyScalar(3)));
    this.flash.material.opacity = 1;
    this.flashTimer = 0.06;
    // Raycast against enemies first, then the world is a miss.
    this.raycaster.set(camera.position, dir);
    this.raycaster.far = CFG.pistolRange;
    const targets = [];
    for (const e of this.enemies) {
      if (e.alive) targets.push(e.body, e.head);
    }
    const hits = this.raycaster.intersectObjects(targets, false);
    let endPoint = camera.position.clone().add(dir.clone().multiplyScalar(CFG.pistolRange));
    if (hits.length > 0) {
      const hit = hits[0];
      endPoint = hit.point.clone();
      const enemy = hit.object.userData.enemy;
      const isHead = hit.object.userData.enemyPart === 'head';
      const dmg = isHead ? CFG.pistolHeadshot : CFG.pistolDamage;
      enemy.health -= dmg;
      if (this.audio) this.audio.hitmark(isHead);
      if (enemy.health <= 0 && enemy.alive) {
        enemy.alive = false;
        enemy.group.rotation.x = -Math.PI / 2 + 0.1;
        enemy.group.position.y = 0.3;
        if (this.onEnemyKilled) this.onEnemyKilled(enemy);
      }
    }
    this.spawnTracer(origin, endPoint);
    return true;
  }

  spawnTracer(from, to) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const mid = from.clone().add(to).multiplyScalar(0.5);
    t.mesh.position.copy(mid);
    t.mesh.lookAt(to);
    const len = from.distanceTo(to);
    t.mesh.scale.set(1, 1, Math.max(1, len));
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.9;
    t.life = 0.09;
  }

  startReload() {
    if (this.reloading || this.ammo === CFG.pistolMag) return;
    this.reloading = true;
    this.reloadTimer = 1.1;
    if (this.audio) this.audio.reload();
  }

  step(dt, player, playerPos) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo = CFG.pistolMag;
      }
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.material.opacity = 0;
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    // Enemies: strafe a little, face the player, shoot back with spread.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist2D(e.x, e.z, playerPos.x, playerPos.z);
      e.moveTimer -= dt;
      if (e.moveTimer <= 0) {
        e.moveTimer = 1 + Math.random() * 2;
        e.strafe = (Math.random() - 0.5) * 2;
      }
      e.heading = Math.atan2(playerPos.x - e.x, playerPos.z - e.z);
      // Keep some distance: advance if far, back off if too close.
      let advance = 0;
      if (d > 26) advance = 3.2;
      else if (d < 10) advance = -2;
      e.x += Math.sin(e.heading) * advance * dt + Math.cos(e.heading) * (e.strafe || 0) * 1.5 * dt;
      e.z += Math.cos(e.heading) * advance * dt - Math.sin(e.heading) * (e.strafe || 0) * 1.5 * dt;
      e.x = clamp(e.x, -280, 380);
      e.z = clamp(e.z, -280, 280);
      e.phase += dt * 4;
      const swing = Math.sin(e.phase) * 0.4;
      e.legL.rotation.x = swing;
      e.legR.rotation.x = -swing;
      e.group.position.set(e.x, 0, e.z);
      e.group.rotation.y = e.heading;
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < 55) {
        e.shootTimer = 1.1 + Math.random() * 1.2;
        // Enemy shot: a tracer from the enemy toward the player, with spread.
        const from = new THREE.Vector3(e.x, 1.4, e.z);
        const to = new THREE.Vector3(
          playerPos.x + (Math.random() - 0.5) * 3,
          1.2,
          playerPos.z + (Math.random() - 0.5) * 3
        );
        this.spawnTracer(from, to);
        if (this.audio) this.audio.enemyShot();
        // Hit chance falls with distance.
        const hitChance = clamp(0.42 - d * 0.005, 0.08, 0.42);
        if (Math.random() < hitChance && this.onPlayerShot) this.onPlayerShot();
      }
    }
  }
}
