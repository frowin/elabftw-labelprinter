import { NiimbotBluetoothClient, ImageEncoder } from '@mmote/niimbluelib';
import { labelConfigs, getLabelConfig } from './label-configs';
import { layoutConfigs, getLayoutConfig, EntityData } from './layout-configs';
import { renderLabel, renderPreview, loadImageFromDataUrl } from './renderer';

// DOM refs
const noPage = document.getElementById('noPage')!;
const mainContent = document.getElementById('mainContent')!;
const entityType = document.getElementById('entityType')!;
const entityTitle = document.getElementById('entityTitle')!;
const labelSelect = document.getElementById('labelSelect') as HTMLSelectElement;
const layoutSelect = document.getElementById('layoutSelect') as HTMLSelectElement;
const previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
const statusText = document.getElementById('statusText')!;
const previewBtn = document.getElementById('previewBtn')!;
const connectBtn = document.getElementById('connectBtn')!;
const disconnectBtn = document.getElementById('disconnectBtn')!;
const printBtn = document.getElementById('printBtn') as HTMLButtonElement;
const connDot = document.getElementById('connDot')!;
const connLabel = document.getElementById('connLabel')!;

let client: NiimbotBluetoothClient | null = null;
let cachedData: EntityData | null = null;
let cachedQrDataUrl: string | null = null;
let activeTabId: number | null = null;

function setStatus(msg: string, type: 'info' | 'error' | 'success' = 'info') {
  statusText.textContent = msg;
  statusText.className = 'status';
  if (type !== 'info') statusText.classList.add(type);
}

function setConnected(connected: boolean) {
  connDot.classList.toggle('on', connected);
  connLabel.textContent = connected ? 'Connected' : 'Disconnected';
  printBtn.disabled = !connected;
  disconnectBtn.style.display = connected ? '' : 'none';
  connectBtn.textContent = connected ? 'Reconnect' : 'Connect';
}

function sendToContent(msg: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(activeTabId!, msg, resolve);
  });
}

async function fetchEntityData(): Promise<EntityData | null> {
  const resp = await sendToContent({ action: 'fetchEntityData' }) as { data?: EntityData; error?: string };
  if (resp?.error || !resp?.data) {
    setStatus(resp?.error ?? 'Failed to fetch data', 'error');
    return null;
  }
  return resp.data;
}

async function fetchQrImage(size: number): Promise<HTMLImageElement | null> {
  const resp = await sendToContent({ action: 'fetchQrPng', size }) as { dataUrl?: string; error?: string };
  if (resp?.error || !resp?.dataUrl) return null;
  cachedQrDataUrl = resp.dataUrl;
  return loadImageFromDataUrl(resp.dataUrl);
}

async function doPreview() {
  setStatus('Rendering preview\u2026');
  try {
    const data = cachedData ?? await fetchEntityData();
    if (!data) return;
    cachedData = data;

    const label = getLabelConfig(labelSelect.value);
    const layout = getLayoutConfig(layoutSelect.value);
    const qrSize = label.printheadPx - label.margin * 2;
    const qrImg = await fetchQrImage(qrSize);

    const canvas = renderLabel(data, label, layout, qrImg);
    const scale = Math.max(2, Math.floor(390 / canvas.width));
    renderPreview(canvas, previewCanvas, scale);
    setStatus(`${label.widthMm}\u00d7${label.heightMm} mm \u2014 ${layout.name}`, 'info');
  } catch (e) {
    setStatus(`Preview failed: ${e}`, 'error');
  }
}

// Populate selects
labelConfigs.forEach(c => labelSelect.add(new Option(c.name, c.id)));
layoutConfigs.forEach(c => layoutSelect.add(new Option(`${c.name} \u2014 ${c.description}`, c.id)));

// Restore last selection from localStorage
const savedLabel = localStorage.getItem('niimbot_label');
const savedLayout = localStorage.getItem('niimbot_layout');
if (savedLabel) labelSelect.value = savedLabel;
if (savedLayout) layoutSelect.value = savedLayout;

