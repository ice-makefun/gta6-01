// Solmar Bay — shared tuning, palette and helpers.
// One job: every number the rest of the game agrees on, plus a seeded RNG.

export const CFG = {
  // City grid: 7 roads each way, spacing 80 m, road width 16 m, city half-size 280 m.
  roadSpacing: 80,
  roadWidth: 16,
  cityHalf: 280,
  blockSize: 64,
  // Sea on the east edge (x > cityHalf) and a sand strip before it.
  sandFrom: 288,
  seaFrom: 312,
  // Player on foot.
  walkSpeed: 6.5,
  runSpeed: 10,
  playerRadius: 0.6,
  playerHealth: 100,
  // Cars.
  carAccel: 22,
  carBrake: 34,
  carReverseAccel: 12,
  carMaxSpeed: 38,
  carMaxReverse: 10,
  carTurnRate: 1.9,
  carGrip: 6.5,
  // Traffic and pedestrians.
  trafficCount: 14,
  trafficSpeed: 10,
  pedCount: 18,
  // Wanted.
  wantedMax: 5,
  heatDecayDelay: 18,
  heatDecayStep: 9,
  // Combat.
  pistolDamage: 34,
  pistolHeadshot: 100,
  pistolMag: 12,
  pistolRange: 90,
  enemyHealth: 100,
  // Economy.
  cashPickupValue: 100,
  cashPickupCount: 12,
  missionRewards: [500, 800, 1500],
  mission2Timer: 90,
  // Colours: warm sunset palette.
  skyTop: 0x2e4a7a,
  skyHorizon: 0xff9a52,
  sunColor: 0xffd27a,
  fogColor: 0xf2a35e,
  roadColor: 0x3a3f4a,
  sidewalkColor: 0x8d8578,
  groundColor: 0x6f7d5a,
  sandColor: 0xe8c98a,
  seaColor: 0x2a7f9e,
  buildingPalette: [0xe8734a, 0x7fb069, 0x8e6fc0, 0xf2b441, 0x4a90b8, 0xd96a7a, 0x9db380],
  windowLit: 0xffd98a,
  windowDark: 0x2c3550,
  cometColor: 0xff7a1a,
  policeColor: 0x1c2f6e,
  enemyColor: 0x5a2e6e,
};

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Seeded RNG (mulberry32) so ?shot=...&seed=N stages the same scene every time.
export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// Distance on the XZ plane.
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Angle helpers: keep a heading in (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}
