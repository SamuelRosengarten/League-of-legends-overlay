const $ = (id) => document.getElementById(id);

// The guide shown before a game (and when you play Gwen). Change this for other champions later.
const DEFAULT_CHAMPION = "Gwen";

// The backend only sends updates on change, so the clock ticks locally between them.
let gameTime = null;
function drawClock() {
  if (gameTime === null) { $("clock").textContent = ""; return; }
  const m = Math.floor(gameTime / 60), s = String(gameTime % 60).padStart(2, "0");
  $("clock").textContent = `${m}:${s}`;
}
setInterval(() => { if (gameTime !== null) { gameTime += 1; drawClock(); } }, 1000);

let shownGuide = null;
function showGuide(champion) {
  if (champion === shownGuide) return;
  shownGuide = champion;
  renderGuide(champion);
}

function render(g) {
  $("status").hidden = g.inGame;
  $("game").hidden = !g.inGame;
  gameTime = g.inGame ? g.gameTime : null;
  drawClock();
  showGuide(g.inGame ? g.champion : DEFAULT_CHAMPION);
  if (!g.inGame) return;
  $("champ").textContent = g.champion;
  $("level").textContent = g.level;
  $("gold").textContent = g.gold;
  $("items").textContent = g.items.map((i) => (i.count > 1 ? `${i.name} x${i.count}` : i.name)).join(", ");
}

if (window.__TAURI__) {
  window.__TAURI__.event.listen("game-state", (e) => render(e.payload));
  render({ inGame: false });
} else {
  // Opened in a normal browser (no game, no app): show a fake match so you can preview it.
  document.body.classList.add("demo");
  render({
    inGame: true, champion: "Gwen", level: 7, gold: 1234, gameTime: 301,
    items: [{ name: "Doran's Blade", count: 1 }, { name: "Control Ward", count: 2 }],
  });
}
