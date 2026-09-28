(() => {
  "use strict";

  const API = "/api/collections";
  const USER_KEY = "gpstag.userId";
  const PALETTE = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];

  const $ = (id) => document.getElementById(id);
  const state = {
    users: [],
    selectedOnMap: new Set(),
    range: { hours: 12 },
    map: null,
    layer: null,
    fittedOnce: false,
  };

  // ---------- API ----------
  async function api(path, options = {}) {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch (_) {}
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  async function listAll(collection, params) {
    const items = [];
    let page = 1;
    while (true) {
      const q = new URLSearchParams({ ...params, page, perPage: 500, skipTotal: 1 });
      const data = await api(`/${collection}/records?${q}`);
      items.push(...data.items);
      if (data.items.length < 500) break;
      page++;
    }
    return items;
  }

  // PocketBase stores dates as "YYYY-MM-DD HH:MM:SS.sssZ" (UTC).
  const pbDate = (d) => d.toISOString().replace("T", " ");
  const fmt = (s) => new Date(s.replace(" ", "T")).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const colorOf = (user) => user.color || PALETTE[state.users.indexOf(user) % PALETTE.length];

  // ---------- Users ----------
  async function loadUsers() {
    state.users = await listAll("gpsusers", { sort: "name" });
    renderUserSelect();
    renderUserFilter();
  }

  function renderUserSelect() {
    const sel = $("user-select");
    const current = localStorage.getItem(USER_KEY);
    sel.innerHTML = state.users.length
      ? state.users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("")
      : `<option value="">— maak eerst een gebruiker aan —</option>`;
    if (current && state.users.some((u) => u.id === current)) sel.value = current;
    else if (state.users[0]) localStorage.setItem(USER_KEY, state.users[0].id);
    loadRecent();
  }

  async function addUser(name) {
    const color = PALETTE[state.users.length % PALETTE.length];
    const user = await api("/gpsusers/records", { method: "POST", body: JSON.stringify({ name, color }) });
    localStorage.setItem(USER_KEY, user.id);
    state.selectedOnMap.add(user.id);
    await loadUsers();
  }

  // ---------- Send position ----------
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("Geolocatie wordt niet ondersteund"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
    });
  }

  async function sendPosition(source = "manual") {
    const userId = $("user-select").value;
    const status = $("send-status");
    const btn = $("send-btn");
    status.classList.remove("error");
    if (!userId) {
      status.textContent = "Kies of maak eerst een gebruiker.";
      status.classList.add("error");
      return false;
    }
    btn.disabled = true;
    status.textContent = "Locatie bepalen…";
    try {
      const pos = await getPosition();
      const c = pos.coords;
      await api("/positions/records", {
        method: "POST",
        body: JSON.stringify({
          user: userId,
          lat: c.latitude,
          lon: c.longitude,
          accuracy: c.accuracy,
          altitude: c.altitude,
          speed: c.speed,
          heading: c.heading,
          recorded_at: pbDate(new Date(pos.timestamp)),
          source,
        }),
      });
      status.textContent = `Opgeslagen: ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)} (±${Math.round(c.accuracy)} m)`;
      loadRecent();
      return true;
    } catch (err) {
      status.textContent = "Mislukt: " + (err.message || "onbekende fout");
      status.classList.add("error");
      return false;
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Auto send ----------
  // Browsers suspend JS in the background, so this only runs while the app is visible;
  // an overdue send is caught up as soon as the app becomes visible again.
  const AUTO_KEY = "gpstag.auto";
  const AUTO_LAST_KEY = "gpstag.autoLast";
  const AUTO_INTERVAL = 60 * 60 * 1000;
  let autoBusy = false;

  const autoEnabled = () => localStorage.getItem(AUTO_KEY) === "1";

  function renderAutoStatus() {
    const el = $("auto-status");
    if (!autoEnabled()) {
      el.textContent = "Werkt alleen zolang de app open is.";
      return;
    }
    const last = Number(localStorage.getItem(AUTO_LAST_KEY)) || 0;
    const next = new Date(Math.max(Date.now(), last + AUTO_INTERVAL));
    const t = (d) => d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
    el.textContent = (last ? `Laatst automatisch: ${t(new Date(last))} · ` : "") + `Volgende: ${t(next)} (app moet open zijn)`;
  }

  async function autoTick() {
    if (!autoEnabled() || autoBusy || document.visibilityState !== "visible") return;
    const last = Number(localStorage.getItem(AUTO_LAST_KEY)) || 0;
    if (Date.now() - last < AUTO_INTERVAL) return;
    autoBusy = true;
    try {
      if (await sendPosition("auto")) localStorage.setItem(AUTO_LAST_KEY, String(Date.now()));
    } finally {
      autoBusy = false;
      renderAutoStatus();
    }
  }

  function initAuto() {
    const toggle = $("auto-toggle");
    toggle.checked = autoEnabled();
    toggle.addEventListener("change", () => {
      localStorage.setItem(AUTO_KEY, toggle.checked ? "1" : "0");
      renderAutoStatus();
      autoTick();
    });
    document.addEventListener("visibilitychange", autoTick);
    setInterval(() => { renderAutoStatus(); autoTick(); }, 60 * 1000);
    renderAutoStatus();
    autoTick();
  }

  async function loadRecent() {
    const userId = $("user-select").value;
    const list = $("recent-list");
    if (!userId) { list.innerHTML = ""; return; }
    try {
      const q = new URLSearchParams({ filter: `user="${userId}"`, sort: "-recorded_at", perPage: 5, skipTotal: 1 });
      const data = await api(`/positions/records?${q}`);
      list.innerHTML = data.items.length
        ? data.items.map((p) => `<li><span>${fmt(p.recorded_at)}</span><span class="muted">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span></li>`).join("")
        : `<li class="muted">Nog geen posities</li>`;
    } catch (err) {
      list.innerHTML = `<li class="error">${esc(err.message)}</li>`;
    }
  }

  // ---------- Map ----------
  function initMap() {
    if (state.map) return;
    state.map = L.map("map", { zoomControl: true }).setView([52.1, 5.3], 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "dark-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(state.map);
    state.layer = L.featureGroup().addTo(state.map);
  }

  function renderUserFilter() {
    if (state.selectedOnMap.size === 0) state.users.forEach((u) => state.selectedOnMap.add(u.id));
    $("user-filter").innerHTML = state.users
      .map((u) => {
        const on = state.selectedOnMap.has(u.id);
        return `<button class="chip ${on ? "" : "off"}" data-user="${u.id}"><span class="dot" style="background:${colorOf(u)}"></span>${esc(u.name)}</button>`;
      })
      .join("");
  }

  function currentRange() {
    if (state.range.hours) {
      const to = new Date();
      return { from: new Date(to.getTime() - state.range.hours * 3600e3), to };
    }
    return { from: state.range.from, to: state.range.to };
  }

  async function loadMap() {
    if (!state.map) return;
    const status = $("map-status");
    status.classList.remove("error");
    const ids = [...state.selectedOnMap].filter((id) => state.users.some((u) => u.id === id));
    state.layer.clearLayers();
    if (!ids.length) { status.textContent = "Geen gebruikers geselecteerd."; return; }

    const { from, to } = currentRange();
    const userFilter = ids.map((id) => `user="${id}"`).join(" || ");
    const filter = `(${userFilter}) && recorded_at >= "${pbDate(from)}" && recorded_at <= "${pbDate(to)}"`;
    status.textContent = "Laden…";
    try {
      const points = await listAll("positions", { filter, sort: "recorded_at" });
      const byUser = new Map();
      for (const p of points) {
        if (!byUser.has(p.user)) byUser.set(p.user, []);
        byUser.get(p.user).push(p);
      }
      for (const [uid, pts] of byUser) {
        const user = state.users.find((u) => u.id === uid);
        const color = colorOf(user);
        const latlngs = pts.map((p) => [p.lat, p.lon]);
        if (latlngs.length > 1) L.polyline(latlngs, { color, weight: 3, opacity: 0.7 }).addTo(state.layer);
        pts.forEach((p, i) => {
          const last = i === pts.length - 1;
          L.circleMarker([p.lat, p.lon], {
            radius: last ? 8 : 4,
            color,
            fillColor: color,
            fillOpacity: last ? 1 : 0.6,
            weight: last ? 3 : 1,
          })
            .bindPopup(`<b>${esc(user.name)}</b><br>${fmt(p.recorded_at)}<br>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}${p.accuracy ? `<br>±${Math.round(p.accuracy)} m` : ""}`)
            .addTo(state.layer);
        });
      }
      status.textContent = `${points.length} posities van ${byUser.size} gebruiker(s) · ${fmt(pbDate(from))} – ${fmt(pbDate(to))}`;
      if (points.length) state.map.fitBounds(state.layer.getBounds(), { padding: [40, 40], maxZoom: 16 });
    } catch (err) {
      status.textContent = "Fout: " + err.message;
      status.classList.add("error");
    }
  }

  const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  // ---------- Views & events ----------
  function showView(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
    if (name === "map") {
      initMap();
      setTimeout(() => { state.map.invalidateSize(); loadMap(); }, 0);
    }
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));

    $("user-select").addEventListener("change", (e) => {
      localStorage.setItem(USER_KEY, e.target.value);
      loadRecent();
    });
    $("add-user-btn").addEventListener("click", () => {
      $("add-user-form").classList.toggle("hidden");
      $("new-user-name").focus();
    });
    $("add-user-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("new-user-name").value.trim();
      if (!name) return;
      try {
        await addUser(name);
        $("new-user-name").value = "";
        $("add-user-form").classList.add("hidden");
      } catch (err) {
        alert("Gebruiker aanmaken mislukt: " + err.message);
      }
    });
    $("send-btn").addEventListener("click", () => sendPosition("manual"));

    document.querySelectorAll(".presets .chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        document.querySelectorAll(".presets .chip").forEach((c) => c.classList.toggle("active", c === chip));
        const custom = chip.dataset.hours === "custom";
        $("custom-range").classList.toggle("hidden", !custom);
        if (custom) {
          const { from, to } = currentRange();
          $("range-from").value = toLocalInput(from);
          $("range-to").value = toLocalInput(to);
        } else {
          state.range = { hours: Number(chip.dataset.hours) };
          loadMap();
        }
      })
    );
    $("range-apply").addEventListener("click", () => {
      const from = new Date($("range-from").value);
      const to = new Date($("range-to").value);
      if (isNaN(from) || isNaN(to) || from >= to) {
        $("map-status").textContent = "Ongeldige periode.";
        $("map-status").classList.add("error");
        return;
      }
      state.range = { from, to };
      loadMap();
    });

    $("user-filter").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-user]");
      if (!chip) return;
      const id = chip.dataset.user;
      if (state.selectedOnMap.has(id)) state.selectedOnMap.delete(id);
      else state.selectedOnMap.add(id);
      chip.classList.toggle("off", !state.selectedOnMap.has(id));
      loadMap();
    });
  }

  async function init() {
    bindEvents();
    try {
      await loadUsers();
    } catch (err) {
      $("send-status").textContent = "Kan database niet bereiken: " + err.message;
      $("send-status").classList.add("error");
    }
    initAuto();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  init();
})();
