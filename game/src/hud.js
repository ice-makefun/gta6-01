// Solmar Bay — HUD and minimap.
// One job: every 2D overlay the player reads — health, money, wanted stars,
// speed, ammo, objective, killfeed, banners, bust warning — plus the
// top-down minimap canvas (roads, player, cars, flashing police, marker).

import { CFG, clamp } from './config.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.moneyText = document.getElementById('money');
    this.starsEl = document.getElementById('stars');
    this.speedText = document.getElementById('speed');
    this.ammoText = document.getElementById('ammo');
    this.objectiveText = document.getElementById('objective');
    this.bannerEl = document.getElementById('banner');
    this.killfeedEl = document.getElementById('killfeed');
    this.bustEl = document.getElementById('bust-warning');
    this.hintEl = document.getElementById('hint');
    this.mapCanvas = document.getElementById('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.bannerTimer = 0;
    this.lastBanner = '';
    this.killfeed = [];
  }

  showBanner(text, seconds = 4) {
    this.bannerEl.textContent = text;
    this.bannerEl.style.opacity = '1';
    this.bannerTimer = seconds;
    this.lastBanner = text;
  }

  addKillfeed(text) {
    this.killfeed.unshift(text);
    if (this.killfeed.length > 4) this.killfeed.pop();
    this.killfeedEl.innerHTML = this.killfeed.map((t) => `<div>${t}</div>`).join('');
  }

  setHint(text) {
    this.hintEl.textContent = text;
    this.hintEl.style.opacity = text ? '1' : '0';
  }

  update(dt, state) {
    // state: {health, money, wanted, speedKmh, ammo, reloading, objective,
    //         bustDanger (0..1), banner}
    this.healthFill.style.width = `${clamp(state.health, 0, 100)}%`;
    this.healthFill.style.background = state.health > 50 ? '#5ec95e' : state.health > 25 ? '#e8a13c' : '#e84a4a';
    this.healthText.textContent = `${Math.ceil(state.health)} HP`;
    this.moneyText.textContent = `$${state.money.toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < CFG.wantedMax; i++) {
      stars += i < state.wanted ? '★' : '☆';
    }
    this.starsEl.textContent = stars;
    this.starsEl.classList.toggle('hot', state.wanted >= 3);
    this.speedText.textContent = state.inCar ? `${Math.round(state.speedKmh)} km/h` : '';
    this.ammoText.textContent = state.reloading ? 'RELOADING…' : `🔫 ${state.ammo} / ${CFG.pistolMag}`;
    this.objectiveText.textContent = state.objective;
    if (state.banner && state.banner !== this.lastBanner) {
      this.showBanner(state.banner, 4);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.style.opacity = '0';
    }
    this.bustEl.style.opacity = state.bustDanger > 0 ? String(0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 150))) : '0';
  }

  // Top-down map: city bounds -280..380 x, -280..280 z mapped to the canvas.
  drawMinimap(state) {
    // state: {playerX, playerZ, playerHeading, cars:[{x,z,police}], peds,
    //         marker:{x,z}|null, enemies:[{x,z}], inCar}
    const ctx = this.mapCtx;
    const W = this.mapCanvas.width;
    const H = this.mapCanvas.height;
    const minX = -290;
    const maxX = 390;
    const minZ = -290;
    const maxZ = 290;
    const px = (x) => ((x - minX) / (maxX - minX)) * W;
    const pz = (z) => ((z - minZ) / (maxZ - minZ)) * H;
    ctx.clearRect(0, 0, W, H);
    // Sea + sand on the east.
    ctx.fillStyle = '#2a7f9e';
    ctx.fillRect(px(312), 0, W - px(312), H);
    ctx.fillStyle = '#e8c98a';
    ctx.fillRect(px(288), 0, px(312) - px(288), H);
    // Ground.
    ctx.fillStyle = '#3d4a35';
    ctx.fillRect(0, 0, px(288), H);
    // Roads.
    ctx.fillStyle = '#555a66';
    for (let i = -3; i <= 3; i++) {
      const c = i * 80;
      ctx.fillRect(px(c) - 3, 0, 6, H);
      ctx.fillRect(0, pz(c) - 3, px(288), 6);
    }
    // Mission marker.
    if (state.marker) {
      const mx = px(state.marker.x);
      const my = pz(state.marker.z);
      const pulse = 6 + Math.sin(performance.now() / 200) * 2;
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1c1c26';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Cars (grey), police (flashing blue/red).
    const flashing = Math.floor(performance.now() / 300) % 2 === 0;
    for (const car of state.cars || []) {
      ctx.fillStyle = car.police ? (flashing ? '#2050ff' : '#ff2020') : '#c8c8d0';
      ctx.beginPath();
      ctx.arc(px(car.x), pz(car.z), car.police ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemies (purple).
    for (const e of state.enemies || []) {
      ctx.fillStyle = '#c05ad8';
      ctx.beginPath();
      ctx.arc(px(e.x), pz(e.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: white arrow pointing along the heading.
    const ux = px(state.playerX);
    const uy = pz(state.playerZ);
    ctx.save();
    ctx.translate(ux, uy);
    ctx.rotate(Math.atan2(state.playerHeadingX || 0, state.playerHeadingZ || 1));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1c1c26';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Border.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }
}
