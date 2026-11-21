# Sync load and bandwidth benchmark

`scripts/bench-sync.mjs` (`npm run bench`) simulates halls in the middle of an event. Each hall has a full
100-line history and an event settings file with a 60-term glossary. In each hall:

- one console talks at a steady pace: a preview about every 0.5 s and a finished line about every 6 s
- three screens (LED, vMix, window) poll the hall's view-key feed every 800 ms, as the hosted site does

It counts requests, data each way (raw and gzip), poll latency, and whether each finished line reached
each screen. The settings are listed at the top of the script.

## Results, 2026-11-20

The test ran on a local production build (`next start`) against a counting copy of the Redis REST API,
with old (`main` at aeb6e18) and new code run the same way.

Each figure is per hall per minute while someone is speaking.

| | Before | After |
| --- | --- | --- |
| Requests to the site | 413 | 417 |
| Data sent to screens and consoles (raw) | 1,239 KB | 558 KB (−55%) |
| Data sent to screens and consoles (gzip) | 408 KB | 280 KB |
| Redis commands | 3,183 | 2,165 (−32%) |
| Data read from Redis | 23.4 MB | 0.94 MB (−96%) |
| Finished lines reaching every screen, 5 halls | 98% | 100% |
| Finished lines reaching every screen, 20 halls | 84% | 100% |

The share of finished lines that reached screens is a fix as well as a saving. A full hall keeps 100
lines, so the old feed's line count stopped changing and the history was no longer sent. A screen then
saw a finished line only if it happened to poll during the moment that line was on screen. Under load,
about 1 line in 6 never reached a screen.

## What changed

- **History.** It is sent once. After that, a screen sends the tag of its last line (`h=`) and gets only
  the new lines (`historyAdd`).
- **Settings.** The event settings are sent only when their version (`cv=`) changed.
- **Redis reads.** The feed reads a few small fields first. It reads history lines and settings only
  when the screen lacks them.
- **Previews.** A preview is one small Redis write (4 commands). It no longer re-reads the whole room
  or re-registers the device.
- **Older screens.** Screens still on the old page send `historyCount` and keep working as before.

## What 100+ events cost (estimate)

Take 100 events a month, 5 halls each, 8 hours of talks: 4,000 hall-hours.

- **Requests.** About 100 million a month. At Vercel's $0.60 per million that is about $60, plus CPU time.
  Check CPU time in Vercel's usage page after a real event; this test can't measure it.
- **Redis commands.** About 520 million a month.
  - Upstash pay-as-you-go ($0.20 per 100K) would charge about $1,040.
  - A fixed Upstash plan has unlimited commands. After this change about 0.4 TB of Redis traffic a month
    fits the Fixed 5GB plan ($100/month, 500 GB). Before the change, the 5.6 TB of reads needed more than
    the $400 plan.
- **Peak load.** One hall uses about 36 Redis commands a second. A fixed plan's 10,000 per second covers
  about 270 halls talking at the same time.
- **Data to screens.** About 70 GB a month gzipped. Each hall-hour sends about 17 MB to its screens and
  consoles.

Translation is not part of this test. The `/admin` page shows its cost per hall.
