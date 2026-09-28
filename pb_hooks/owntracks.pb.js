/// <reference path="../pb_data/types.d.ts" />

// OwnTracks HTTP mode endpoint.
// App settings: Mode = HTTP, URL = https://<host>/api/owntracks, Username = GPSTag user name.
// The user name is taken from the X-Limit-U header (OwnTracks "Username"), the basic auth user,
// or the ?u= query parameter; unknown names are created automatically.
// The response contains the latest position of all other users so they show up as friends.
routerAdd("POST", "/api/owntracks", (e) => {
  const PALETTE = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];

  let name = (e.request.header.get("X-Limit-U") || "").trim();
  if (!name) {
    try {
      const basic = e.request.basicAuth();
      if (basic && basic[2]) name = String(basic[0]).trim();
    } catch (_) {}
  }
  if (!name) name = (e.request.url.query().get("u") || "").trim();
  if (!name) return e.json(400, { message: "Geen gebruiker: stel een Username in OwnTracks in." });

  const msg = e.requestInfo().body || {};

  let user;
  try {
    user = $app.findFirstRecordByData("gpsusers", "name", name);
  } catch (_) {
    const col = $app.findCollectionByNameOrId("gpsusers");
    const count = $app.countRecords("gpsusers");
    user = new Record(col, { name, color: PALETTE[count % PALETTE.length] });
    $app.save(user);
  }

  if (msg._type === "location" && typeof msg.lat === "number" && typeof msg.lon === "number") {
    const tst = typeof msg.tst === "number" ? msg.tst * 1000 : Date.now();
    const rec = new Record($app.findCollectionByNameOrId("positions"), {
      user: user.id,
      lat: msg.lat,
      lon: msg.lon,
      accuracy: msg.acc || 0,
      altitude: msg.alt || 0,
      speed: typeof msg.vel === "number" ? msg.vel / 3.6 : 0,
      heading: msg.cog || 0,
      recorded_at: new Date(tst).toISOString(),
      source: "owntracks",
    });
    $app.save(rec);
  }

  const out = [];
  const others = $app.findRecordsByFilter("gpsusers", "id != {:id}", "name", 0, 0, { id: user.id });
  for (const other of others) {
    const latest = $app.findRecordsByFilter("positions", "user = {:u}", "-recorded_at", 1, 0, { u: other.id });
    if (!latest.length) continue;
    const p = latest[0];
    const otherName = other.getString("name");
    const topic = "owntracks/" + otherName + "/gpstag";
    const tid = otherName.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "??";
    out.push({ _type: "card", topic, name: otherName, tid });
    out.push({
      _type: "location",
      topic,
      tid,
      lat: p.getFloat("lat"),
      lon: p.getFloat("lon"),
      acc: Math.round(p.getFloat("accuracy")),
      tst: Math.floor(p.getDateTime("recorded_at").unix()),
    });
  }

  return e.json(200, out);
});
