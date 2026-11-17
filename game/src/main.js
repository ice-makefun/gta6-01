// Solmar Bay — bootstrap and game loop.
// One job: wire every system together (world, player, cars, traffic, peds,
// police, missions, combat, HUD, audio, save) and run the fixed-step loop.

import * as THREE from 'three';
import { CFG, clamp, createRng, dist2D } from './config.js';
import { buildCity } from './world.js';
import { Player } from './player.js';
import { Car, carColorAt } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { PedManager } from './peds.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { parseShotParams, stageShot } from './shots.js';

const { shot, seed } = parseShotParams();
const rng = createRng(seed);
const isShotMode = !!shot;

// --- Renderer, scene, lights.
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(CFG.fogColor);
scene.fog = new THREE.Fog(CFG.fogColor, 120, 620);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(20, 12, 30);

const sun = new THREE.DirectionalLight(CFG.sunColor, 2.4);
sun.position.set(-180, 140, -120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -320;
sun.shadow.camera.right = 320;
sun.shadow.camera.top = 320;
sun.shadow.camera.bottom = -320;
sun.shadow.camera.far = 800;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffd9a0, 0x4a5a6a, 0.9));

// --- World and systems.
const city = buildCity(scene, rng);
const colliders = city.colliders;
const landmarks = city.landmarks;

const audio = new AudioEngine();
const hud = new HUD();
const player = new Player(scene, landmarks.spawn.x, landmarks.spawn.z);
const combat = new Combat(scene, audio);
const traffic = new TrafficManager(scene, rng, colliders);
const peds = new PedManager(scene, rng, colliders);
const police = new PoliceManager(scene, colliders);
const missions = new MissionManager(scene, rng, landmarks, colliders, combat, audio);

// A few parked cars the player can steal (not part of traffic AI).
const parkedCars = [];
const parkedSpots = [
  { x: 80, z: -56, h: Math.PI / 2 },
  { x: -80, z: 104, h: -Math.PI / 2 },
  { x: 160, z: 56, h: 0 },
  { x: -160, z: -136, h: Math.PI },
  { x: 0, z: 216, h: Math.PI / 2 },
  { x: 296, z: -56, h: 0 },
];
parkedSpots.forEach((s, i) => {
  const car = new Car(scene, s.x, s.z, s.h, carColorAt(i + 3));
  car.speed = 0;
  parkedCars.push(car);
});

function allCars() {
  return [...traffic.cars, ...parkedCars, missions.comet, ...police.cars];
}

// --- Game state.
const g = {
  mode: 'menu', // menu | playing | paused | busted | wasted
  wanted: 0,
  lastCrimeAt: 0,
  lastDamageAt: 0,
  heatTimer: 0,
  shake: 0,
  elapsed: 0,
  autosaveTimer: 0,
  player,
  traffic,
  peds,
  police,
  missions,
  combat,
  hud,
  rng,
  setWanted,
  showStartScreen,
  hideStartScreen,
};
window.__solmar = g; // handy for debugging in the console

function setWanted(level) {
  g.wanted = clamp(level, 0, CFG.wantedMax);
  if (level > 0) g.lastCrimeAt = g.elapsed;
}

function addWanted(n) {
  setWanted(g.wanted + n);
}

function addKillfeed(text) {
  hud.addKillfeed(text);
}

// --- Start screen / pause / save.
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const continueBtn = document.getElementById('continue-btn');
const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');
const menuBtn = document.getElementById('menu-btn');
const saveNote = document.getElementById('save-note');

function showStartScreen(withCityBehind) {
  startScreen.style.display = 'flex';
  continueBtn.style.display = hasSave() ? 'inline-block' : 'none';
  if (hasSave()) {
    const s = loadGame();
    saveNote.textContent = s ? `Save ditemukan: $${s.money} — misi ${s.activeIndex < 0 ? 'selesai' : s.activeIndex + 1}/3` : '';
  } else {
    saveNote.textContent = '';
  }
}

function hideStartScreen() {
  startScreen.style.display = 'none';
}

function startGame(fromSave) {
  audio.ensure();
  if (fromSave) {
    const s = loadGame();
    if (s) applySave(s);
  } else {
    clearSave();
    missions.startMission(0, setWanted);
  }
  g.mode = 'playing';
  hideStartScreen();
  pauseScreen.style.display = 'none';
  hud.showBanner(fromSave ? 'SELAMAT DATANG KEMBALI DI SOLMAR BAY' : 'FIRST WHEELS — CURI COMET ORANYE', 4);
}

