/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const gpsusers = new Collection({
      name: "gpsusers",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        { name: "name", type: "text", required: true, presentable: true, min: 1, max: 100 },
        { name: "color", type: "text", required: false, max: 20 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_gpsusers_name ON gpsusers (name)"],
    });
    app.save(gpsusers);

    const positions = new Collection({
      name: "positions",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          collectionId: gpsusers.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: "lat", type: "number", required: true, min: -90, max: 90 },
        { name: "lon", type: "number", required: true, min: -180, max: 180 },
        { name: "accuracy", type: "number", required: false },
        { name: "altitude", type: "number", required: false },
        { name: "speed", type: "number", required: false },
        { name: "heading", type: "number", required: false },
        { name: "recorded_at", type: "date", required: true },
        { name: "source", type: "text", required: false, max: 20 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE INDEX idx_positions_user_time ON positions (user, recorded_at)",
        "CREATE INDEX idx_positions_time ON positions (recorded_at)",
      ],
    });
    app.save(positions);
  },
  (app) => {
    for (const name of ["positions", "gpsusers"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
