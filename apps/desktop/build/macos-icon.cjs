'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const root = path.resolve(__dirname, '../../..');
  const output = path.join(root, 'apps/desktop/build/compiled-icon');
  await fs.mkdir(output, { recursive: true });
  // Fail the build rather than silently drop system Dark/Mono icon appearances.
  execFileSync('xcrun', ['actool', path.join(root, 'apps/desktop/build/AppIcon.icon'), '--compile', output, '--output-format', 'human-readable-text', '--output-partial-info-plist', path.join(output, 'icon.plist'), '--app-icon', 'AppIcon', '--include-all-app-icons', '--enable-on-demand-resources', 'NO', '--development-region', 'pt', '--target-device', 'mac', '--minimum-deployment-target', '13.0', '--platform', 'macosx'], { stdio: 'inherit' });
  await fs.copyFile(path.join(output, 'Assets.car'), path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app/Contents/Resources/Assets.car`));
};