labelSelect.addEventListener('change', () => {
  localStorage.setItem('niimbot_label', labelSelect.value);
  cachedQrDataUrl = null;
  doPreview();
});
layoutSelect.addEventListener('change', () => {
  localStorage.setItem('niimbot_layout', layoutSelect.value);
  doPreview();
});
previewBtn.addEventListener('click', () => {
  cachedData = null;
  cachedQrDataUrl = null;
  doPreview();
});

connectBtn.addEventListener('click', async () => {
  // Check Bluetooth availability first
  if (!navigator.bluetooth) {
    setStatus('Web Bluetooth API not available. Use Chrome/Edge and check chrome://flags/#enable-web-bluetooth', 'error');
    return;
  }
  try {
    const available = await navigator.bluetooth.getAvailability();
    if (!available) {
      setStatus('Bluetooth is not available. Check that Bluetooth is on and Chrome has permission (macOS: System Settings > Privacy & Security > Bluetooth).', 'error');
      return;
    }
  } catch {
    // getAvailability not supported in all browsers, continue anyway
  }

  setStatus('Opening Bluetooth device picker \u2014 select your Niimbot printer\u2026');
  setConnected(false);
  try {
    client = new NiimbotBluetoothClient();
    const info = await client.connect();
    await client.fetchPrinterInfo();
    setStatus(`Connected: ${info.deviceName ?? 'Niimbot printer'}`, 'success');
    setConnected(true);
  } catch (e: unknown) {
    client = null;
    const msg = String(e);
    if (msg.includes('cancelled')) {
      setStatus('Bluetooth picker was closed. Make sure your printer is ON and in range, then try again.', 'error');
    } else if (msg.includes('NotFoundError')) {
      setStatus('No Niimbot printer found. Is the printer turned on? Check macOS Bluetooth permissions for Chrome.', 'error');
    } else {
      setStatus(`Connection failed: ${msg}`, 'error');
    }
  }
});

disconnectBtn.addEventListener('click', async () => {
  if (client) {
    await client.disconnect().catch(() => undefined);
    client = null;
  }
  setStatus('Disconnected');
  setConnected(false);
});

printBtn.addEventListener('click', async () => {
  if (!client?.isConnected()) {
    setStatus('Not connected \u2014 click Connect first.', 'error');
    return;
  }
  printBtn.disabled = true;
  printBtn.textContent = 'Printing\u2026';
  setStatus('Sending to printer\u2026');

  try {
    const data = cachedData ?? await fetchEntityData();
    if (!data) return;

    const label = getLabelConfig(labelSelect.value);
    const layout = getLayoutConfig(layoutSelect.value);
    const qrSize = label.printheadPx - label.margin * 2;

    let qrImg: HTMLImageElement | null = null;
    if (cachedQrDataUrl) {
      qrImg = await loadImageFromDataUrl(cachedQrDataUrl);
    } else {
      qrImg = await fetchQrImage(qrSize);
    }

    const canvas = renderLabel(data, label, layout, qrImg);
    const encoded = ImageEncoder.encodeCanvas(canvas, label.printDirection);

    const taskName = client.getPrintTaskType() ?? 'B21_V1';
    const printTask = client.abstraction.newPrintTask(taskName, { totalPages: 1 });
    try {
      await printTask.printInit();
      await printTask.printPage(encoded, 1);
      await printTask.waitForFinished();
      setStatus('Printed successfully!', 'success');
    } finally {
      await client.abstraction.printEnd();
    }
  } catch (e) {
    setStatus(`Print failed: ${e}`, 'error');
  } finally {
    printBtn.disabled = !client?.isConnected();
    printBtn.textContent = 'Print';
  }
});

// Init: read entity info from URL params (set by background.ts)
const urlParams = new URLSearchParams(window.location.search);
const paramTabId = urlParams.get('tabId');
const paramType = urlParams.get('type');
const paramId = urlParams.get('id');

if (paramTabId) activeTabId = parseInt(paramTabId, 10);

if (paramType && paramId && activeTabId) {
  mainContent.style.display = '';
  entityType.textContent = paramType === 'items' ? 'Resource' : 'Experiment';
  entityTitle.textContent = `#${paramId}`;
  doPreview();
} else {
  noPage.style.display = '';
}
