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

`.github/workflows/build.yml` controleert de JS-syntax en bouwt een multi-arch image (amd64/arm64) naar `ghcr.io/s4ndyp/gpstag`: `latest` en een korte commit-SHA. Alleen pushes naar `main` (of handmatig starten) triggeren een build.

## OwnTracks (automatisch op de achtergrond)

Installeer [OwnTracks](https://owntracks.org) (Android / iOS) en stel in:

| Instelling | Waarde |
|------------|--------|
| Mode | **HTTP** |
| URL / Host | `https://<jouw-domein>/api/owntracks` |
| Username | je GPSTag-gebruikersnaam (bestaat die nog niet, dan wordt hij aangemaakt) |
| Password | leeg of willekeurig (wordt niet gecontroleerd) |
| Device ID / Tracker ID | vrij te kiezen, bijv. `telefoon` / 2 letters |

Posities komen binnen met `source: "owntracks"`. OwnTracks krijgt als antwoord de laatste positie van de andere GPSTag-gebruikers, zodat die in de app als vrienden zichtbaar zijn. Via de *Monitoring*-modus in OwnTracks bepaal je hoe vaak er gestuurd wordt (bijv. *Significant* of *Move*).

Het endpoint (`pb_hooks/owntracks.pb.js`) herkent de gebruiker via de `X-Limit-U`-header, de Basic Auth-gebruikersnaam of `?u=<naam>` in de URL.
