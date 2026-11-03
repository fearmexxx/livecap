# Hosted LiveCap on Vercel (one site for every hall)

Each hall's laptop opens one web address in Chrome, logs in with its hall password, and is ready.
Nothing is installed on the laptop, and the API key stays on the server.

| Piece | What it does |
| --- | --- |
| Hall login | One password per hall (`hall-1` … `hall-5`). A hall login can only run its own hall. The admin password opens every hall. |
| Private output links | **Copy vMix URL** and **LED Stage** add a hall key (`&k=…`) to the link. vMix, OBS or a second computer opens it without logging in. The key can only read captions. |
| Upstash Redis | Shares captions between the console and the vMix / OBS / LED computers. |
| `OPENROUTER_API_KEY` | Gemini 2.5 Flash translation for every hall, kept on the server. |

Plan: commercial use needs Vercel **Pro**. Upstash Redis pay-as-you-go costs about $1 per event day for 5 halls.

## One-time setup (about 15 minutes)

1. **Import the repo.** In Vercel: **Add New… → Project** → import `fearmexxx/livecap`. Keep the defaults
   (Next.js) and deploy. Production deploys come from `main`.
2. **Add Redis.** Project → **Storage** → **Create** → **Upstash Redis** (Marketplace) → connect it to the project.
   This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. **Add environment variables.** Project → **Settings → Environment Variables** (Production):

   | Name | Value |
   | --- | --- |
   | `OPENROUTER_API_KEY` | your OpenRouter key |
   | `LIVECAP_HALL_PASSWORDS` | `hall-1:xxxx,hall-2:xxxx,hall-3:xxxx,hall-4:xxxx,hall-5:xxxx` |
   | `LIVECAP_ADMIN_PASSWORD` | a long password for you |
   | `LIVECAP_AUTH_SECRET` | any long random text (lets you change a password without signing every hall out) |
   | `NEXT_PUBLIC_LIVECAP_HOSTED` | `1` |

4. **Add the subdomain.** Project → **Settings → Domains** → add e.g. `livecap.vbe.vn`, then create the CNAME
   record Vercel shows at your DNS provider.
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the variables take effect.
6. Keep **Deployment Protection → Vercel Authentication** for preview deployments only; the production domain
   must stay public, otherwise vMix and OBS cannot open the output links. The hall login protects it.

## At the event, per hall

1. Open `https://livecap.vbe.vn` in Chrome, choose the hall, enter its password. Allow the microphone.
2. Pick the audio input, speaker language, and press **START CAPTION**.
3. Screens:
   - Same laptop: **LED Stage** opens the LED window. Drag it to the LED output and press F11.
   - vMix / OBS / another computer: click **Copy vMix URL** and paste it into vMix (Web Browser input,
     1920×1080) or OBS (Browser source). Send that link only to the people running that screen.
4. Load the event settings file (Export → Nạp file cài đặt) for speakers, glossary and event context.

The login lasts 14 days per laptop. **Đăng xuất** (top bar) logs out.

## If the internet drops

Speech recognition and translation always needed internet, so the hosted site adds no new dependency.
Keep a 5G router that switches over automatically. If the site itself cannot be reached, run the
portable laptop download (see EVENT_SETUP.md) as the backup.
