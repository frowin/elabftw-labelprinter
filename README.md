# eLabFTW Label Printer (Niimbot) – Chrome Extension

Chrome plugin which allows to print labels with a QR code directly out of eLabFTW.
Currently there are three presets for 14 x 50 mm labels.

## Prerequirements

1. [Chrome browser](https://www.google.com/chrome/)
2. [node.js](https://nodejs.org/en/download)

## Build

```bash
cd elabftw-labelprinter
npm install
npm run build
```

Note: `npm run build` auto-increments the patch `version` in `elabftw-labelprinter/manifest.json`.

## Import into Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `elabftw-labelprinter/` folder (the one containing `manifest.json`)
4. After rebuilding, click **Reload** on the extension

## Dev (watch)

```bash
cd elabftw-labelprinter
npm run watch
```


## Authoren
[Frowin Ellermann](https://frowinellermann.com)
[Florian Kleiner](https://floriankleiner.de)

## Acknowledgements
- [eLabFTW](https://www.elabftw.net) – open-source electronic lab notebook this extension integrates with
- [@mmote/niimbluelib](https://github.com/MultiMote/niimbluelib) – Niimbot BLE communication library
