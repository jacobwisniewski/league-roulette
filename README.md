# Braveforge

An off-meta League of Legends roulette that produces unusual but coherent
champion, role, rune, summoner spell, and item challenges.

## How it works

Braveforge loads the newest champion and item catalogue from Riot Data Dragon.
Each challenge starts from a manually reviewed champion-kit interaction, then
the item engine scores current Summoner's Rift items against that alternate
damage profile. Builds are seeded, shareable, and validated against the live
patch catalogue.

## Local development

```bash
npm install
npm run dev
```

Build with `npm run build`. Deploy to Cloudflare Pages with `npm run deploy`.

Braveforge is not endorsed by Riot Games. League of Legends and Riot Games are
trademarks of Riot Games, Inc.
