// preload.js il sert de pont sécurisé entre le renderer (la page web) et le main process.  (facultatif) le renderer n’a pas d’accès direct aux modules dangereux. toutes les fonctions exposées sont centralisées dans preload.js.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("antivirusAPI", { // expose l'API au renderer
    startFullScan: () => ipcRenderer.invoke("start-full-scan"),// démarre le scan complet
    onProgress: (callback) => ipcRenderer.on("scan-progress", (_, line) => callback(line)), // écoute les mises à jour de progression   
    requestCloseScanWindow: () => ipcRenderer.send("close-scan-window"),// demande la fermeture de la fenêtre de scan de scanent.html
    addHistory: (action, result) => ipcRenderer.invoke("add-history", action, result),// ajoute une entrée à l'historique
    moveToQuarantine: (filePath) => ipcRenderer.invoke("move-to-quarantine", filePath)// déplace un fichier en quarantaine
});
