// Solmar Bay — missions and the story.
// One job: the three-mission chain (steal the Comet, outrun the heat, the
// Solmar Job at the Old Pier) plus the 12 free-roam cash pickups, markers
// and the objective text the HUD shows.

import * as THREE from 'three';
import { CFG, dist2D, randRange } from './config.js';
import { Car } from './vehicles.js';
import { nearestRoadPoint } from './world.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'First Wheels',
    brief: 'Curi Comet oranye di Bayfront Ave, lalu antar ke Solmar Garage.',
    objective: 'Curi Comet oranye, antar ke Solmar Garage',
  },
  {
    id: 2,
    name: 'Bayfront Heat',
    brief: 'Polisi mengepungmu! Kabur ke hideout Coral Street dalam 90 detik.',
    objective: 'Kabur ke Coral St Hideout sebelum timer habis',
  },
  {
    id: 3,
    name: 'The Solmar Job',
    brief: 'Ambil paket di Old Pier. Vultures menjaga tempat itu — mereka menembak balik. Antar paket ke drop point.',
    objective: 'Ambil paket di Old Pier, antar ke drop point',
  },
];

export class MissionManager {
  constructor(scene, rng, landmarks, colliders, combat, audio) {
    this.scene = scene;
    this.rng = rng;
    this.landmarks = landmarks;
    this.colliders = colliders;
    this.combat = combat;
    this.audio = audio;
    this.activeIndex = 0; // 0-based; -1 means story complete
    this.completed = [false, false, false];
    this.stage = 'steal'; // mission 1 stages: steal -> deliver
    this.timer = 0;
    this.hasPackage = false;
    this.marker = null;
    this.markerRing = null;
    this.cashPickups = [];
    this.onMissionComplete = null; // (mission) => void
    this.onMissionFailed = null; // (reason) => void
    this.onWantedChange = null; // (level) => void
    this.banner = ''; // short text for the HUD banner
    this.buildMarker();
    this.spawnComet();
    this.spawnCash();
  }

