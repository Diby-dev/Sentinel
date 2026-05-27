// main.js permets de gérer les fenêtres, la communication entre les fenêtres (IPC), et les opérations principales de l'application Sentinel.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// ------------------------------------------------------------------
// 🧱 VARIABLES GLOBALES
let authWindow = null;
let mainWindow = null;
let scanentWindow = null;
let scanProcess = null;

const configDir = path.join(app.getPath('documents'), 'Sentinel');
const configFile = path.join(configDir, 'config.json');
const quarantineDir = path.join(configDir, 'quarantine');
const dataFile = path.join(configDir, 'data.json');

// ------------------------------------------------------------------
// ⚙️ CRÉATION DES FENÊTRES
function createAuthWindow() {
  authWindow = new BrowserWindow({
    width: 400,
    height: 450,
    resizable: false,
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  authWindow.removeMenu(); // 🔹 supprime la barre File/Edit/View/etc.
  authWindow.loadFile('auth.html');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1130,
    height: 650,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.loadFile('index.html');
}

function createScanentWindow() {
  if (scanentWindow) return;
  scanentWindow = new BrowserWindow({
    width: 1060,
    height: 700,
    maximizable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  scanentWindow.removeMenu(); // 🔹 supprime la barre File/Edit/View/etc.
  scanentWindow.loadFile('scanent.html');

  scanentWindow.on('close', () => {
    if (scanProcess && !scanProcess.killed) {
      try { scanProcess.kill('SIGTERM'); } catch (e) {}
    }
  });

  scanentWindow.on('closed', () => {
    scanentWindow = null;
  });
}

// ------------------------------------------------------------------
// 🧩 GESTION FENÊTRES : MINIMISER, MAXIMISER, FERMER
ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

// ------------------------------------------------------------------
// ⚙️ IPC AUTHENTIFICATION
ipcMain.handle('check-code-exists', () => fs.existsSync(configFile));

ipcMain.handle('get-hint', () => {
  if (!fs.existsSync(configFile)) return null;
  const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  return data.hint || null;
});

ipcMain.handle('save-code', (event, code, hint) => {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify({ code, hint }), 'utf8');
});

ipcMain.handle('check-code', (event, entered) => {
  if (!fs.existsSync(configFile)) return false;
  const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  return entered === data.code;
});

ipcMain.on('auth-success', () => {
  if (authWindow) {
    authWindow.close();
    createMainWindow();
  }
});

// ------------------------------------------------------------------
// 🧱 GESTION QUARANTAINE
async function moveToQuarantineMain(originalPath) {
  try {
    if (!originalPath || !fs.existsSync(originalPath)) return null;
    fs.mkdirSync(quarantineDir, { recursive: true });

    const base = path.basename(originalPath);
    const destBase = `${Date.now()}__${base}`;
    const dest = path.join(quarantineDir, destBase);

    try {
      fs.renameSync(originalPath, dest);
    } catch (err) {
      const data = fs.readFileSync(originalPath);
      fs.writeFileSync(dest, data);
      try { fs.unlinkSync(originalPath); } catch {}
    }

    // Met à jour data.json
    fs.mkdirSync(configDir, { recursive: true });
    let data = { historique: [], quarantaine: [] };
    if (fs.existsSync(dataFile)) {
      data = JSON.parse(fs.readFileSync(dataFile, 'utf8') || '{}');
      if (!Array.isArray(data.quarantaine)) data.quarantaine = [];
    }

    const now = new Date().toLocaleString();
    data.quarantaine.push({ date: now, filename: destBase, originalPath });

    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`🦠 Fichier mis en quarantaine : ${destBase}`);
    return { filename: destBase, originalPath };
  } catch (e) {
    console.error('moveToQuarantineMain error:', e);
    return null;
  }
}
ipcMain.handle('move-to-quarantine', async (event, filePath) => {
  return await moveToQuarantineMain(filePath);
});

// ------------------------------------------------------------------
// ⚙️ LANCEMENT DU SCAN COMPLET
ipcMain.handle('start-full-scan', async () => {
  if (!scanentWindow) return;
  const scannerPath = path.join(process.resourcesPath, 'bin', 'scanner.exe');
  const sigPath = path.join(process.resourcesPath, 'data', 'signatures.txt');

  if (!fs.existsSync(scannerPath)) {
    console.error('scanner.exe introuvable');
    scanentWindow.webContents.send('scan-progress', '[ERROR] scanner.exe introuvable.');
    return;
  }
  if (!fs.existsSync(sigPath)) {
    console.error('signatures.txt introuvable');
    scanentWindow.webContents.send('scan-progress', '[ERROR] signatures.txt introuvable.');
    return;
  }

  return new Promise((resolve) => {
    scanProcess = spawn(scannerPath, [sigPath]);
    scanProcess.stdout.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (line && scanentWindow && !scanentWindow.isDestroyed()) {
          scanentWindow.webContents.send('scan-progress', line);
        }
      }
    });
    scanProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      console.error('stderr:', msg);
      if (scanentWindow && !scanentWindow.isDestroyed()) {
        scanentWindow.webContents.send('scan-progress', `[ERREUR] ${msg}`);
      }
    });
    scanProcess.on('close', (code) => {
      console.log(`✅ Scan terminé avec code ${code}`);
      scanProcess = null;
      if (scanentWindow && !scanentWindow.isDestroyed()) {
        scanentWindow.webContents.send('scan-progress', '✅ Scan complet terminé.');
      }
      resolve();
    });
  });
});

// ------------------------------------------------------------------
// 🧩 AUTRES IPC
ipcMain.on('open-scanent', () => createScanentWindow());
ipcMain.on('close-scan-window', () => {
  if (scanentWindow) {
    scanentWindow.close();
    scanentWindow = null;
  }
});

ipcMain.handle('add-history', async (event, action, result) => {
  try {
    fs.mkdirSync(configDir, { recursive: true });
    let data = { historique: [], quarantaine: [] };
    if (fs.existsSync(dataFile)) {
      data = JSON.parse(fs.readFileSync(dataFile, 'utf8') || '{}');
      if (!Array.isArray(data.historique)) data.historique = [];
      if (!Array.isArray(data.quarantaine)) data.quarantaine = [];
    }
    const now = new Date().toLocaleString();
    data.historique.push({ date: now, action, result });
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`📝 Historique ajouté : ${action} -> ${result}`);
  } catch (err) {
    console.error('Erreur écriture historique:', err);
  }
});

ipcMain.handle('show-open-dialog', async (event, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, opts);
  return result;
});

// ------------------------------------------------------------------
// 🚀 DÉMARRAGE DE L'APPLICATION
app.whenReady().then(createAuthWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createAuthWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ------------------------------------------------------------------
// 🧱 CAPTURE D’ERREURS GLOBALES
process.on('uncaughtException', (err) => console.error('Erreur non gérée :', err));
process.on('unhandledRejection', (reason) => console.error('Promesse non gérée :', reason));