function applySave(s) {
  player.money = s.money || 0;
  player.x = s.playerX ?? landmarks.spawn.x;
  player.z = s.playerZ ?? landmarks.spawn.z;
  player.group.position.set(player.x, 0, player.z);
  missions.completed = s.missionsCompleted || [false, false, false];
  missions.activeIndex = typeof s.activeIndex === 'number' ? s.activeIndex : 0;
  missions.stage = s.stage || 'steal';
  missions.hasPackage = !!s.hasPackage;
  if (Array.isArray(s.cashTaken)) {
    missions.cashPickups.forEach((p, i) => {
      if (s.cashTaken[i]) { p.taken = true; p.group.visible = false; }
    });
  }
  setWanted(s.wanted || 0);
  if (missions.activeIndex === 1) missions.timer = CFG.mission2Timer;
  if (missions.activeIndex === 2 && !missions.hasPackage) {
    // Re-spawn the Vultures for the pier fight.
    combat.clearEnemies();
    const pier = landmarks.pier;
    const spots = [
      [pier.x + 28, pier.z - 3], [pier.x + 20, pier.z + 3],
      [pier.x + 10, pier.z - 3], [pier.x + 32, pier.z + 4],
    ];
    for (const [x, z] of spots) combat.spawnEnemy(x, z, rng);
  }
}

startBtn.addEventListener('click', () => startGame(false));
continueBtn.addEventListener('click', () => startGame(true));
resumeBtn.addEventListener('click', () => {
  g.mode = 'playing';
  pauseScreen.style.display = 'none';
});
menuBtn.addEventListener('click', () => {
  saveGame(g);
  g.mode = 'menu';
  pauseScreen.style.display = 'none';
  showStartScreen(true);
});

// --- Input.
const keys = {};
let pointerLocked = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    hud.addKillfeed(muted ? 'Suara dimatikan (M)' : 'Suara dinyalakan (M)');
  }
  if (e.code === 'KeyR') combat.startReload();
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (g.mode === 'playing') {
      g.mode = 'paused';
      pauseScreen.style.display = 'flex';
      saveGame(g);
      document.exitPointerLock?.();
    } else if (g.mode === 'paused') {
      g.mode = 'playing';
      pauseScreen.style.display = 'none';
    }
  }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
canvas.addEventListener('click', () => {
  if (g.mode === 'playing' && !player.inCar && !isShotMode) {
    canvas.requestPointerLock?.();
  }
  audio.ensure();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || g.mode !== 'playing' || player.inCar) return;
  player.camYaw -= e.movementX * 0.0032;
  player.camPitch = clamp(player.camPitch + e.movementY * 0.0022, -0.1, 1.1);
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (g.mode !== 'playing' || player.inCar) return;
  audio.ensure();
  combat.shoot(camera, player);
});

