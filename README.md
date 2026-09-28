# GPSTag

Donkere PWA (mobiel + desktop) om GPS-posities door te geven en op een kaart te bekijken. Opslag in [PocketBase](https://pocketbase.io) (v0.40.4), alles in één Docker-container.

## Functies

- Kies wie je bent (of maak een nieuwe gebruiker aan); de keuze wordt op het apparaat onthouden.
- Knop **Locatie doorgeven** slaat de huidige GPS-positie op onder die gebruiker.
- Kaartweergave (donkere kaart) met periode: laatste 12 uur, 24 uur, 7 dagen, 31 dagen of een eigen periode.
- Kies welke gebruikers je op de kaart ziet; elke gebruiker heeft een eigen kleur, de laatste positie is een grotere stip.
- Installeerbaar als PWA (manifest + service worker).

## Starten

```bash
docker compose up -d                                  # image uit GHCR
docker compose -f docker-compose.dev.yml up --build   # lokaal bouwen, live pb_public
```

App: http://localhost:8090 · PocketBase admin: http://localhost:8090/_/

> Geolocatie en PWA-installatie werken in de browser alleen via **HTTPS** (of `localhost`). Zet er dus een reverse proxy met TLS voor (bijv. Caddy, Traefik of Nginx Proxy Manager).

## Database

De collecties worden automatisch aangemaakt door `pb_migrations/`. Alle API-regels staan open (geen login).

| Collectie  | Velden |
|------------|--------|
| `gpsusers` | `name` (uniek), `color` |
| `positions`| `user` → gpsusers, `lat`, `lon`, `accuracy`, `altitude`, `speed`, `heading`, `recorded_at`, `source` |

## Build

`.github/workflows/build.yml` controleert de JS-syntax en bouwt een multi-arch image (amd64/arm64) naar `ghcr.io/s4ndyp/gpstag`: `latest` voor `main`, branchnaam voor andere branches, semver voor `v*`-tags. Pull requests worden alleen gebouwd, niet gepusht.

## Later

Automatisch en op de achtergrond posities versturen op mobiel (`source` veld is daar al op voorbereid).
