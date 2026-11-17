// Solmar Bay — the city itself.
// One job: build the static world (ground, roads, buildings, palms, lights,
// landmarks, beach and sea) and hand back the collision boxes and landmark spots.

import * as THREE from 'three';
import { CFG, pick, randRange } from './config.js';

// Road centrelines, 7 each way.
export function roadLines() {
  const lines = [];
  for (let i = -3; i <= 3; i++) lines.push(i * CFG.roadSpacing);
  return lines;
}

// Is (x, z) on a road (within half the road width of a centreline)?
export function onRoad(x, z) {
  const half = CFG.roadWidth / 2 + 1;
  for (const c of roadLines()) {
    if (Math.abs(x - c) < half || Math.abs(z - c) < half) return true;
  }
  return false;
}

// Nearest point on the road network to (x, z).
export function nearestRoadPoint(x, z) {
  const lines = roadLines();
  let bx = x;
  let bz = z;
  let best = Infinity;
  for (const cx of lines) {
    const d = Math.abs(x - cx);
    if (d < best) { best = d; bx = cx; bz = z; }
  }
  best = Infinity;
  for (const cz of lines) {
    const d = Math.abs(z - cz);
    if (d < best) { best = d; bx = x; bz = cz; }
  }
  return { x: bx, z: bz };
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 0,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  return m;
}

