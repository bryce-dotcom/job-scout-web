# Pipeline Map prototype

Standalone, dependency-free prototype of a SalesRabbit-style map view for the
Sales Pipeline: pins colored by pipeline stage, drawn territories with lead
counts, address search, and a road route through the open leads in view.

Feasibility write-up: https://claude.ai/code/artifact/1eee4133-f0b4-45e4-af3f-4dd944ef9093

## Run

Open `index.html` directly in a browser, or:

```
node prototypes/pipeline-map/server.js
```

and visit http://localhost:5173. Demo data is 48 fictional leads in Gilbert, AZ.
"Reset demo" restores it. State lives in localStorage; "Export JSON" backs it up.

## What it uses (demo-only services, swap before shipping)

- Leaflet 1.9.4 + Leaflet.draw 1.0.4 from cdnjs (the app already depends on
  `leaflet` in package.json and loads it from unpkg in `src/pages/FieldScout.jsx`)
- OpenStreetMap public tiles (light use only)
- Nominatim for geocoding / reverse geocoding (~1 req/s)
- OSRM public demo server for road routing (not for production)

## Folding it into JobScout

- **Page:** a new `src/pages/PipelineMap.jsx` next to `SalesPipeline.jsx`, using
  the same Leaflet init pattern as `FieldScout.jsx` and the `defaultStages`
  colors from `SalesPipeline.jsx` so pins match the board.
- **Data:** `leads` has `address` (text) but no coordinates. Add `latitude` and
  `longitude` columns and geocode on insert/update (the Google Maps loader in
  `src/lib/googleMaps.js` already has `places`; or Geocodio for batch backfill).
- **Territories:** a `territories` table (`company_id`, `name`, `polygon`
  as GeoJSON or PostGIS geometry, `owner_id` -> employees). PostGIS
  `ST_Contains` replaces the client-side point-in-polygon in this file.
- **Routing:** self-host OSRM/Valhalla or use the Google Directions API with
  the existing key; the prototype's nearest-neighbour ordering is fine to keep.
- **Filters:** stage filter maps to `leads.status`; also filter by
  `salesperson_id` / `lead_owner_id` for a per-rep view.
