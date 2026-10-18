# TonalWatch deployment verification

Verified October 18, 2026, in Chrome 155 on Windows.

## Current microphone-only release

- Public URL: [tonalwatch.vercel.app](https://tonalwatch.vercel.app).
- Application source: `322d40e0d9a0146e35c61e1a46b05d7e9fffb662` on main; deployment `dpl_EhmQkBGYPCodTYTEq8qHN2Twgikp`, production **READY**. Published from an exact Git archive to the existing TonalWatch project. Later research/documentation commits do not change these application sources.
- Fresh Vercel `npm ci` found zero vulnerabilities; TypeScript/Vite build succeeded. The matching application/lab checkout passed **388 tests across 19 files** (349 app + 39 standalone-lab checks).
- Observation accepts live microphone capture only, with visible 5/15/30-second choices. File and Demo input controls, their runtime imports/state, Home shortcut and stale instructions are removed. Permission, missing-device, unsupported-browser and interruption errors describe microphone recovery. Learn's listening aids and the map's labeled illustrations remain separate from observation inputs.
- Public Chrome reproduced an immediate Cancel → Retry startup failure before the first committed chunk. The recorder now discards only provisional startup audio, restarting contiguous sample indices at zero. Missing samples after the first chunk still invalidate capture, and the no-data watchdog, warm-up and exact capture counts remain intact.
- Public HTTPS recheck passed live meter → Cancel (zero analysis) → immediate Retry → complete 15-second AudioWorklet capture → report → native text download. The result retained **720,000 samples / 174 frames at 48 kHz**, microphone provenance and method `tw-screen-v2`. Every microphone track ended after cancel, completion and navigation. Generated virtual-microphone QA is explicitly labeled in the screenshots; this does not validate physical hardware.
- Native text summary: **5,828 bytes / 94 lines**, no individual bin rows. The actual SVG graph remained visible under print media and the toolbar hid. All six pages at **320/390/1280 px** had no file inputs, stale input instructions or horizontal overflow; scrolling reached the footer within half a pixel. No page or console errors occurred. Optional AI inference was not requested in this release check; the trained research candidates remain outside the app.
- Home, Observation, Learn, Report and Sources screenshots were refreshed from this public release. The incoming judge guide was separately updated to use the current live microphone workflow and explain the app's measured limits.

## Prior sustained-peak correction release

- Public URL: [tonalwatch.vercel.app](https://tonalwatch.vercel.app).
- Application source: `c54ab688548a93bfc88720617e5c50d9971c1392` on main; deployment `dpl_4ESRPj5Moqk7xHLKmrgYwu5qFj3S`, production **READY**. Later research/documentation commits do not change these app sources.
- Exact Git-archive deployment; fresh `npm ci` found zero vulnerabilities and TypeScript/Vite production build succeeded. The matching checkout passed **380 tests across 19 files** (341 app + 39 standalone-lab checks).
- Method `tw-screen-v2` retains the same PSD, weighted levels and quality/peak eligibility gates, then ranks eligible sustained tracks by median three-bin power. A generated PCM16 artifact 99.20 dB weaker than a 63 Hz tone no longer wins on prominence alone. Sources discloses the new selection rule without claiming a fundamental or source.
- The repository's separate lab mirrors the selection as `tw-field-lab-v3`; structured v2/v3 records retain their original values and versions. The static Vite app does not publish that standalone instrument.
- Concise text summaries, visual report/print spectrum, visible duration choices, negative-dB explanations and supported WAV-rate preservation remain included. The trained research classifier remains outside the app; [strict candidate browser parity failed](../ml/runs/2026-10-18-v2-browser-parity/README.md).
- Public HTTPS verification loaded `index-TOHZiOpm.js` and analyzed the generated 15-second 44.1 kHz PCM16 fixture: **661,500 samples / 160 frames / peak 64.599609375 Hz**, A −49.179906, C −23.835842 and C−A 25.344064 dB. Pre-correction PSD reference bins agreed within 1e−6; the safe decoder provenance and five-second AI prefix boundary remained intact. No model inference/download was requested.
- Native text download was **6,576 bytes / 99 lines / zero bin rows**. It retained the corrected candidate, version and full recording provenance. The graph remained visible in print media and toolbar controls hid. Report and Sources at **320/390/1280 px** had no horizontal overflow; scrolling to the maximum reached a fully visible footer in every case (less than 0.5 px rounding). No page/console/HTTP/request errors occurred. Observation, Report and Sources screenshots were refreshed from this public release, with generated-QA context explicitly identified.

## Prior report and audio-import release

- Public URL: [tonalwatch.vercel.app](https://tonalwatch.vercel.app), checked without authentication.
- Application source: main commit `0b94eb0e092fbb4a30c94407a62f01a0d91cbaeb`; deployment `dpl_8DJ8cYJBXhj5wGhTsgDoA6zPf92f`, production **READY**. Subsequent research/documentation commits do not change these app sources.
- Published from an exact Git archive, excluding experiment caches, training modules, field CSVs and local output. Fresh `npm ci` found zero vulnerabilities; TypeScript/Vite build succeeded. The matching checkout passed **365 tests in 18 files** (330 app + 35 standalone-lab checks).
- Recording controls expose 5/15/30 seconds, with a direct 15-second microphone action from Demo. Digital negative dB and the separate signed C−A difference have visible explanations. These controls were first published at `48010fc` (`dpl_Dfgfi9D3qVhPguPHnR55DZ36oQbT`).
- Text exports contain a concise spectrum summary without individual bin rows. The actual spectrum remains in the report and print/PDF view. This first passed public download/print checks at `55a0dcb` (`dpl_2G7KJB1Ptbfs3vCVpCG43YfoUAAs`): 7,610 bytes, 109 lines, zero CSV bin rows, with 15-second/720,000-sample/174-frame provenance and references retained.
- The current release avoids an extra decoding resample for supported WAV rates and preserves safe decoder provenance. A public 15-second 44.1 kHz PCM16 import retained **661,500 samples, 160 frames and 5.383 Hz/bin**. Its report showed requested/effective 44,100 Hz, matched hint, no fallback and exact crop. Native text download was **6,352 bytes / 99 lines**, with no bin rows. The graph remained visible under print media and the toolbar hid correctly.
- A test observer confirmed the actual AI request used **220,500 samples at 44.1 kHz → 240,000 at 48 kHz**, while DSP/report retained the full 15 seconds. Inference was suppressed for this workflow check; it does not measure candidate accuracy. No model requests, page/console/HTTP errors or failed requests occurred.
- Source-rate preservation does not establish identical byte-to-float PCM16 conversion across browsers. The trained v2 classifier remains outside the deployed app; [its results](AI_V2_RESULTS.md) retain traffic/unknown-rejection limitations.

## Prior expanded app release

- Public production URL: [tonalwatch.vercel.app](https://tonalwatch.vercel.app), unauthenticated HTTP200.
- Application source: main commit `e14bffa`; deployment `dpl_CfJbc9bjbwua57MzWRWoWyv1i4g1`, production **READY**. Later research/lab commits do not change these deployed app sources.
- Built from an exact Git archive while separate research work continued. Fresh `npm ci` reported zero vulnerabilities; **259 application tests across 12 files** and TypeScript/Vite production build passed. The five obsolete lab-retirement tests were excluded from that release check because the team restored the separate instrument; its replacement tests are recorded separately.
- The release includes explicit Home navigation, Learn tones/actual-PSD exhibit, the synthetic/manual map,5/15/30-second observations, full-duration reports, and previous-capture comparison. The experimental trained classifier remains outside the live app.
- Public HTTPS checks passed all 30 combinations of six pages and 320/375/760/1280/1920 px without horizontal overflow. A15-second WAV import retained720,000 samples,174 frames,5.859 Hz/bin in Learn, and the full15.000 s report/export. Buddy showed−20.4 dB for the contrasting fixtures. Fourteen synthetic map pins/cards remained accessible; manual placed/unplaced entries persisted across navigation and reset on reload.
- No page/console/HTTP errors, external map requests, or model downloads before Explore occurred in this release check. A street map still requires explicit opt-in. Existing AI inference was validated in the prior release below; the new release's bounded five-second AI-copy policy has its own tests.
- Research audio/model caches and experiment records are excluded from deployment uploads through `.vercelignore`. Standalone lab HTML remains a repository tool; Vite's single-entry app build does not publish it as a separate instrument page.

## Prior release evidence

- Public production URL: [tonalwatch.vercel.app](https://tonalwatch.vercel.app).
- Deployed application source: commit `aca4b19` on `main`. Later documentation-only commits do not change the deployed application.
- Immutable deployment: `dpl_Bnzna8LYCxCbvuNwtoYXHuWBjmmX`.
- Project: `tonalwatch`, team `antigro09s-projects`.
- Vercel CLI 64.5.0 reported **Ready**, production target, Node.js 24.x, Vite preset, `npm ci`, `npm run build`, output `dist`.
- An unauthenticated request to the public production URL returned HTTP **200** and the app HTML. Browser checks used that URL without its protected preview-domain cookie. No deployment-protection setting was changed.

The initial immutable/staging domain required Vercel authentication. The normal production deployment assigned `tonalwatch.vercel.app`, which is publicly accessible. Deployment protection can still apply to immutable or preview domains; use the production URL when sharing the app.

## Public HTTPS workflow

| Check | Observed result |
| --- | --- |
| Secure browser context | `window.isSecureContext` was true. App, analysis worker, capture worklet, and optional model worker loaded successfully. |
| Microphone meter and capture | A Chrome virtual microphone fed a generated 63 Hz WAV through native getUserMedia and AudioWorklet. The meter showed −24.5 dB relative to RMS 1 during capture, then “Microphone inactive.” Final captured-spectrum C−A was 25.3 dB. This verifies browser integration, not a physical microphone. |
| File import | Native decoding of a five-second, 48 kHz mono PCM WAV produced 25.3 dB, a 5.00-second duration, and imported-file provenance. A two-second file showed the explicit short-file error and disabled stale report review. |
| Explicit local AI exploration | No external request occurred before Explore. The pinned CLAP model loaded in approximately 14.9 seconds and inferred in 1.3 seconds. The 63 Hz test file ranked transformer hum 0.410 and light-fixture buzz 0.378; the result stayed uncertain. Timings and rankings are single-session integration observations, not field accuracy or speed guarantees. |
| AI network boundary | Observed model/runtime network requests were GET downloads with no request body. Model resolve paths used the pinned revision. Audio was not uploaded. |
| Report and export | The report included the captured spectrum SVG and entered context, excluded AI rankings, and downloaded `tonalwatch-observation-2026-10-18.txt`. The downloaded text contained algorithm version, spectrum provenance, bin spacing, 57 frames, and numerical bins, including the 64.453125 Hz peak bin. |
| Responsive layout | Home, Observation, Report, and Sources checked at 320, 390, 760, 1280, and 1920 CSS pixels: 20 route/width cases, no document-width overflow. |
| Method metadata | Sources & Method displayed `tw-screen-v1` and update date `2026-10-18`. |
| Browser diagnostics | No page errors, console errors, or warnings during the completed deployed workflow. |

The separate local print check rendered and visually inspected all five report PDF pages, including the captured spectrum and repeated synthetic demonstration labels. Physical printing and field microphone/classification accuracy remain outside these checks; see [VALIDATION.md](VALIDATION.md).

## Reproduction

```sh
npm ci
npm test
npm run build
npx --yes vercel@64.5.0 deploy --prod --scope antigro09s-projects --yes --non-interactive
```

The project is linked locally through ignored `.vercel/` metadata. The app itself needs no backend, API key, account, or runtime environment variables. Authenticated Vercel deployment is separate from public app use. Never commit local Vercel credentials or `.env.local`.

The deployment was created through the CLI. Automatic deployment from future GitHub pushes is not configured by this record.
