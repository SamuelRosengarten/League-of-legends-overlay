// Small DOM helpers shared by the views.
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}

// Line icons for the header controls (16px, stroke = currentColor).
const SVG_PATHS = {
  expand: "M4 6l4 4 4-4",
  collapse: "M4 10l4-4 4 4",
  gear: "M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
  hide: "M4 4l8 8M12 4l-8 8",
  lock: "M4.5 7V5a3.5 3.5 0 017 0v2M3.5 7h9v6.5h-9z",
  unlock: "M4.5 7V5a3.5 3.5 0 016.7-1.4M3.5 7h9v6.5h-9z",
  search: "M7 2.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM10.3 10.3L13.5 13.5",
  copy: "M5.5 5.5h7v8h-7zM3.5 10.5v-8h7",
};
function svgIcon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 16 16");
  s.setAttribute("aria-hidden", "true");
  s.classList.add("svg");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", SVG_PATHS[name]);
  s.append(p);
  return s;
}

function initials(name) {
  return String(name).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// An icon tile: real icon when Data Dragon has it, otherwise a readable initials tile.
// `info` = {img, desc} or null. Always carries the name for tooltips and screen readers.
function iconTile(name, info, opts = {}) {
  const size = opts.size || "md";
  const tile = el("span", {
    class: `ic ic-${size}${opts.kind ? " ic-" + opts.kind : ""}`,
    role: "img", "aria-label": name, tabindex: opts.focusable === false ? null : "0",
    "data-tip-title": name, "data-tip": (info && info.desc) || opts.fallbackDesc || "",
  });
  const fallback = () => tile.replaceChildren(el("span", { class: "ic-fallback", text: initials(name) }));
  if (info && info.img) {
    const img = el("img", { src: info.img, alt: "", decoding: "async", draggable: "false" });
    img.addEventListener("error", fallback, { once: true });
    tile.append(img);
  } else {
    fallback();
  }
  if (opts.badge) tile.append(el("span", { class: "ic-badge", text: opts.badge }));
  return tile;
}

// One shared tooltip, shown on hover or keyboard focus of anything with data-tip-title.
const Tooltip = {
  node: null,
  init() {
    this.node = el("div", { class: "tooltip", role: "tooltip", hidden: true });
    document.body.append(this.node);
    const show = (e) => {
      const t = e.target.closest && e.target.closest("[data-tip-title]");
      if (t) this.show(t);
    };
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("mouseout", (e) => { if (e.target.closest && e.target.closest("[data-tip-title]")) this.hide(); });
    document.addEventListener("focusout", () => this.hide());
    document.addEventListener("scroll", () => this.hide(), true);
  },
  show(target) {
    const title = target.getAttribute("data-tip-title");
    const body = target.getAttribute("data-tip");
    this.node.replaceChildren(...[el("strong", { text: title }), body ? el("span", { text: body }) : null].filter(Boolean));
    this.node.hidden = false;
    const r = target.getBoundingClientRect(), t = this.node.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    let left = Math.min(Math.max(6, r.left + r.width / 2 - t.width / 2), vw - t.width - 6);
    let top = r.bottom + 6;
    if (top + t.height > vh - 4) top = Math.max(4, r.top - t.height - 6);
    this.node.style.left = `${left}px`;
    this.node.style.top = `${top}px`;
  },
  hide() { if (this.node) this.node.hidden = true; },
};

// Copy text; falls back to a hidden textarea where the async clipboard API is unavailable.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el("textarea", { class: "sr-only", "aria-hidden": "true" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
