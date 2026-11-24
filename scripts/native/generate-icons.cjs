'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../apps/desktop/node_modules/sharp');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
async function main() {
  const svg = await fs.readFile(path.join(root, 'frontend/public/barberos-icon.svg'));
  const out = path.join(root, 'apps/desktop/build');
  await fs.mkdir(out, { recursive: true });
  await sharp(svg).resize(1024).png().toFile(path.join(out, 'icon.png'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map(size => sharp(svg).resize(size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => { const index = 6 + i * 16; header[index] = size === 256 ? 0 : size; header[index + 1] = header[index]; header.writeUInt16LE(1, index + 4); header.writeUInt16LE(32, index + 6); header.writeUInt32LE(pngs[i].length, index + 8); header.writeUInt32LE(offset, index + 12); offset += pngs[i].length; });
  await fs.writeFile(path.join(out, 'icon.ico'), Buffer.concat([header, ...pngs]));
  const iconset = path.join(out, 'icon.iconset'); await fs.mkdir(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) await sharp(svg).resize(size * scale).png().toFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
  if (process.platform === 'darwin') execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(out, 'icon.icns')]);
  const composer = path.join(out, 'AppIcon.icon'); await fs.mkdir(path.join(composer, 'Assets'), { recursive: true });
  await fs.writeFile(path.join(composer, 'Assets/mark.svg'), svg.toString().replace(/<rect[^>]+\/>/, ''));
  await fs.writeFile(path.join(composer, 'icon.json'), JSON.stringify({
    'color-space-for-untagged-svg-colors': 'display-p3',
    'fill-specializations': [{ value: { solid: 'gray:0.03529,1.00000' } }, { appearance: 'dark', value: 'system-dark' }, { appearance: 'tinted', value: 'system-dark' }],
    groups: [{ layers: [{ 'image-name': 'mark.svg', name: 'BarberOS', glass: false, 'fill-specializations': [{ appearance: 'dark', value: { solid: 'gray:1.00000,1.00000' } }, { appearance: 'tinted', value: { solid: 'gray:1.00000,1.00000' } }] }], shadow: { kind: 'none', opacity: 0 }, translucency: { enabled: false, value: 0 } }],
    'supported-platforms': { squares: ['macOS'] }
  }, null, 2) + '\n');
  const res = path.join(root, 'apps/android/app/src/main/res');
  for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    const dir = path.join(res, `mipmap-${density}`); await fs.mkdir(dir, { recursive: true });
    await sharp(svg).resize(size).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(Buffer.from(svg.toString().replace(/<rect[^>]+\/>/, '<circle cx="256" cy="256" r="256" fill="#090909"/>'))).resize(size).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  }
  const web = path.join(root, 'frontend/public/native-icons'); await fs.mkdir(web, { recursive: true });
  for (const size of [192, 512]) await sharp(svg).resize(size).png().toFile(path.join(web, `icon-${size}.png`));
  console.log('Official source icon converted for desktop, Android and web manifest.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
