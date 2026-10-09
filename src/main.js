const $ = (id) => document.getElementById(id);

// The backend only sends updates on change, so the clock ticks locally between them.
let gameTime = null;
function drawClock() {
  if (gameTime === null) { $("clock").textContent = ""; return; }
  const m = Math.floor(gameTime / 60), s = String(gameTime % 60).padStart(2, "0");
  $("clock").textContent = `${m}:${s}`;
}
setInterval(() => { if (gameTime !== null) { gameTime += 1; drawClock(); } }, 1000);

function render(g) {
  $("waiting").hidden = g.inGame;
  $("game").hidden = !g.inGame;
  gameTime = g.inGame ? g.gameTime : null;
  drawClock();
  if (!g.inGame) return;
  $("champ").textContent = g.champion;
  $("level").textContent = g.level;
  $("gold").textContent = g.gold;
  const ul = $("items");
  ul.replaceChildren(...g.items.map((i) => {
    const li = document.createElement("li");
    li.textContent = i.count > 1 ? `${i.name} x${i.count}` : i.name;
    return li;
  }));
}

window.__TAURI__.event.listen("game-state", (e) => render(e.payload));