// --- Entering / leaving cars.
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of allCars()) {
    if (!car.alive) continue;
    const d = dist2D(player.x, player.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterExitCar() {
  if (g.mode !== 'playing') return;
  if (player.inCar) {
    const car = player.inCar;
    player.exitCar();
    // A stolen traffic car goes back to cruising.
    if (traffic.cars.includes(car)) {
      car.stolen = false;
      car.cruise = CFG.trafficSpeed;
      car.speed = 0;
    }
    hud.setHint('');
    return;
  }
  const car = nearestCar(3.6);
  if (!car) return;
  if (!car.ownedByPlayer) {
    car.ownedByPlayer = true;
    addWanted(1);
    addKillfeed('Mobil dicuri — wanted ★');
    if (audio) audio.pickup();
  }
  if (traffic.cars.includes(car)) car.stolen = true;
  const pi = parkedCars.indexOf(car);
  if (pi >= 0) parkedCars.splice(pi, 1);
  const pol = police.cars.indexOf(car);
  if (pol >= 0) police.cars.splice(pol, 1);
  player.enterCar(car);
  hud.setHint('');
}

// --- Crime hooks.
peds.onPedHit = () => {
  addWanted(1);
  addKillfeed('Pejalan kaki tertabrak — wanted ★');
  if (audio) audio.crash();
};
combat.onEnemyKilled = () => {
  addKillfeed('Vulture dilumpuhkan');
};
combat.onPlayerShot = () => {
  player.health -= 8;
  g.lastDamageAt = g.elapsed;
  damageFlash();
  if (player.health <= 0) wasted();
};
police.onBusted = () => {
  busted();
};
missions.onMissionComplete = (m) => {
  saveGame(g);
  addKillfeed(`Misi "${m.name}" selesai`);
};
missions.onMissionFailed = (reason) => {
  addKillfeed(`Misi gagal: ${reason}`);
};

const damageEl = document.getElementById('damage-flash');
function damageFlash() {
  damageEl.style.opacity = '0.55';
  setTimeout(() => { damageEl.style.opacity = '0'; }, 180);
}

function busted() {
  if (g.mode !== 'playing') return;
  const fine = Math.min(player.money, 200);
  player.money -= fine;
  setWanted(0);
  player.health = CFG.playerHealth;
  if (player.inCar) player.exitCar();
  player.x = landmarks.hideout.x;
  player.z = landmarks.hideout.z + 14;
  player.group.position.set(player.x, 0, player.z);
  if (audio) audio.busted();
  hud.showBanner(`BUSTED! Denda $${fine} — dilepas di Coral Street`, 5);
  addKillfeed('BUSTED oleh polisi');
  if (missions.activeIndex === 1) {
    missions.failMission('Ditangkap polisi saat kabur');
    missions.startMission(1, setWanted);
  }
  saveGame(g);
}

function wasted() {
  if (g.mode !== 'playing') return;
  g.mode = 'wasted';
  const lost = Math.min(player.money, 200);
  player.money -= lost;
  setWanted(0);
  hud.showBanner(`WASTED! Rico tumbang — kehilangan $${lost}`, 5);
  addKillfeed('WASTED');
  if (audio) audio.busted();
  setTimeout(() => {
    player.health = CFG.playerHealth;
    if (player.inCar) player.exitCar();
    player.x = landmarks.spawn.x;
    player.z = landmarks.spawn.z;
    player.group.position.set(player.x, 0, player.z);
    g.mode = 'playing';
    saveGame(g);
  }, 2500);
}

// --- Crash sparks (tiny particle pool).
const sparkPool = [];
{
  const sparkGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(40 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffc24a, size: 0.35, transparent: true, opacity: 0 });
  const points = new THREE.Points(sparkGeo, sparkMat);
  points.frustumCulled = false;
  scene.add(points);
  sparkPool.push({ points, geo: sparkGeo, mat: sparkMat, life: 0, vx: [], vy: [], vz: [] });
}
function spawnSparks(x, y, z) {
  const s = sparkPool[0];
  const pos = s.geo.attributes.position.array;
  s.vx = [];
  s.vy = [];
  s.vz = [];
  for (let i = 0; i < 40; i++) {
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    s.vx.push((Math.random() - 0.5) * 10);
    s.vy.push(Math.random() * 8);
    s.vz.push((Math.random() - 0.5) * 10);
  }
  s.geo.attributes.position.needsUpdate = true;
  s.mat.opacity = 1;
  s.life = 0.5;
}
function stepSparks(dt) {
  const s = sparkPool[0];
  if (s.life <= 0) return;
  s.life -= dt;
  const pos = s.geo.attributes.position.array;
  for (let i = 0; i < 40; i++) {
    pos[i * 3] += s.vx[i] * dt;
    pos[i * 3 + 1] += s.vy[i] * dt;
    pos[i * 3 + 2] += s.vz[i] * dt;
    s.vy[i] -= 20 * dt;
    if (pos[i * 3 + 1] < 0.05) pos[i * 3 + 1] = 0.05;
  }
  s.geo.attributes.position.needsUpdate = true;
  s.mat.opacity = Math.max(0, s.life / 0.5);
}

// --- Fixed-step loop.
const clock = new THREE.Clock();
let accumulator = 0;
const STEP = 1 / 60;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (g.mode === 'playing') {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepGame(STEP);
      accumulator -= STEP;
    }
  } else if (g.mode === 'menu') {
    // Slow cinematic orbit behind the start screen.
    const t = performance.now() / 1000;
    const cx = 120 + Math.cos(t * 0.05) * 90;
    const cz = 60 + Math.sin(t * 0.05) * 90;
    camera.position.lerp(new THREE.Vector3(cx, 42, cz), 0.02);
    camera.lookAt(40, 4, 0);
  }
  renderer.render(scene, camera);
}

