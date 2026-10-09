const $ = (id) => document.getElementById(id);

function render(g) {
  $("waiting").hidden = g.inGame;
  $("game").hidden = !g.inGame;
  if (!g.inGame) { $("clock").textContent = ""; return; }
  $("champ").textContent = g.champion;
  $("level").textContent = g.level;
  $("gold").textContent = g.gold;
  const m = String(Math.floor(g.gameTime / 60)), s = String(g.gameTime % 60).padStart(2, "0");
  $("clock").textContent = `${m}:${s}`;
  const ul = $("items");
  ul.replaceChildren(...g.items.map((i) => {
    const li = document.createElement("li");
    li.textContent = i.count > 1 ? `${i.name} x${i.count}` : i.name;
    return li;
  }));
}

window.__TAURI__.event.listen("game-state", (e) => render(e.payload));
