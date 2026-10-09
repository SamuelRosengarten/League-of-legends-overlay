// Thin wrapper around the Tauri API so the UI also runs in a plain browser (preview mode).
const Bridge = (() => {
  const T = window.__TAURI__;
  const isApp = Boolean(T && T.core);
  if (isApp) document.documentElement.classList.add("app");
  return {
    isApp,
    invoke: (cmd, args) => (isApp ? T.core.invoke(cmd, args) : Promise.reject(new Error("not in app"))),
    listen: (event, fn) => { if (isApp) T.event.listen(event, (e) => fn(e.payload)); },
  };
})();
