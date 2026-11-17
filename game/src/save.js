// Solmar Bay — save and load.
// One job: persist the player's money, mission progress, position and
// wanted level to localStorage, and read it back for Continue.

const SAVE_KEY = 'solmar-bay-save-v1';

export function saveGame(state) {
  try {
    const data = {
      money: state.player.money,
      missionsCompleted: state.missions.completed,
      activeIndex: state.missions.activeIndex,
      stage: state.missions.stage,
      hasPackage: state.missions.hasPackage,
      playerX: state.player.x,
      playerZ: state.player.z,
      wanted: state.wanted,
      cashTaken: state.missions.cashPickups.map((p) => p.taken),
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore: saving is best-effort.
  }
}
