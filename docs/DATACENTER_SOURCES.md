# Datacenter directory sources

The nearby directory uses an unchanged, dated OpenStreetMap snapshot published by [OpenDatacenterMap](https://opendatacentermap.deuxfleurs.page/). It provides context for the community map. A nearby entry does not establish the origin of a sound, current operation, a noise level or a violation. Community observations and directory entries have separate provenance.

## Bundled snapshot and reuse

- Public asset: [complete original GeoJSON](../public/data/datacenters-osm-2026-10-18.json), served at `/data/datacenters-osm-2026-10-18.json` with no transformation.
- Download source: <https://opendatacentermap.deuxfleurs.page/data.geojson>.
- Downloaded 2026-10-18; 3,142,621 bytes; 5,035 features.
- SHA-256: `69e8c95a052c6e25d4ad4c2d6431327ed977ccca54fb12e036c7f9c9ff4a1a45`.
- Publisher `generated_at`: `2026-10-18T00:21:18.778606`. This value has **no timezone**; it is preserved as supplied, without converting it to UTC or treating it as an OSM database timestamp. HTTP Last-Modified was `Sun, 18 Oct 2026 00:21:22 GMT`.
- Metadata identifies OpenStreetMap, ODbL and `overpass_api`; it does not supply the underlying OSM base timestamp.
- Data: **© OpenStreetMap contributors**, available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/) and [OSM attribution requirements](https://www.openstreetmap.org/copyright/). The complete original database above remains publicly downloadable under that license. Do not remove its license/attribution when redistributing it; publish qualifying derivative databases under ODbL as required.

The publisher's [README](https://framagit.org/opendatacentermap/opendatacentermap-interactive/-/blob/main/README.md) explicitly encourages reuse and identifies ODbL for the data. The project's BSD-3-Clause code license is separate. No publisher code is included in this app. Source inspection used commit `c5c30da508bee0165fd3a4247312b75affc301ad`, notably [main.py](https://framagit.org/opendatacentermap/opendatacentermap-interactive/-/blob/c5c30da508bee0165fd3a4247312b75affc301ad/main.py). The publisher's site identifies a private editor, Deuxfleurs hosting and no personal-data collection. The app does not contact that site during nearby searches.

This release bundles a fixed snapshot. The publisher may refresh its own copy; **the app does not automatically refresh this asset or promise current coverage**. A future update must review source/license/schema, preserve the new raw bytes under a new dated filename, update the source pin and tests, then deploy it. The file test checks exact bytes. The app's ordinary same-origin JSON fetch is not presented as cryptographic data certification.

## Meaning and limitations

The publisher collects OSM `telecom=data_center`, `building=data_center` and several proposed/construction variants. This does not cover every facility; standalone `industrial=data_centre` entries absent those other tags may be missing. The parser accepts that documented site tag when present, but cannot recover records absent from the snapshot. See [OSM tag guidance](https://wiki.openstreetmap.org/wiki/Tag:telecom%3Ddata_center).

The app requires a positive documented facility/building/site tag. It omits explicit planned, construction, disused, abandoned, demolished or razed tags, and conflicting substations. Other missing or stale lifecycle tags remain possible. It reads original `tags.name` / `tags.name:en` and `tags.operator`; it ignores the publisher's fallback name and inferred “functional” status. Missing names/operators stay missing. Building purpose alone does not verify present use.

OSM node locations are mapped points. Way/relation points are Overpass **bounding-box centers**, as established by the publisher's `out center` conversion. Distances are approximate spherical point/center distances, not building boundaries or sound propagation. Separate node/way/relation IDs are retained even when they may describe the same real campus; only identical OSM type+ID entries are deduplicated.

The entire catalog is filtered locally for the selected center and a whole-kilometer radius of 1–25 km. At most the nearest 200 qualifying records are returned after sorting. `receivedCount` is the full catalog count; `omittedCount` includes everything not displayed (outside radius, invalid, excluded, duplicate or beyond the cap), **not just malformed records**. `truncated` means more than 200 qualifying records fell inside the radius. An empty result is incomplete directory coverage, not proof of no nearby datacenters.

For the public Ashburn point `39.04376, -77.48744`, the pinned source returns **5** qualifying records within 3 km and **198** within 10 km under these rules. These are source/parser checks, not independently verified facility or noise measurements.

## Explicit city or ZIP search

Only an explicit city/ZIP submission calls [Open-Meteo's geocoding API](https://open-meteo.com/en/docs/geocoding-api), with US scope, up to five candidates and no autocomplete. The user chooses a candidate; the app does not silently choose an ambiguous first result. Names and approximate coordinates come from [GeoNames](https://www.geonames.org/) via Open-Meteo, with CC BY 4.0 attribution.

[Open-Meteo's free API terms](https://open-meteo.com/en/terms), checked 2026-10-18, permit noncommercial use subject to limits (10,000/day, 5,000/hour and 600/minute). This personal hackathon app uses that noncommercial service. A commercial use must obtain an appropriate plan or replace it. The service receives the submitted city/ZIP and ordinary request metadata such as IP; the UI discloses this before submission. Do not submit a resident address or personal details. The module requests no GPS permission and sends no microphone audio, observation notes or community data. The nearby action itself only fetches this app's fixed same-origin snapshot; its chosen coordinates are not sent to an external lookup provider.

Requests are sequential per client, cancelable and timed out, with response byte bounds and visible errors. There are no automatic retries, hidden provider fallbacks or panning-triggered calls.

## Operational check and rejected provider

Two bounded 3 km Ashburn GETs to Private.coffee's Overpass endpoint returned HTTP 500 on 2026-10-18, including one from isolated Chrome. The browser response also lacked `Access-Control-Allow-Origin`; the error body was unavailable to browser JavaScript. No cause was inferred from that response. This provider is **not used by the released module**; no silent fallback makes a failed live lookup look successful. The fixed, licensed snapshot above is the deliberate primary source.

An isolated Chrome transport harness subsequently exercised the actual compiled discovery module with this complete asset served at the same origin: explicit Find returned the five 3 km records above from one HTTP 200 GET with no request body or coordinate parameters. A separate explicit `Ashburn, VA` city search returned five GeoNames candidates, including Ashburn, Virginia (`4744870`, `39.04372, -77.48749`); the real Open-Meteo response was HTTP 200 with `Access-Control-Allow-Origin: *`. Both requests had empty bodies; the harness console had zero errors/warnings. This verifies module transport and parsing, not the complete mounted map UI, public deployment or independent facility ground truth.
