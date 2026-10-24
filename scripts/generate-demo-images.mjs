import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const spaces = JSON.parse(await readFile(path.join(root, 'data', 'demo-spaces.json'), 'utf8'))
const outputDirectory = path.join(root, 'public', 'images')
const palettes = [
  ['#d9e8dc', '#6c9180', '#355d4a'],
  ['#f1ddc8', '#bf805e', '#72483b'],
  ['#dce8e7', '#69968f', '#355e5a'],
  ['#dce3ef', '#7289ad', '#3d4f71'],
  ['#f0e4cc', '#c39251', '#735b35'],
  ['#e4dced', '#9a7eaa', '#554363'],
  ['#e5ead5', '#829b62', '#465b37'],
  ['#e7d8d0', '#b77f69', '#724a3e'],
  ['#d9e9ed', '#6c9aa6', '#365b63'],
  ['#eee0d0', '#b88959', '#6f5035'],
]

function illustration(title, district, colors) {
  const [background, accent, dark] = colors
  const safeTitle = title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const safeDistrict = district.replaceAll('&', '&amp;')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="#faf7f0"/></linearGradient></defs>
    <rect width="1400" height="900" fill="url(#bg)"/>
    <circle cx="1120" cy="175" r="125" fill="#fff" opacity=".48"/>
    <path d="M0 650 Q270 540 510 665 T1000 640 T1400 620 V900 H0Z" fill="${accent}" opacity=".35"/>
    <rect x="210" y="250" width="980" height="420" rx="30" fill="#fff" opacity=".66"/>
    <rect x="275" y="310" width="850" height="265" rx="18" fill="${background}"/>
    <path d="M275 575h850v55H275z" fill="${dark}" opacity=".8"/>
    <rect x="345" y="370" width="260" height="150" rx="12" fill="#fff" opacity=".72"/>
    <rect x="650" y="370" width="400" height="24" rx="12" fill="${dark}" opacity=".62"/>
    <rect x="650" y="415" width="320" height="18" rx="9" fill="${dark}" opacity=".38"/>
    <rect x="650" y="453" width="350" height="18" rx="9" fill="${dark}" opacity=".28"/>
    <path d="M395 640v-54h22v54m140 0v-54h22v54" stroke="${dark}" stroke-width="15" stroke-linecap="round"/>
    <path d="M330 575h300" stroke="${dark}" stroke-width="20" stroke-linecap="round" opacity=".75"/>
    <text x="700" y="750" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="48" fill="${dark}">${safeTitle}</text>
    <text x="700" y="805" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" letter-spacing="5" fill="${dark}" opacity=".8">${safeDistrict.toUpperCase()}  ·  ILLUSTRATIVE DEMO</text>
  </svg>`
}

await mkdir(outputDirectory, { recursive: true })
for (const [index, space] of spaces.entries()) {
  const svg = illustration(space.category, space.district, palettes[index % palettes.length])
  await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(outputDirectory, `${space.slug}.jpg`))
}
console.log(`Generated ${spaces.length} illustrative demo images in public/images/.`)
