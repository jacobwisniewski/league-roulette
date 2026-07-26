# League Roulette

Generate a complete five-lane League of Legends team and loadout set from the
current Riot Data Dragon dataset.

## Generation

League Roulette contains no saved champion builds. For each seed it:

1. Loads the current champion, item, rune, and summoner catalogues.
2. Loads automated champion play rates by position and excludes each champion's
   primary role.
3. Reads each selected champion's passive and spell data.
4. Detects attack, AP, AD, sustain, and defensive signals.
5. Scores current Summoner's Rift items against the strongest alternate profile.
6. Constructs a valid primary and secondary rune page.

Every result is deterministic and can be shared by URL or copied as a PNG for
Discord.

## Stack

- React 19 and strict TypeScript
- Vite
- CSS Modules
- Riot Data Dragon
- Cloudflare Workers static assets
- Oxfmt and Oxlint

## Commands

```bash
npm install
npm run dev
npm run check
npm run deploy
```

League Roulette is not endorsed by Riot Games. League of Legends and Riot Games
are trademarks of Riot Games, Inc. Position-rate data is provided by
[Meraki Analytics](https://github.com/meraki-analytics/lolstaticdata).
