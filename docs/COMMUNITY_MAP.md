# Public community observations

The community map uses a shared Redis database through `/api/community`.
It is separate from the earlier synthetic example map and in-memory preview.
The current implementation passed the focused tests, **16 isolated checks on
the provisioned Redis service**, and deployed browser publication, persistence
and removal checks below.
An unavailable or unconfigured database returns an explicit error. The product
does not substitute local storage or invented pins for a shared feed.

Every public pin is **self-reported and unverified**. The interface requires an
active microphone result and a separate public-sharing action. The API validates
the submitted metadata, consent flag and supported analysis method; it receives
no audio and cannot independently attest that a recording occurred or verify a
physical source. Public observations are not calibrated SPL measurements,
violations, source determinations, or corroboration of a nearby facility.

## What is shared

Only the explicit public draft fields are accepted:

- A chosen label of 1–80 characters and an optional note of up to 280 characters.
- Manually chosen coordinates, rounded by the client before transport and
  independently enforced **on the server** to three decimals.
- The client-reported UTC capture time; exact 5/15/30-second duration, supported
  44.1/48 kHz rate and sample count; actual frame count; `tw-screen-v2` method;
  quality flags, digital A/C levels, C−A difference and peak-screen status.
- An optional OpenStreetMap object type, numeric ID and short display name.
  Facility coordinates and arbitrary source URLs are not accepted. This reference
  is separate from the manually confirmed recording location and implies no
  causal association.

Server-issued UUIDs, publication timestamps and explicit unverified/approximate
provenance accompany the public data. No raw audio, spectra, AI results, device
IDs, uploader identity or private observation-form context is accepted. All
unknown request fields are rejected. Public text must be rendered as text,
including in Leaflet popups, rather than injected as HTML. Coordinate rounding
does not make identifying text safe to publish; users review only their chosen
public label and note, not an automatic copy of private report notes.

Blocking quality flags force all three numeric indicators to `null` and the
peak screen to `inconclusive`. Such a pin can remain descriptive. Real early
analysis exits can retain zero frames for near-zero, non-finite or unsupported
input; normal frame counts must match the complete recorded window. The API
does not manufacture frames or measurements for a blocked recording.

## Server configuration

Provision a Redis integration in the Vercel project and configure **server-only**
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or the alternate pair
`KV_REST_API_URL` and `KV_REST_API_TOKEN`. The token needs read/write/script
permissions. Never put either value in `src/`, `public/`, a `VITE_` variable, or
Git. The empty [.env.example](../.env.example) documents the names; actual local
credentials belong in ignored `.env.local` and deployed values in Vercel's
environment settings. Redeploy after changing production configuration.

The deployed `tonalwatch-community` resource uses the **free plan**, with paid
automatic upgrades and eviction disabled. It is connected only to Production;
Preview and Development do not receive the production database credentials.
Configure a separate development resource for routine local work. The isolated
provider qualification used an ignored temporary credentials file and rewrote
only its test keys into a random QA namespace; it did not populate the public map.
Empty primary template values allow the complete alternate pair. A partially
configured primary pair fails closed; credentials from different pairs are
never mixed.

The handler uses built-in `fetch` and fixed Redis Lua scripts over HTTPS REST;
no new package or client-side Redis SDK is needed. The REST endpoint must be
HTTPS, redirects are rejected, responses are bounded, and provider failures are
translated into a generic 503 without logging or returning credentials/provider
details. Missing configuration returns 503 `unconfigured`.

The key namespace is `tw:community:v1:`. A hash stores public rows with private
deletion-token hashes, and a lexicographically ordered sorted set stores
publication-time/UUID members. Create/index/idempotency and delete/index changes
are atomic Lua operations. Persistent publication-key hashes prevent duplicate
writes and prevent an old retry from recreating a removed pin. Public data has
no automatic expiry in this implementation. Provision capacity accordingly;
with a free plan and eviction disabled, capacity/quota failures must remain
errors rather than silently deleting pins or claiming publication succeeded.

## HTTP contract and bounded browsing

`GET /api/community` requires either `lat`, `lon`, and `radiusKm` (greater than
zero, at most 25 km), or `bbox=west,south,east,north` with a diagonal at most
50 km. Latitude is limited to −85…85 for the supported map, longitude to
−180…180. An unbounded global query is rejected. `limit` defaults to 100 and
must be 1…200. Duplicate or unexpected query parameters are rejected.

Each page inspects at most 500 recent global entries and returns matching pins
in publication order. `nextCursor` is bound to the chosen region. A page may
contain no matches yet still have a cursor: the UI can advance through older
entries. Reuse that cursor only with the same region, and clear pagination when
the search area changes. Responses state the inspected count and page limit.
Coordinates near the date line can use a center/radius query; a bounding box
cannot wrap across the date line.

`POST /api/community` requires same-origin JSON, the reviewed draft's explicit
`consent: true`, `inputKind: 'microphone'`, the empty `website` honeypot, and an
`Idempotency-Key` header containing a random UUID. The client retains one key
for retries of the **same reviewed draft**, including a timeout/cancel whose
server write may already have committed. No automatic retry or outcome-based
replacement occurs. Initial publication returns 201; an identical retry returns
200 with `replayed: true`. Changed public content under the same key returns
409; retrying a removed publication returns 410.

