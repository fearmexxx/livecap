# LiveCap: notes for working on this repo

VBE agency's live caption app. Speakers talk Korean (mostly) or English. LiveCap transcribes the speech,
translates it to Vietnamese and shows it on LED walls and in vMix/OBS. It runs up to 5 halls at once.
The repo is **public**: never commit API keys, passwords, speaker slides or event glossaries.

## Two ways it runs

| Mode | How | State | Access |
| --- | --- | --- | --- |
| Hosted (main path) | Vercel project `vbe/livecap`, deploys `main`, https://livecap-dun.vercel.app, region `sin1` | Upstash Redis (`KV_REST_API_URL/TOKEN`) | Hall logins (`LIVECAP_HALL_PASSWORDS` = `hall-1:pw,...`, `LIVECAP_ADMIN_PASSWORD`). Refuses all traffic on Vercel if no logins are set |
| Laptop backup | Portable zip per hall (GitHub Releases, built by `.github/workflows/portable.yml`). Unzip, double-click `START LiveCap`, type the hall number | Server memory | Localhost only. LAN mode only with `LIVECAP_PIN` |

The setup guides for people are `VERCEL_SETUP.md` (hosted) and `EVENT_SETUP.md` (laptops). `.env.example` lists every variable.

## Commands

```bash
npm ci
npm test            # node --experimental-strip-types --test src/lib/caption/__tests__/*.test.ts
npx tsc --noEmit    # typecheck
npm run build       # next build --webpack
npm run portable    # zips into dist/portable/ (win-x64, darwin-arm64, darwin-x64), Node bundled
npm run test:halls  # live Korean multi-hall test against the hosted site (needs passwords in env)
npm run bench       # sync load/bandwidth benchmark (docs/BENCHMARK.md); point LIVECAP_URL at a local build
```

- **Live test.** GitHub Actions → "Korean multi-hall test" → Run workflow (`.github/workflows/test-korean-halls.yml`). It uses the repo secrets `LIVECAP_HALL_PASSWORDS` and `LIVECAP_ADMIN_PASSWORD`. It runs a scripted Korean talk in every hall at once, then:
  - checks Gemini, 억/조 numbers and titles, plus two Vietnamese → English lines
  - checks each view-key feed
  - checks hall isolation and that signed-out access is refused
  - clears the test lines

  The script is `scripts/test-korean-halls.mjs`. A run costs a few cents.
- **Local hosted mode.** `LIVECAP_HALL_PASSWORDS=... LIVECAP_ADMIN_PASSWORD=... npx next start -p 3311`. Without a `VERCEL` variable it uses the memory store. It needs no OpenRouter key; translation falls back to free Google.

## Map

- `src/proxy.ts`: the Next 16 middleware ("proxy"). It is the login gate.
  - API calls without a login get 401 JSON; pages redirect to `/login`.
  - Output pages (`/caption/led|overlay|window`) and the GET sync feed also accept the hall's view key `&k=`.
  - A hall login is redirected to its own hall.
- `src/lib/caption/hostedAuth.ts`: HMAC cookie sessions (`livecap_auth`), hall and admin passwords, view keys. Uses Web Crypto only.
- `src/app/api/auth/{login,logout,me}`:
  - login locks out an address after 20 failures in 15 minutes
  - `me` returns the hall list (public) and the view key (when logged in)
- `src/lib/caption/roomBackend.ts`: the `RoomBackend` interface, with Memory and Redis (Upstash REST `/pipeline`) implementations. It holds:
  - rooms, history (100 lines) and devices (60 s TTL)
  - login failures
  - usage counters
- `src/app/api/caption/sync`: GET is the poll feed. `since` gives `unchanged`. `h=` (history tag) and `cv=` (config version) mean only new lines (`historyAdd`) and changed settings are sent; see `feed.ts`. Older screens send `historyCount`. POST handles caption, config, clear and heartbeat, and checks the hall (403 for other halls).
- Language pairs: Korean or English speech → Vietnamese subtitles; Vietnamese speech (`vi-VN`, console button "Tiếng Việt → EN") → English subtitles. `targetLangFor`, `glossaryForTarget` (the glossary is used reversed for English) and `langInfo` are in `textProcessing.ts`. The server picks English for Vietnamese speech, whatever `targetLang` says.
- `src/app/api/caption/translate`:
  - engine `auto` picks OpenRouter (Gemini 2.5 Flash, `reasoning.enabled:false`), then DeepL, then OpenAI, then free Google
  - never returns 5xx: on failure it falls back to free Google with a `warning`
- `src/app/api/caption/transcribe`: speech-to-text through OpenRouter (`openai/gpt-transcribe`) or the local GPU Whisper server (`local_gpu_whisper_server.py`).
- `src/lib/caption/speechEngine.ts`: browser side. It runs Web Speech or VAD-cut audio segments, the sentence assembler, an ordered translation queue, and sends `previousTranslations`.
- `src/lib/caption/textProcessing.ts`:
  - Korean sentence ends and connectives (waits 2.6 s mid-clause)
  - clause splitting
  - the interpreter prompt (Korean rules: 만/억/조, titles, 여러분 → quý vị)
  - glossary handling
- `src/lib/caption/usage.ts` + `usageServer.ts`: per-hall usage counters for each day (Vietnam time), recorded with `after()`. The console sends its hall in the `x-livecap-session` header (see `clientAuth.ts`). Free Google previews are not counted.
- `src/app/admin` + `src/app/api/admin/status`: the monitoring page (admin login only). It shows each hall's live/ready/warning/offline state, devices, latest line, tokens, cost, speed and errors, plus OpenRouter key credit and storage health.
- `src/app/caption/page.tsx`: the operator console, with presets for halls 1–5, the event settings file (Export → Lưu/Nạp file cài đặt) and logout.

## Conventions and gotchas

- Tests run TypeScript straight through `--experimental-strip-types`:
  - no parameter properties (`constructor(private x)`), enums or namespaces
  - modules imported by tests use `.ts` extensions in their relative imports
- `tsconfig` target is ES2020. The `/s` regex flag broke Vercel builds on an older target.
- API keys are stripped from anything synced (`stripSecrets`). View-key readers get no glossary or `eventContext`.
- Each poll is a billed request and Redis commands. Keep the feed incremental, and measure with `npm run bench` before and after changing sync.
- Write Redis room fields separately (HSET per field, RPUSH history) so that captions arriving at the same moment from different server copies don't overwrite each other.
- `next build` output is under `.next/`. Kill a local server by PID (`ps -eo pid,comm`, process `next-server`). `pkill -f` can kill your own shell.
- `livecap.env` in the portable folder overrides environment variables, including `PORT`. The launcher moves to the next free port if 3000 is busy.
- UI text is bilingual Vietnamese/English, and the crew reads Vietnamese first.

## Open items (2026-11-15)

- Vercel team is on Hobby; Pro is needed before a paid event. The `livecap.vbe.vn` domain is optional.
- No glossaries from speaker slides yet; the user will supply slides. Keep them out of git and load them through the event settings file.
- Korean quality has not been measured on a real talk recording.
- The Windows zip and vMix have not been rehearsed on real event hardware.
