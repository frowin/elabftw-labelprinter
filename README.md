# eLabFTW Label Printer (Niimbot) – Chrome Extension

## Build

```bash
cd niimbot-chrome-extension
npm install
npm run build
```

Note: `npm run build` auto-increments the patch `version` in `niimbot-chrome-extension/manifest.json`.

## Import into Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `niimbot-chrome-extension/` folder (the one containing `manifest.json`)
4. After rebuilding, click **Reload** on the extension

## Dev (watch)

```bash
cd niimbot-chrome-extension
npm run watch
```


## Author
[Frowin Ellermann](https://frowinellermann.com)

## Acknowledgements
- [eLabFTW](https://www.elabftw.net) – open-source electronic lab notebook this extension integrates with
- [@mmote/niimbluelib](https://github.com/MultiMote/niimbluelib) – Niimbot BLE communication library