Publication returns a private deletion capability only in the publishing
response, including an authenticated-by-key identical retry. The public feed
never contains it. Redis stores only its hash; capability recovery uses a
server-only HMAC. Keep both the publication retry key and deletion token private.
The UI keeps management data in this tab's `sessionStorage`, under the versioned
`tonalwatch.community.tab.v1` key. The strict record contains at most 20 removal
capabilities with only their public ID, short label and rounded coordinates,
plus at most one pending reviewed public draft and its retry key. Its total
size is capped at 64 KiB; malformed or extraneous private fields are rejected.
It contains no microphone audio, private report context, spectrum or AI output.

The pending reviewed body and key are saved before sending POST. After a timeout,
cancel, navigation or reload, **Recover last publication** explicitly resends
those identical details/key; no write runs automatically on restore. Success
clears the pending entry and retains the removal capability. Per-tab storage
survives navigation/reload; if storage is unavailable, a visible warning explains
that management works only while the current page remains open. There is no
account-based recovery. Browser session restoration can affect how long tab
storage survives, so it is not a secure deletion mechanism. Rotating the server
Redis credential does not invalidate already issued deletion tokens, but can
prevent regeneration of a lost token through an old publication retry.

`DELETE /api/community` accepts JSON `{ "id": "…", "deleteToken": "…" }` from
the same origin. The capability never enters a URL. A wrong capability cannot
remove an existing pin; repeated deletion of an already absent ID is idempotent.

Writes are limited to 16 KiB. Per-hour anonymous publication/removal limits and
per-minute read limits use short-lived, server-salted HMAC buckets from Vercel's
trusted forwarded address; raw IPs are never stored in application rows or rate
keys. A global daily publication cap also bounds anonymous abuse. These controls
are not identity verification or a complete moderation service. Rate limits
return 429; cross-origin writes return 403; malformed data returns 400/413/415.
Successful responses are schema-validated by the client before rendering, with
a one-MiB transport bound. Errors leave local analysis and reports available.

## Verification and operating checks

Run `npx vitest run tests/community.test.ts tests/communityClient.test.ts`.
The initial **18 focused checks** passed against a stateful Redis REST double:
independent handler instances, duplicate/concurrent retries, owner deletion,
removed-publication retries, query filtering/pagination, privacy allowlists,
all six duration/rate combinations, early zero-frame results, failure isolation,
limits, bounded requests, malformed successful responses and cancellation input.
These unit tests verify the HTTP/storage contract; they do **not** execute Lua on
a real Redis server. Strict app TypeScript and an explicit strict compilation of
`api/community.ts` also passed.

On October 18, the compiled actual handler and fixed Lua scripts passed **16
checks on the provisioned Redis service**. A test-only fetch wrapper changed only
the EVAL command's `KEYS` prefix to a random, isolated `tw:qa:` namespace;
application scripts, arguments, validation and provider response handling were
unchanged. No production community keys or public posts were touched.
Two independent handler instances verified create/shared read, three-decimal
rounding, identical retry and capability recovery, changed-payload conflict,
wrong-capability rejection, owner deletion and removed-key retry protection.
Further checks verified a descriptive zero-frame/blocked record, separate
near/far records, cursor pagination and bounding-box filtering. All four created
QA rows were removed through their owner capabilities. An exact-prefix SCAN/DEL
removed eight remaining QA bookkeeping keys, and a final scan confirmed empty.
The redacted reports are `output/community-proof/report.json` and
`output/community-proof/redis-events.redacted.json`; they contain no provider
hostname, credentials, deletion tokens or publication retry keys. These are
real-storage software checks with generated metadata, not field observations or
proof of the deployed Vercel request path.

Public HTTPS qualification passed at source
`6a9f558eedc55b7839e45b1058d005f333089c3b`, deployment
`dpl_2ajcVoTdB9PPnuPNYsF8QgQz4Bcf`. A generated virtual microphone completed
a real 15-second AudioWorklet capture. The normal UI published a clearly labeled
temporary software check (HTTP 201); a separate browser context saw the saved
post without owner access. Coordinates were rounded before transport and at the
server. Private report notes, audio, bins and AI were absent from the public
request/feed. An identical retry returned the same post; a wrong removal
capability returned 404. The owner controls survived reload, removed the post,
and a fresh read confirmed its absence. All temporary public QA posts were
removed. This is software verification, not a field observation.

The public search returned 92 source records within 5 km of the selected Ashburn
city point. Optional street tiles loaded only after the explicit action. All six
routes passed 320/390/1280 px layouts at viewport scale 1 with reachable footers.
The native report text stayed concise (5,912 bytes, 94 lines, zero bin rows), and
print retained the full spectrum. No page or console errors were recorded.
All 32 checked static assets matched the exact release, including the dated
directory and all 23 unchanged AI payloads. See
[raw public evidence](qa/2026-10-18-community-public.json),
[isolated provider evidence](qa/2026-10-18-community-provider.json), and
[mocked UI recovery/layout evidence](qa/2026-10-18-community-ui.json).

The local Docker engine was unavailable; qualification used the provisioned
Redis service instead. No daemon, VM, container or alternate database was started.

Implementation references: [Upstash REST API](https://upstash.com/docs/redis/features/restapi)
and [Vercel request headers](https://vercel.com/docs/headers/request-headers).
