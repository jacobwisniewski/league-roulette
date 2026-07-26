import { mkdir, writeFile } from "node:fs/promises";

const source = "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json";
const output = new URL("../public/data/championrates.json", import.meta.url);

const response = await fetch(source);
if (!response.ok) {
  throw new Error(`Champion-rate sync failed with ${response.status}`);
}

const data = await response.text();
await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(output, data);
console.log("Synced automated champion role rates.");
