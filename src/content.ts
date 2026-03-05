/**
 * Content script: injects the label printer UI directly into the eLabFTW page.
 * Bluetooth calls happen in the page context where they work reliably.
 */
import { NiimbotBluetoothClient, ImageEncoder } from '@mmote/niimbluelib';
import { labelConfigs, getLabelConfig, getLabelCanvasSize } from './label-configs';
import { layoutConfigs, getLayoutConfig, EntityData, LayoutArea } from './layout-configs';

// ── Page detection ──
function getEntity() {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get('id') ?? '', 10);
  if (!id) return null;
  const path = window.location.pathname;
  let type: string | null = null;
  if (path.includes('database.php')) type = 'items';
  else if (path.includes('experiments.php')) type = 'experiments';
  if (!type) return null;
  return { type, id, baseUrl: window.location.origin };
}

const entity = getEntity();
if (!entity) {
  chrome.runtime.onMessage.addListener((msg, _s, send) => { if (msg.action === 'toggle-panel') send({ ok: false }); return false; });
} else {

// ── Printer connection state (persists across panel open/close) ──
let client: NiimbotBluetoothClient | null = null;
let panel: HTMLElement | null = null;
let connecting = false;

// ── API ──
async function fetchEntityData(): Promise<EntityData> {
  const r = await fetch(`${entity.baseUrl}/api/v2/${entity.type}/${entity.id}`, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
  return r.json();
}

async function fetchQrImage(size: number): Promise<HTMLImageElement | null> {
  try {
    const r = await fetch(`${entity.baseUrl}/api/v2/${entity.type}/${entity.id}?format=qrpng&size=${size}&withTitle=0`, { credentials: 'same-origin' });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  } catch { return null; }
}

// ── Render ──
function makeLabelCanvas(data: EntityData, labelId: string, layoutId: string, qrImg: HTMLImageElement | null): HTMLCanvasElement {
  const label = getLabelConfig(labelId);
  const layout = getLayoutConfig(layoutId);
  const { width, height } = getLabelCanvasSize(label);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  layout.render(ctx, data, qrImg, { width, height, margin: label.margin } as LayoutArea);
  return c;
}

// ── UI helpers ──
function setStatus(msg: string, type: 'info' | 'error' | 'success' = 'info') {
  const el = document.getElementById('nlpStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'nlp-status' + (type !== 'info' ? ` ${type}` : '');
}

function syncConnUI() {
  const connected = client?.isConnected() ?? false;
  const dot = document.getElementById('nlpDot');
  const lbl = document.getElementById('nlpConnLabel');
  const printBtn = document.getElementById('nlpPrintBtn') as HTMLButtonElement | null;
  const discoBtn = document.getElementById('nlpDiscoBtn');
  const connBtn = document.getElementById('nlpConnBtn') as HTMLButtonElement | null;
  if (dot) dot.classList.toggle('on', connected);
  if (lbl) lbl.textContent = connected ? 'Connected' : connecting ? 'Connecting\u2026' : 'Disconnected';
  if (printBtn) printBtn.disabled = !connected;
  if (discoBtn) discoBtn.style.display = connected ? '' : 'none';
  if (connBtn) {
    connBtn.textContent = connected ? '\u26a1 Reconnect' : connecting ? 'Connecting\u2026' : '\u26a1 Connect';
    connBtn.disabled = connecting;
  }
}

// ── Connection logic with retry ──
async function connectPrinter(retries = 2): Promise<boolean> {
  if (client?.isConnected()) return true;
  if (connecting) return false;
  connecting = true;
  syncConnUI();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Reuse existing client if GATT is still available, otherwise create new
      if (!client) {
        client = new NiimbotBluetoothClient();
      }

      if (attempt === 0) {
        setStatus('Select your Niimbot printer from the Bluetooth picker\u2026');
      } else {
        setStatus(`Retrying connection (${attempt}/${retries})\u2026`);
      }

      // Library auto-starts heartbeat on connect — stop it first so it doesn't interfere
      // with the initial negotiation that happens inside connect()
      client.setHeartbeatInterval(5000);

      const info = await client.connect();
      // connect() already calls initialNegotiate + fetchPrinterInfo internally,
      // so we don't need to call fetchPrinterInfo again

      // Stop the auto-started heartbeat, then restart with a relaxed interval
      // to avoid "Timeout waiting response" errors on B18
      client.stopHeartbeat();
      await sleep(500);
      client.setHeartbeatInterval(5000);
      try { client.startHeartbeat(); } catch { /* ignore initial heartbeat error */ }

      client.on('disconnect', () => {
        setStatus('Printer disconnected', 'error');
        syncConnUI();
      });
      client.on('heartbeatfailed', (e) => {
        if (e.failedAttempts >= 5) {
          setStatus('Lost connection to printer', 'error');
          client?.stopHeartbeat();
          client?.disconnect().catch(() => {});
          client = null;
          syncConnUI();
        }
      });

      const name = info.deviceName ?? 'Niimbot printer';
      setStatus(`Connected to ${name}`, 'success');
      connecting = false;
      syncConnUI();
      return true;
    } catch (e) {
      const msg = String(e);
      if (msg.includes('cancelled') || msg.includes('User cancelled')) {
        // User closed the picker — don't retry
        setStatus('Picker closed. Turn on printer and try again.', 'error');
        client = null;
        break;
      }
      if (attempt < retries) {
        client = null;
        await sleep(800);
      } else {
        setStatus(`Connection failed: ${msg}`, 'error');
        client = null;
      }
    }
  }
  connecting = false;
  syncConnUI();
  return false;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function disconnectPrinter() {
  if (client) {
    client.stopHeartbeat();
    await client.disconnect().catch(() => {});
    client = null;
  }
  setStatus('Disconnected');
  syncConnUI();
}

// ── Preview ──
async function doPreview() {
  setStatus('Rendering preview\u2026');
  try {
    const data = await fetchEntityData();
    const labelSel = (document.getElementById('nlpLabelSel') as HTMLSelectElement).value;
    const layoutSel = (document.getElementById('nlpLayoutSel') as HTMLSelectElement).value;
    const label = getLabelConfig(labelSel);
    const qrImg = await fetchQrImage(label.printheadPx - label.margin * 2);
    const canvas = makeLabelCanvas(data, labelSel, layoutSel, qrImg);
    const target = document.getElementById('nlpCanvas') as HTMLCanvasElement;
    const scale = Math.max(2, Math.floor(400 / canvas.width));
    target.width = canvas.width * scale;
    target.height = canvas.height * scale;
    const ctx = target.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, target.width, target.height);
    setStatus(`${label.widthMm}\u00d7${label.heightMm} mm \u2014 ${getLayoutConfig(layoutSel).name}`, 'info');
  } catch (e) {
    setStatus(`Preview failed: ${e}`, 'error');
  }
}

// ── Print with auto-connect ──
async function doPrint() {
  const btn = document.getElementById('nlpPrintBtn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Printing\u2026';

  try {
    // Auto-connect if not connected
    if (!client?.isConnected()) {
      const ok = await connectPrinter();
      if (!ok) return;
    }

    setStatus('Preparing label\u2026');
    const data = await fetchEntityData();
    const labelSel = (document.getElementById('nlpLabelSel') as HTMLSelectElement).value;
    const layoutSel = (document.getElementById('nlpLayoutSel') as HTMLSelectElement).value;
    const label = getLabelConfig(labelSel);
    const qrImg = await fetchQrImage(label.printheadPx - label.margin * 2);
    const canvas = makeLabelCanvas(data, labelSel, layoutSel, qrImg);
    const encoded = ImageEncoder.encodeCanvas(canvas, label.printDirection);

    setStatus('Sending to printer\u2026');
    const taskName = client!.getPrintTaskType() ?? 'B21_V1';
    const printTask = client!.abstraction.newPrintTask(taskName, { totalPages: 1 });

    // Listen for progress
    client!.on('printprogress', (e) => {
      setStatus(`Printing\u2026 ${e.pagePrintProgress}%`);
    });

    try {
      await printTask.printInit();
      await printTask.printPage(encoded, 1);
      await printTask.waitForFinished();
      setStatus('Printed successfully!', 'success');
    } finally {
      await client!.abstraction.printEnd().catch(() => {});
      client!.removeAllListeners('printprogress');
    }
  } catch (e) {
    setStatus(`Print failed: ${e}`, 'error');
  } finally {
    btn.disabled = !(client?.isConnected());
    btn.textContent = '\u2399 Print';
  }
}

// ── Panel creation ──
function createPanel(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'niimbot-label-panel';
  el.innerHTML = `
    <style>
      #niimbot-label-panel {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        z-index: 999999; width: 440px;
        background: #fff; border-radius: 10px;
        box-shadow: 0 20px 60px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.08);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px; color: #1a1a1a;
      }
      #niimbot-label-panel * { box-sizing: border-box; }
      .nlp-header {
        display: flex; align-items: center; padding: 14px 18px;
        border-bottom: 1px solid #eee; cursor: move; user-select: none;
      }
      .nlp-header h2 { font-size: 15px; font-weight: 600; margin: 0; flex: 1; }
      .nlp-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #999; padding: 0 4px; line-height: 1; }
      .nlp-close:hover { color: #333; }
      .nlp-conn { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #6c757d; margin-right: 12px; }
      .nlp-dot { width: 8px; height: 8px; border-radius: 50%; background: #dc3545; transition: background .2s; }
      .nlp-dot.on { background: #198754; }
      .nlp-body { padding: 16px 18px; }
      .nlp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
      .nlp-body label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; color: #6c757d; margin-bottom: 3px; }
      .nlp-body select { width: 100%; padding: 5px 8px; border: 1px solid #dee2e6; border-radius: 6px; font-size: 12px; }
      .nlp-preview { display: flex; justify-content: center; align-items: center; min-height: 50px; padding: 12px; background: #f8f9fa; border: 1px dashed #dee2e6; border-radius: 6px; margin-bottom: 8px; }
      .nlp-preview canvas { max-width: 100%; image-rendering: pixelated; }
      .nlp-status { font-size: 11px; color: #6c757d; min-height: 16px; margin-bottom: 12px; }
      .nlp-status.error { color: #dc3545; }
      .nlp-status.success { color: #198754; }
      .nlp-actions { display: flex; gap: 8px; align-items: center; }
      .nlp-actions .spacer { flex: 1; }
      .nlp-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid #dee2e6; background: #fff; color: #1a1a1a; font-size: 12px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all .15s; }
      .nlp-btn:hover { background: #f8f9fa; }
      .nlp-btn:disabled { opacity: .45; cursor: default; }
      .nlp-btn.primary { background: #0d6efd; color: #fff; border-color: #0d6efd; }
      .nlp-btn.primary:hover:not(:disabled) { background: #0b5ed7; }
      .nlp-btn.success { background: #198754; color: #fff; border-color: #198754; }
      .nlp-btn.success:hover:not(:disabled) { background: #157347; }
      .nlp-btn.danger { color: #dc3545; border-color: #dc3545; }
      .nlp-btn.danger:hover { background: #fff5f5; }
      #niimbot-overlay { position: fixed; inset: 0; z-index: 999998; background: rgba(0,0,0,.3); }
    </style>
    <div class="nlp-header" id="nlpHeader">
      <h2>\u{1F3F7}\uFE0F Label Printer</h2>
      <div class="nlp-conn"><div class="nlp-dot" id="nlpDot"></div><span id="nlpConnLabel">Disconnected</span></div>
      <button class="nlp-close" id="nlpClose">&times;</button>
    </div>
    <div class="nlp-body">
      <div class="nlp-row">
        <div><label for="nlpLabelSel">Label size</label><select id="nlpLabelSel"></select></div>
        <div><label for="nlpLayoutSel">Layout</label><select id="nlpLayoutSel"></select></div>
      </div>
      <div class="nlp-preview"><canvas id="nlpCanvas"></canvas></div>
      <p class="nlp-status" id="nlpStatus"></p>
      <div class="nlp-actions">
        <button class="nlp-btn" id="nlpPreviewBtn">\u21BB Preview</button>
        <span class="spacer"></span>
        <button class="nlp-btn danger" id="nlpDiscoBtn" style="display:none;">Disconnect</button>
        <button class="nlp-btn primary" id="nlpConnBtn">\u26A1 Connect</button>
        <button class="nlp-btn success" id="nlpPrintBtn" disabled>\u2399 Print</button>
      </div>
    </div>
  `;
  return el;
}

function showPanel() {
  if (panel) {
    panel.style.display = '';
    document.getElementById('niimbot-overlay')!.style.display = '';
    syncConnUI();
    doPreview();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'niimbot-overlay';
  document.body.appendChild(overlay);

  panel = createPanel();
  document.body.appendChild(panel);

  // Populate selects
  const labelSel = document.getElementById('nlpLabelSel') as HTMLSelectElement;
  const layoutSel = document.getElementById('nlpLayoutSel') as HTMLSelectElement;
  labelConfigs.forEach(c => labelSel.add(new Option(c.name, c.id)));
  layoutConfigs.forEach(c => layoutSel.add(new Option(`${c.name} \u2014 ${c.description}`, c.id)));

  const savedLabel = localStorage.getItem('niimbot_label');
  const savedLayout = localStorage.getItem('niimbot_layout');
  if (savedLabel) labelSel.value = savedLabel;
  if (savedLayout) layoutSel.value = savedLayout;

  labelSel.addEventListener('change', () => { localStorage.setItem('niimbot_label', labelSel.value); doPreview(); });
  layoutSel.addEventListener('change', () => { localStorage.setItem('niimbot_layout', layoutSel.value); doPreview(); });

  document.getElementById('nlpClose')!.addEventListener('click', hidePanel);
  overlay.addEventListener('click', hidePanel);
  document.getElementById('nlpPreviewBtn')!.addEventListener('click', () => doPreview());
  document.getElementById('nlpConnBtn')!.addEventListener('click', () => connectPrinter());
  document.getElementById('nlpDiscoBtn')!.addEventListener('click', () => disconnectPrinter());
  document.getElementById('nlpPrintBtn')!.addEventListener('click', () => doPrint());

  // Draggable
  let dragging = false, dx = 0, dy = 0;
  document.getElementById('nlpHeader')!.addEventListener('mousedown', (e) => {
    dragging = true;
    const rect = panel!.getBoundingClientRect();
    dx = e.clientX - rect.left; dy = e.clientY - rect.top;
    panel!.style.transform = 'none';
    panel!.style.left = rect.left + 'px';
    panel!.style.top = rect.top + 'px';
  });
  document.addEventListener('mousemove', (e) => { if (dragging) { panel!.style.left = (e.clientX - dx) + 'px'; panel!.style.top = (e.clientY - dy) + 'px'; } });
  document.addEventListener('mouseup', () => { dragging = false; });

  syncConnUI();
  doPreview();

  // Auto-connect if not already connected
  if (!client?.isConnected() && !connecting) {
    connectPrinter();
  }
}

function hidePanel() {
  if (panel) panel.style.display = 'none';
  const o = document.getElementById('niimbot-overlay');
  if (o) o.style.display = 'none';
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg.action === 'toggle-panel') {
    if (panel && panel.style.display !== 'none') hidePanel();
    else showPanel();
    send({ ok: true });
  }
  return false;
});

} // end entity block
