const sharp = require('sharp');
const path = require('path');

const sourcePath = path.join(__dirname, 'dist', '#TwitterDeleter-Icons', 'grok-image-give the Bin central image a emboss effect-change the _x_ to a bin please.-remove the _exe_ text and the logo from the image.png');
const outputPng = path.join(__dirname, 'icon-bin-magenta.png');
const outputIco = path.join(__dirname, 'icon.ico');

async function recolorIcon() {
  try {
    console.log('Reading source PNG...');

    // Resize to 256x256 and hue shift blue → magenta
    await sharp(sourcePath)
      .resize(256, 256)
      .modulate({
        hue: 90,  // Blue (210°) → Magenta (300°)
        saturation: 1.3,
        brightness: 1.0
      })
      .png()
      .toFile(outputPng);

    console.log('Created recolored PNG:', outputPng);

    // Convert to ICO
    const { execSync } = require('child_process');
    execSync(`npx png-to-ico "${outputPng}" > "${outputIco}"`, { shell: true });

    console.log('Created icon.ico');
    console.log('Done!');

  } catch (err) {
    console.error('Error:', err);
  }
}

recolorIcon();