  buildMarker() {
    // A glowing ring + beam at the current objective.
    const ringGeo = new THREE.RingGeometry(2.6, 3.4, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.position.y = 0.15;
    this.scene.add(this.markerRing);
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 30, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(beamGeo, beamMat);
    this.marker.position.y = 15;
    this.scene.add(this.marker);
  }

  spawnComet() {
    // The orange Comet waits parked on Bayfront Ave (road x=240, z=-40).
    this.comet = new Car(this.scene, 240, -40, Math.PI / 2, CFG.cometColor);
    this.comet.speed = 0;
    this.cometParked = true;
  }

  spawnCash() {
    const spots = [];
    for (let i = 0; i < CFG.cashPickupCount; i++) {
      let x;
      let z;
      let tries = 0;
      do {
        const near = nearestRoadPoint(randRange(this.rng, -240, 240), randRange(this.rng, -240, 240));
        x = near.x + (this.rng() < 0.5 ? 10 : -10);
        z = near.z + (this.rng() < 0.5 ? 10 : -10);
        tries++;
      } while (tries < 10 && spots.some((s) => dist2D(s.x, s.z, x, z) < 25));
      spots.push({ x, z });
    }
    for (const s of spots) {
      const g = new THREE.Group();
      const bill = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.08, 0.6),
        new THREE.MeshBasicMaterial({ color: 0x7de87a })
      );
      bill.position.y = 0.9;
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x7de87a, transparent: true, opacity: 0.25 })
      );
      glow.position.y = 0.9;
      g.add(bill, glow);
      g.position.set(s.x, 0, s.z);
      this.scene.add(g);
      this.cashPickups.push({ group: g, bill, x: s.x, z: s.z, taken: false, phase: this.rng() * 6 });
    }
  }

  currentMission() {
    if (this.activeIndex < 0) return null;
    return MISSIONS[this.activeIndex];
  }

  objectiveText() {
    const m = this.currentMission();
    if (!m) return 'Cerita selesai — jelajahi Solmar Bay sesukamu. Cari 12 cash pickup hijau.';
    if (this.activeIndex === 0) {
      return this.stage === 'steal'
        ? 'Misi 1 "First Wheels": curi Comet oranye di Bayfront Ave (E untuk masuk mobil)'
        : 'Misi 1 "First Wheels": antar Comet ke Solmar Garage';
    }
    if (this.activeIndex === 1) return `Misi 2 "Bayfront Heat": kabur ke Coral St Hideout — ${Math.ceil(this.timer)} dtk`;
    if (this.activeIndex === 2) {
      return this.hasPackage
        ? 'Misi 3 "The Solmar Job": antar paket ke drop point di dekat Old Pier'
        : 'Misi 3 "The Solmar Job": ambil paket di ujung Old Pier';
    }
    return '';
  }

  // Where the marker ring should point right now.
  markerTarget() {
    if (this.activeIndex === 0) {
      return this.stage === 'steal'
        ? { x: this.comet.x, z: this.comet.z }
        : { x: this.landmarks.garage.x, z: this.landmarks.garage.z + 18 };
    }
    if (this.activeIndex === 1) return { x: this.landmarks.hideout.x, z: this.landmarks.hideout.z };
    if (this.activeIndex === 2) {
      return this.hasPackage
        ? { x: this.landmarks.drop.x, z: this.landmarks.drop.z }
        : { x: this.landmarks.pier.x + 30, z: this.landmarks.pier.z };
    }
    return null;
  }

  startMission(index, setWanted) {
    this.activeIndex = index;
    if (index === 1) {
      this.timer = CFG.mission2Timer;
      if (setWanted) setWanted(3);
      this.banner = 'BAYFRONT HEAT — KABUR KE HIDEOUT!';
    } else if (index === 2) {
      this.stage = 'pier';
      this.banner = 'THE SOLMAR JOB — AMBIL PAKET DI OLD PIER';
      // Four Vultures guard the pier.
      const spots = [
        [this.landmarks.pier.x + 28, this.landmarks.pier.z - 3],
        [this.landmarks.pier.x + 20, this.landmarks.pier.z + 3],
        [this.landmarks.pier.x + 10, this.landmarks.pier.z - 3],
        [this.landmarks.pier.x + 32, this.landmarks.pier.z + 4],
      ];
      for (const [x, z] of spots) this.combat.spawnEnemy(x, z, this.rng);
    } else if (index === 0) {
      this.stage = 'steal';
      this.banner = 'FIRST WHEELS — CURI COMET ORANYE';
    }
    if (this.audio) this.audio.jingle();
  }

  completeMission(player, setWanted) {
    const m = this.currentMission();
    if (!m) return;
    const reward = CFG.missionRewards[this.activeIndex];
    player.money += reward;
    this.completed[this.activeIndex] = true;
    this.banner = `MISI SELESAI: ${m.name} — +$${reward}`;
    if (this.audio) this.audio.jingle();
    if (this.activeIndex === 0) {
      this.activeIndex = 1;
      this.startMission(1, setWanted);
    } else if (this.activeIndex === 1) {
      this.activeIndex = 2;
      this.startMission(2, setWanted);
      if (setWanted) setWanted(0);
    } else {
      this.activeIndex = -1;
      this.banner = 'CERITA SELESAI — RICO MARIN BEBAS! +$1500';
      if (this.onMissionComplete) this.onMissionComplete(m);
    }
    if (this.onMissionComplete && this.activeIndex !== -1) this.onMissionComplete(m);
  }

  failMission(reason) {
    this.banner = `MISI GAGAL: ${reason}`;
    if (this.onMissionFailed) this.onMissionFailed(reason);
  }

  step(dt, player, setWanted, addKillfeed) {
    // Marker animation.
    const target = this.markerTarget();
    if (target) {
      this.markerRing.position.x = target.x;
      this.markerRing.position.z = target.z;
      this.marker.position.x = target.x;
      this.marker.position.z = target.z;
      const t = performance.now() / 1000;
      this.markerRing.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
      this.markerRing.visible = true;
      this.marker.visible = true;
    } else {
      this.markerRing.visible = false;
      this.marker.visible = false;
    }
    // Cash pickups spin and bob.
    for (const p of this.cashPickups) {
      if (p.taken) continue;
      p.phase += dt * 2;
      p.bill.rotation.y += dt * 2;
      p.bill.position.y = 0.9 + Math.sin(p.phase) * 0.15;
      const px = player.inCar ? player.inCar.x : player.x;
      const pz = player.inCar ? player.inCar.z : player.z;
      if (dist2D(p.x, p.z, px, pz) < 2.6) {
        p.taken = true;
        p.group.visible = false;
        player.money += CFG.cashPickupValue;
        if (this.audio) this.audio.pickup();
        if (addKillfeed) addKillfeed(`Cash pickup +$${CFG.cashPickupValue}`);
      }
    }
    // Mission logic.
    const m = this.currentMission();
    if (!m) return;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    if (this.activeIndex === 0) {
      if (this.stage === 'steal' && player.inCar === this.comet) {
        this.stage = 'deliver';
        this.banner = 'COMET DIDAPAT — ANTAR KE SOLMAR GARAGE';
        if (setWanted) setWanted(1); // stealing a car draws the law
        if (addKillfeed) addKillfeed('Comet dicuri — wanted ★');
      } else if (this.stage === 'deliver') {
        if (dist2D(px, pz, this.landmarks.garage.x, this.landmarks.garage.z + 18) < 10) {
          this.completeMission(player, setWanted);
        }
      }
    } else if (this.activeIndex === 1) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.failMission('Waktu habis — polisi menangkapmu di jalan');
        if (setWanted) setWanted(0);
        this.activeIndex = 2;
        this.startMission(2, setWanted);
      } else if (dist2D(px, pz, this.landmarks.hideout.x, this.landmarks.hideout.z) < 10) {
        this.completeMission(player, setWanted);
      }
    } else if (this.activeIndex === 2) {
      if (!this.hasPackage) {
        if (dist2D(px, pz, this.landmarks.pier.x + 30, this.landmarks.pier.z) < 4) {
          this.hasPackage = true;
          this.banner = 'PAKET DIDAPAT — ANTAR KE DROP POINT';
          if (this.audio) this.audio.pickup();
        }
      } else if (dist2D(px, pz, this.landmarks.drop.x, this.landmarks.drop.z) < 8) {
        this.completeMission(player, setWanted);
      }
    }
  }
}
