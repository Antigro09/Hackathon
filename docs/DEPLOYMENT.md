# TonalWatch deployment verification

Verified October 18, 2026, in Chrome 155 on Windows.

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