export function buildCity(scene, rng) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const group = new THREE.Group();
  scene.add(group);

  // --- Ground: grass base, ending where the beach begins (sea shows past x=312).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(720, 900),
    new THREE.MeshLambertMaterial({ color: CFG.groundColor })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-50, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // --- Roads: dark strips along every centreline, plus pale sidewalks.
  const roadMat = new THREE.MeshLambertMaterial({ color: CFG.roadColor });
  const walkMat = new THREE.MeshLambertMaterial({ color: CFG.sidewalkColor });
  const citySpan = CFG.cityHalf * 2 + CFG.roadWidth;
  for (const c of roadLines()) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(citySpan, CFG.roadWidth), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = horizontal ? 0 : Math.PI / 2;
      road.position.set(horizontal ? 0 : c, 0.01, horizontal ? c : 0);
      road.receiveShadow = true;
      group.add(road);
      // Sidewalk strips on both sides of the road.
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(citySpan, 3), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = horizontal ? 0 : Math.PI / 2;
        walk.position.set(
          horizontal ? 0 : c + side * (CFG.roadWidth / 2 + 1.5),
          0.02,
          horizontal ? c + side * (CFG.roadWidth / 2 + 1.5) : 0
        );
        walk.receiveShadow = true;
        group.add(walk);
      }
      // Centre dashes.
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
      for (let d = -CFG.cityHalf; d < CFG.cityHalf; d += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = horizontal ? 0 : Math.PI / 2;
        dash.position.set(horizontal ? d : c, 0.03, horizontal ? c : d);
        group.add(dash);
      }
    }
  }

  // --- Buildings: one or two per block, low-poly with lit windows.
  const windowGeo = new THREE.PlaneGeometry(2.2, 2.8);
  const windowLitMat = new THREE.MeshBasicMaterial({ color: CFG.windowLit });
  const windowDarkMat = new THREE.MeshBasicMaterial({ color: CFG.windowDark });
  const blocks = [];
  for (let bx = -3; bx <= 2; bx++) {
    for (let bz = -3; bz <= 2; bz++) {
      blocks.push({ x: bx * CFG.roadSpacing + CFG.roadSpacing / 2, z: bz * CFG.roadSpacing + CFG.roadSpacing / 2 });
    }
  }
  // Reserve three blocks for landmarks (garage, hideout, park).
  const reserved = new Set(['-2,-2', '2,2', '0,1']);
  let bIndex = 0;
  for (const b of blocks) {
    const key = `${Math.round((b.x - 40) / 80)},${Math.round((b.z - 40) / 80)}`;
    bIndex++;
    if (reserved.has(key)) continue;
    const count = rng() < 0.55 ? 1 : 2;
    for (let k = 0; k < count; k++) {
      const w = randRange(rng, 18, 30);
      const d = randRange(rng, 18, 30);
      const h = randRange(rng, 12, 42);
      const ox = count === 1 ? 0 : (k === 0 ? -14 : 14);
      const oz = count === 1 ? 0 : (k === 0 ? -12 : 12);
      const cx = b.x + ox;
      const cz = b.z + oz;
      const color = pick(rng, CFG.buildingPalette);
      const building = box(w, h, d, color, cx, h / 2, cz);
      group.add(building);
      // Roof trim.
      const trim = box(w + 0.6, 0.8, d + 0.6, 0x2c2c34, cx, h + 0.4, cz);
      group.add(trim);
      // Lit windows on the two street-facing sides.
      const floors = Math.max(2, Math.floor(h / 6));
      const cols = Math.max(2, Math.floor(w / 6));
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          if (rng() < 0.35) continue;
          const lit = rng() < 0.55;
          const win = new THREE.Mesh(windowGeo, lit ? windowLitMat : windowDarkMat);
          const wx = cx - w / 2 + 3 + c * 6;
          const wy = 4 + f * 6;
          win.position.set(wx, wy, cz + d / 2 + 0.06);
          group.add(win);
        }
      }
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }
  }

  // --- Landmarks.
  // Solmar Garage: wide low workshop with a big orange door, block (-120,-120).
  const garage = { x: -120, z: -120 };
  const garageBody = box(44, 10, 26, 0xd96a2e, garage.x, 5, garage.z);
  group.add(garageBody);
  const garageDoor = box(20, 7, 0.5, 0x3a3f4a, garage.x, 3.5, garage.z + 13.2);
  group.add(garageDoor);
  const garageSign = makeSign('SOLMAR GARAGE', 0xffd98a, garage.x, 11.5, garage.z + 13.4);
  group.add(garageSign);
  colliders.push({ minX: garage.x - 22, maxX: garage.x + 22, minZ: garage.z - 13, maxZ: garage.z + 13 });

  // Coral Hideout: small coral house with a porch, block (200,200).
  const hideout = { x: 200, z: 200 };
  const hideBody = box(18, 8, 14, 0xe87a6a, hideout.x, 4, hideout.z);
  group.add(hideBody);
  const hideRoof = box(20, 1.2, 16, 0x8e4a3a, hideout.x, 8.6, hideout.z);
  group.add(hideRoof);
  const hideSign = makeSign('CORAL ST HIDEOUT', 0x9fe8ff, hideout.x, 10, hideout.z + 7.4);
  group.add(hideSign);
  colliders.push({ minX: hideout.x - 9, maxX: hideout.x + 9, minZ: hideout.z - 7, maxZ: hideout.z + 7 });

  // Central park with palms, block (40,120) — reserved spot (0,1).
  const park = { x: 40, z: 120 };
  const lawn = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshLambertMaterial({ color: 0x5d8a4a })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(park.x, 0.03, park.z);
  lawn.receiveShadow = true;
  group.add(lawn);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng() * 0.4;
    const px = park.x + Math.cos(a) * randRange(rng, 8, 22);
    const pz = park.z + Math.sin(a) * randRange(rng, 8, 22);
    group.add(makePalm(px, pz, rng));
  }

  // Palms scattered along the beachfront avenue.
  for (let z = -240; z <= 240; z += 40) {
    group.add(makePalm(272, z + 8, rng));
    if (rng() < 0.7) group.add(makePalm(268, z - 12, rng));
  }

  // --- Street lights along the roads.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const c of roadLines()) {
    for (let d = -240; d <= 240; d += 80) {
      for (const [lx, lz] of [[c + 10, d], [d, c + 10]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
        pole.position.set(lx, 3.5, lz);
        pole.castShadow = true;
        group.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
        lamp.position.set(lx, 7.2, lz);
        group.add(lamp);
      }
    }
  }

  // --- Beach, sea and the Old Pier (east edge).
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 620),
    new THREE.MeshLambertMaterial({ color: CFG.sandColor })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CFG.sandFrom + 12, 0.0, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 700),
    new THREE.MeshLambertMaterial({ color: CFG.seaColor })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CFG.seaFrom + 150, -0.4, 0);
  group.add(sea);

  const pier = { x: 330, z: 40 };
  const pierDeck = box(70, 0.3, 10, 0x8a6a4a, pier.x, 0.15, pier.z);
  group.add(pierDeck);
  for (let px = pier.x - 32; px <= pier.x + 32; px += 8) {
    const post = box(0.8, 2.4, 0.8, 0x6a4a34, px, -0.6, pier.z - 4.4);
    group.add(post);
    const post2 = box(0.8, 2.4, 0.8, 0x6a4a34, px, -0.6, pier.z + 4.4);
    group.add(post2);
  }
  const pierSign = makeSign('OLD PIER', 0xffe9a8, pier.x + 30, 5, pier.z - 5.4);
  pierSign.rotation.y = Math.PI;
  group.add(pierSign);

  // Drop point marker post near the pier car park.
  const drop = { x: 296, z: -40 };

  return {
    group,
    colliders,
    landmarks: {
      garage,
      hideout,
      pier,
      drop,
      spawn: { x: 8, z: 8 },
    },
  };
}

function makePalm(x, z, rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.45, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a5a3a })
  );
  trunk.position.y = 3.5;
  trunk.rotation.z = (rng() - 0.5) * 0.2;
  trunk.castShadow = true;
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4a });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

// A flat glowing sign board (canvas texture, local only).
function makeSign(text, color, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c1c26';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 2),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// Keep a circle (player, car, ped) out of building AABBs. Returns corrected x/z.
export function resolveBuildingCollision(x, z, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-6) {
        // Inside the box: push out along the smallest penetration axis.
        const pl = x - c.minX;
        const pr = c.maxX - x;
        const pt = z - c.minZ;
        const pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - radius;
        else if (m === pr) x = c.maxX + radius;
        else if (m === pt) z = c.minZ - radius;
        else z = c.maxZ + radius;
      } else {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * radius;
        z = nz + (dz / d) * radius;
      }
    }
  }
  return { x, z };
}
