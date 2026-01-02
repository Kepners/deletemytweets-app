const sharp = require('sharp');
const path = require('path');

const sourcePath = path.join(__dirname, 'dist', '#TwitterDeleter-Icons', 'grok-image-remove the _exe_ text and the logo from the image.-81238248-230e-4b15-84e8-e3e14e70fd87-3-image-edit-1_0.png');
const outputPath = path.join(__dirname, 'icon-recolored.png');

async function recolorIcon() {
  try {
    // Hue rotate: blue (210°) → magenta (300°) = +90° shift
    // Also increase saturation for more punch
    await sharp(sourcePath)
      .resize(256, 256)
      .modulate({
        hue: 90,  // Shift hue by 90 degrees (blue → magenta)
        saturation: 1.3,  // Boost saturation 30%
        brightness: 1.0
      })
      .png()
      .toFile(outputPath);

    console.log('Created recolored icon at:', outputPath);

    // Also create ICO version
    const pngToIco = require('png-to-ico');
    const fs = require('fs');

    const pngBuffer = fs.readFileSync(outputPath);
    const icoBuffer = await pngToIco(pngBuffer);
    fs.writeFileSync(path.join(__dirname, 'icon-recolored.ico'), icoBuffer);

    console.log('Created ICO version');

  } catch (err) {
    console.error('Error:', err);
  }
}

recolorIcon();