function stepGame(dt) {
  g.elapsed += dt;
  const car = player.inCar;

  // --- Player / car movement.
  if (car) {
    const input = {
      throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
      steer: (keys.KeyA || keys.ArrowLeft ? -1 : 0) + (keys.KeyD || keys.ArrowRight ? 1 : 0),
      brake: !!keys.Space,
      handbrake: !!keys.ControlLeft || !!keys.ControlRight,
    };
    const res = car.step(dt, input, colliders, allCars());
    if (res.hitBuilding) {
      g.shake = 0.35;
      spawnSparks(car.x, 1, car.z);
      if (Math.abs(car.speed) > 6 && audio) audio.crash();
    }
    // Hint: E to exit.
    hud.setHint('E — keluar dari mobil');
  } else {
    player.stepOnFoot(dt, {
      w: !!keys.KeyW || !!keys.ArrowUp,
      a: !!keys.KeyA || !!keys.ArrowLeft,
      s: !!keys.KeyS || !!keys.ArrowDown,
      d: !!keys.KeyD || !!keys.ArrowRight,
      shift: !!keys.ShiftLeft || !!keys.ShiftRight,
    }, colliders, allCars());
    const near = nearestCar(3.6);
    hud.setHint(near ? 'E — masuk mobil' : '');
  }

  // --- World systems.
  traffic.step(dt, car);
  peds.step(dt, allCars(), player);
  police.step(dt, g.wanted, player, car);
  missions.step(dt, player, setWanted, addKillfeed);
  combat.step(dt, player, { x: player.inCar ? player.inCar.x : player.x, z: player.inCar ? player.inCar.z : player.z });

  // --- Wanted heat decay.
  if (g.wanted > 0 && g.elapsed - g.lastCrimeAt > CFG.heatDecayDelay) {
    g.heatTimer += dt;
    if (g.heatTimer >= CFG.heatDecayStep) {
      g.heatTimer = 0;
      setWanted(g.wanted - 1);
      if (g.wanted === 0) addKillfeed('Polisi kehilangan jejakmu');
    }
  }
  // --- Health regen when calm.
  if (player.health < CFG.playerHealth && g.wanted === 0 && g.elapsed - g.lastDamageAt > 10) {
    player.health = Math.min(CFG.playerHealth, player.health + 2 * dt);
  }

  // --- Audio.
  const speedNorm = car ? Math.abs(car.speed) / CFG.carMaxSpeed : 0;
  audio.setEngine(speedNorm, !!car);
  audio.setSiren(g.wanted);
  audio.step(dt, g.wanted);

  // --- Camera (with shake).
  player.updateCamera(camera, dt);
  if (g.shake > 0) {
    g.shake -= dt;
    camera.position.x += (Math.random() - 0.5) * g.shake * 0.9;
    camera.position.y += (Math.random() - 0.5) * g.shake * 0.6;
  }

  // --- HUD + minimap.
  const nearestCop = police.nearestCopDistance(player);
  hud.update(dt, {
    health: player.health,
    money: player.money,
    wanted: g.wanted,
    speedKmh: car ? Math.abs(car.speed) * 3.6 : 0,
    ammo: combat.ammo,
    reloading: combat.reloading,
    objective: missions.objectiveText(),
    bustDanger: g.wanted > 0 && !car && nearestCop < 6 ? 1 : 0,
    banner: missions.banner,
    inCar: !!car,
  });
  const fwdX = car ? Math.sin(car.heading) : Math.sin(player.heading);
  const fwdZ = car ? Math.cos(car.heading) : Math.cos(player.heading);
  hud.drawMinimap({
    playerX: car ? car.x : player.x,
    playerZ: car ? car.z : player.z,
    playerHeadingX: fwdX,
    playerHeadingZ: fwdZ,
    cars: allCars().map((c) => ({ x: c.x, z: c.z, police: c.isPolice })),
    enemies: combat.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, z: e.z })),
    marker: missions.markerTarget(),
  });

  // --- Autosave.
  g.autosaveTimer += dt;
  if (g.autosaveTimer > 30) {
    g.autosaveTimer = 0;
    saveGame(g);
  }
  stepSparks(dt);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Boot.
showStartScreen(true);
if (isShotMode) {
  stageShot(g, shot);
} else {
  missions.startMission(0, setWanted);
}
// Draw the minimap once so it is never a blank box (e.g. behind the menu).
hud.drawMinimap({
  playerX: player.x,
  playerZ: player.z,
  playerHeadingX: 0,
  playerHeadingZ: 1,
  cars: allCars().map((c) => ({ x: c.x, z: c.z, police: c.isPolice })),
  enemies: [],
  marker: missions.markerTarget(),
});
frame();
