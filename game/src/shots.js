// Solmar Bay — deterministic screenshot staging.
// One job: read ?shot=start|drive|chase|mission&seed=N and pose the world
// so each screenshot shows several systems at once, then set
// window.__shotReady once the scene has rendered at least twice.

import { CFG } from './config.js';
import { nearestRoadPoint } from './world.js';

export function parseShotParams() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  const seed = parseInt(q.get('seed') || '1', 10) || 1;
  return { shot, seed };
}

// Stage the game for a screenshot. `g` is the live game object from main.js.
export function stageShot(g, shot) {
  const { player, traffic, police, missions, combat, hud } = g;
  if (shot === 'start') {
    // Start screen over the city: camera high above the beachfront avenue.
    g.mode = 'menu';
    g.showStartScreen(true);
    player.x = 8;
    player.z = 8;
    player.camYaw = Math.PI * 0.75;
    player.camPitch = 0.5;
    player.camDist = 26;
  } else {
    g.mode = 'playing';
    g.hideStartScreen();
  }
  if (shot === 'drive') {
    // Player driving the Comet down Bayfront Ave with traffic, peds,
    // wanted 2 and the mission objective on screen.
    const comet = missions.comet;
    comet.x = 240;
    comet.z = -60;
    comet.heading = 0;
    comet.speed = 14;
    player.enterCar(comet);
    missions.stage = 'deliver';
    missions.activeIndex = 0;
    missions.banner = 'FIRST WHEELS — ANTAR KE SOLMAR GARAGE';
    g.setWanted(2);
    // Traffic close by on the same avenue.
    traffic.cars[0].x = 240;
    traffic.cars[0].z = -20;
    traffic.cars[0].heading = 0;
    traffic.cars[1].x = 224;
    traffic.cars[1].z = -90;
    traffic.cars[1].heading = 0;
    traffic.cars[2].x = 256;
    traffic.cars[2].z = -110;
    traffic.cars[2].heading = Math.PI;
    // A pedestrian on the sidewalk ahead, in frame.
    if (g.peds && g.peds.peds[0]) {
      const ped = g.peds.peds[0];
      ped.x = 231;
      ped.z = -28;
      ped.heading = Math.PI;
    }
    hud.addKillfeed('Comet dicuri — wanted ★★');
    hud.showBanner('FIRST WHEELS — ANTAR KE SOLMAR GARAGE', 10);
  } else if (shot === 'chase') {
    // Police chase: wanted 4, two police cars ahead of the player so they
    // are inside the chase camera's frame, mission timer running.
    const comet = missions.comet;
    comet.x = 0;
    comet.z = -40;
    comet.heading = 0;
    comet.speed = 22;
    player.enterCar(comet);
    missions.activeIndex = 1;
    missions.stage = 'heat';
    missions.timer = 64;
    missions.banner = 'BAYFRONT HEAT — KABUR KE HIDEOUT! 64 dtk';
    g.setWanted(4);
    // Spawn the chase cars in front of the player, lights flashing.
    const p1 = police.spawnChaseCar(0, -8, Math.PI);
    const p2 = police.spawnChaseCar(-12, 4, Math.PI / 2);
    if (p1) { p1.x = 0; p1.z = -8; p1.heading = Math.PI; }
    if (p2) { p2.x = -12; p2.z = 4; p2.heading = Math.PI / 2; }
    traffic.cars[0].x = 16;
    traffic.cars[0].z = -10;
    traffic.cars[0].heading = 0;
    hud.addKillfeed('Polisi mengejar! ★★★★');
    hud.showBanner('BAYFRONT HEAT — KABUR KE HIDEOUT! 64 dtk', 10);
  } else if (shot === 'mission') {
    // On foot at the Old Pier, facing the Vultures, package objective up.
    missions.activeIndex = 2;
    missions.stage = 'pier';
    missions.hasPackage = false;
    missions.banner = 'THE SOLMAR JOB — AMBIL PAKET DI OLD PIER';
    const pier = missions.landmarks.pier;
    player.x = pier.x - 6;
    player.z = pier.z;
    player.heading = Math.PI / 2;
    player.camYaw = Math.PI / 2;
    player.camPitch = 0.18;
    player.camDist = 8;
    // Enemies visible ahead on the pier.
    combat.clearEnemies();
    const spots = [
      [pier.x + 22, pier.z - 3],
      [pier.x + 14, pier.z + 3],
      [pier.x + 28, pier.z + 2],
      [pier.x + 8, pier.z - 3],
    ];
    for (const [x, z] of spots) combat.spawnEnemy(x, z, g.rng);
    g.setWanted(2);
    hud.addKillfeed('Vultures menjaga pier!');
    hud.showBanner('THE SOLMAR JOB — AMBIL PAKET DI OLD PIER', 10);
  }
  // Let the world settle a few frames, then signal readiness.
  let frames = 0;
  const tick = () => {
    frames++;
    if (frames >= 2) {
      window.__shotReady = true;
    } else {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

export { nearestRoadPoint, CFG };
