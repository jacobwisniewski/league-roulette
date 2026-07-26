import { fileURLToPath } from "node:url";
import sharp from "sharp";

const width = 1200;
const height = 630;
const output = new URL("../public/og-league-roulette.png", import.meta.url);
const patch = "16.14.1";
const dragon = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion`;
const columns = [
  { role: "TOP", champions: ["Camille", "Aatrox", "Sett"] },
  { role: "JUNGLE", champions: ["Amumu", "Viego", "LeeSin"] },
  { role: "MID", champions: ["Ahri", "Orianna", "Syndra"] },
  { role: "BOT", champions: ["Ashe", "Jinx", "Caitlyn"] },
  { role: "SUPPORT", champions: ["Bard", "Thresh", "Lulu"] },
];

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function championImage(name, size, opacity = 1) {
  const response = await fetch(`${dragon}/${name}.png`);
  if (!response.ok) throw new Error(`Could not load ${name}`);
  return sharp(await response.arrayBuffer())
    .resize(size, size, { fit: "cover" })
    .modulate({ saturation: opacity === 1 ? 1 : 0.72, brightness: opacity === 1 ? 1 : 0.62 })
    .png()
    .toBuffer();
}

const background = Buffer.from(`
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#111a27"/>
        <stop offset="0.52" stop-color="#090f18"/>
        <stop offset="1" stop-color="#050910"/>
      </linearGradient>
      <radialGradient id="pool" cx="72%" cy="46%" r="55%">
        <stop offset="0" stop-color="#133348" stop-opacity=".52"/>
        <stop offset=".55" stop-color="#09141f" stop-opacity=".18"/>
        <stop offset="1" stop-color="#050910" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="gold" x1="0" x2="1">
        <stop offset="0" stop-color="#8c6c2d"/>
        <stop offset=".48" stop-color="#e6c25e"/>
        <stop offset="1" stop-color="#8c6c2d"/>
      </linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="16"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#pool)"/>
    <path d="M48 46h110" stroke="#d7b44f" stroke-width="3"/>
    <text x="48" y="86" fill="#d7b44f" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="2">LEAGUE</text>
    <text x="137" y="86" fill="#eee9dc" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="2">ROULETTE</text>
    <text x="48" y="258" fill="#eee9dc" font-family="Georgia, serif" font-size="64" font-weight="600">Roll a team.</text>
    <text x="52" y="308" fill="#aab2bf" font-family="Arial, sans-serif" font-size="20">Five lanes. Role-specific champions.</text>
    <text x="52" y="340" fill="#aab2bf" font-family="Arial, sans-serif" font-size="20">Complete builds, runes and matchups.</text>
    <g transform="translate(52 410)">
      <rect width="168" height="48" rx="2" fill="#147181" stroke="#d7b44f"/>
      <text x="84" y="30" text-anchor="middle" fill="#f3ecdc" font-family="Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="1">ROLL A TEAM</text>
    </g>
    <rect x="467" y="68" width="686" height="500" rx="8" fill="#070c13" stroke="#725b27"/>
    <rect x="483" y="86" width="654" height="54" rx="3" fill="#111d2b"/>
    <rect x="482" y="242" width="656" height="140" fill="#d7b44f" opacity=".16" filter="url(#shadow)"/>
    <rect x="481" y="240" width="658" height="144" rx="4" fill="none" stroke="url(#gold)" stroke-width="3"/>
    <path d="M481 298l-11 14 11 14M1139 298l11 14-11 14" fill="#d7b44f"/>
    <rect x="483" y="140" width="654" height="100" fill="#050910" opacity=".42"/>
    <rect x="483" y="384" width="654" height="164" fill="#050910" opacity=".48"/>
    <text x="48" y="568" fill="#5f6877" font-family="Arial, sans-serif" font-size="14" letter-spacing="1.2">ROULETTE.JACOBWISNIEWSKI.DEV</text>
  </svg>
`);

const composites = [];
const machineX = 491;
const columnWidth = 128;
const imageSize = 112;
const rowY = [144, 256, 400];

for (const [columnIndex, column] of columns.entries()) {
  const left = machineX + columnIndex * columnWidth;
  const roleSvg = Buffer.from(`
    <svg width="${imageSize}" height="54" xmlns="http://www.w3.org/2000/svg">
      <text x="${imageSize / 2}" y="32" text-anchor="middle" fill="#d7b44f" font-family="Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="1.4">${column.role}</text>
    </svg>
  `);
  composites.push({ input: roleSvg, left, top: 86 });
  for (const [rowIndex, champion] of column.champions.entries()) {
    composites.push({
      input: await championImage(champion, imageSize, rowIndex === 1 ? 1 : 0.55),
      left,
      top: rowY[rowIndex],
    });
    const label = Buffer.from(`
      <svg width="${imageSize}" height="26" xmlns="http://www.w3.org/2000/svg">
        <rect width="${imageSize}" height="26" fill="#05090f" opacity=".76"/>
        <text x="8" y="18" fill="#f1ede4" font-family="Arial, sans-serif" font-size="11" font-weight="700">${escapeXml(champion.replace("LeeSin", "Lee Sin"))}</text>
      </svg>
    `);
    composites.push({ input: label, left, top: rowY[rowIndex] + imageSize - 26 });
  }
}

await sharp(background)
  .composite(composites)
  .png({ compressionLevel: 9 })
  .toFile(fileURLToPath(output));
console.log("Generated social preview image.");
