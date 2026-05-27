const { execFile } = require('child_process'); // Module Node.js pour exécuter des programmes (comme avec le cmd) ici il va servir à executer les moteurs de scanne en c++ scanner.exe et antivirus.exe
const { ipcRenderer } = require('electron');   //Permet au code du renderer (interface) d’envoyer des messages au main process
const path = require('path'); //require() est une fonction Node.js qui permet de charger un module. Un module est une bibliothèque intégrée ou externe (comme mysql, electron, etc.) ici le module est path qui permet Gestion des chemins de fichiers et dossiers donc de manipuler mes chemins des fichiers
const fs = require('fs');// fs (File System) Lecture et écriture dans les fichiers et dossiers

const os = require('os');// os (Operating System) Il donne des infos sur le système d’exploitation : utilisateur, mémoire, CPU, etc.
const antivirusExe = path.join(process.resourcesPath, 'bin', 'antivirus.exe');

// Dossier utilisateur Documents/Sentinel
const documentsDir = path.join(os.homedir(), 'Documents', 'Sentinel');

// Assure que le dossier existe
if (!fs.existsSync(documentsDir)) {
    try { fs.mkdirSync(documentsDir, { recursive: true }); }
    catch (e) { console.warn('Impossible de créer Documents/Sentinel:', e); }
}

// Définir chemins pour quarantaine et data.json
const quarantineDir = path.join(documentsDir, 'quarantine');
const dataFile = path.join(documentsDir, 'data.json');

// Assure dossier quarantaine
if (!fs.existsSync(quarantineDir)) {
    try { fs.mkdirSync(quarantineDir); }
    catch (e) { console.warn('Impossible de créer quarantine:', e); }
}


// DOM éléments
const historyTbody = document.querySelector('#historique-body');
const quarantineTbody = document.querySelector('#section-quarantaine tbody');
const scanRapideBtn = document.querySelector('#section-analyse button:nth-child(1)');
const scanCompletBtn = document.querySelector('#section-analyse button:nth-child(2)');
const notifSidebarContent = document.querySelector('#notif-sidebar .sidebar-content');
const scanEntierBtn = document.querySelector('#section-analyse button:nth-child(3)');




// --- Assure dossier quarantaine ---
if (!fs.existsSync(quarantineDir)) {
    try { fs.mkdirSync(quarantineDir); }
    catch (e) { console.warn('Impossible de créer quarantine:', e); }
}



// --- Gestion persistence (data.json) ---
function loadData() {
    if (!fs.existsSync(dataFile)) return { historique: [], quarantaine: [] };
    try {
        const raw = fs.readFileSync(dataFile, 'utf8');
        const j = JSON.parse(raw);
        return {
            historique: Array.isArray(j.historique) ? j.historique : [],
            quarantaine: Array.isArray(j.quarantaine) ? j.quarantaine : []
        };
    } catch (e) {
        console.error('Erreur lecture data.json:', e);
        return { historique: [], quarantaine: [] };
    }
}
function saveData(data) {
    try {
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Erreur écriture data.json:', e);
    }
}
let appData = loadData();

// --- Helpers UI ---
function prependRow(tbody, html) {
    const tr = document.createElement('tr');
    tr.innerHTML = html;
    tbody.prepend(tr);
    return tr;
}

// --- Historique ---
function addHistory(action, result, save = true) {
    const date = new Date().toLocaleString();
    prependRow(historyTbody, `<td>${date}</td><td>${action}</td><td>${result}</td>`);
    if (save) {
        appData.historique.push({ date, action, result });
        saveData(appData);
    }
    // Ajouter aussi dans notifications
    addNotification(`${action} (${result})`);
}

// --- Notifications ---
function addNotification(action) {
    if (!notifSidebarContent) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    const timeStr = now.toLocaleTimeString('fr-FR');
    const btn = document.createElement('button');
    btn.textContent = `${dateStr} ${timeStr} - ${action}`;
    btn.addEventListener('click', () => {
        alert(`Détails : ${btn.textContent}`);
    });
    notifSidebarContent.prepend(btn); // Les plus récentes en haut
}

// recevoir notification qu'un fichier a été mis en quarantaine par le main process
ipcRenderer.on('quarantine-added', (event, item) => {
    // item = { filename: "<timestamp>__origname.ext", originalPath: "C:\\chemin\\orig" }
    try {
        // ajoute dans UI + sauvegarde via ta fonction existante addQuarantineRow
        addQuarantineRow(item, true);
        addHistory(`Quarantaine automatique ${item.filename}`, 'OK');
    } catch (e) {
        console.error('Erreur réception quarantine-added:', e);
    }
});

// réception si déplacement en quarantaine a échoué (optionnel)
ipcRenderer.on('quarantine-failed', (event, info) => {
    addHistory(`Quarantaine FAILED ${info.originalPath}`, 'FAILED');
});


// --- Fonction pour vider l'historique ---
function clearHistory() {
    historyTbody.innerHTML = '';
    appData.historique = [];
    saveData(appData);
    // Supprimer aussi notifications correspondantes
    if (notifSidebarContent) notifSidebarContent.innerHTML = '';
}

// Liaison bouton "vider l'historique"
const clearHistoryBtn = document.querySelector('#settings-sidebar button:nth-child(1)');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
        clearHistory();
        alert('Historique vidé');
    });
}

function createQuarantineRow(item) {
    const { filename, originalPath } = typeof item === 'string' 
        ? { filename: item, originalPath: null } 
        : item;

    const date = new Date().toLocaleDateString();
    const tr = document.createElement('tr');

    tr.innerHTML = `
        <td>${filename.replace(/^\d+__/, '')}</td>
        <td>${originalPath ? originalPath : 'Chemin inconnu'}</td>
        <td>${date}</td>
        <td>
            <button class="restore">Restaurer</button>
            <button class="delete">Supprimer</button>
        </td>
    `;

    // --- Supprimer ---
    tr.querySelector('.delete').addEventListener('click', () => {
        const fp = path.join(quarantineDir, filename);
        try {
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
            tr.remove();
            appData.quarantaine = appData.quarantaine.filter(f => f.filename !== filename);
            saveData(appData);
            addHistory(`Suppression quarantaine ${filename}`, 'OK');
        } catch (e) {
            alert('Impossible de supprimer : ' + e.message);
            addHistory(`Suppression quarantaine ${filename}`, `FAILED: ${e.message}`);
        }
    });

    

    

    // --- Restaurer ---
    tr.querySelector('.restore').addEventListener('click', () => {
        const src = path.join(quarantineDir, filename);
        let dest = originalPath || path.join(documentsDir, filename);


        try {
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

            fs.renameSync(src, dest);
            tr.remove();

            appData.quarantaine = appData.quarantaine.filter(f => f.filename !== filename);
            saveData(appData);

            addHistory(`Restauration ${filename}`, 'OK');
        } catch (e) {
            alert('Impossible de restaurer : ' + e.message);
            addHistory(`Restauration ${filename}`, `FAILED: ${e.message}`);
        }
    });

    return tr;
}


function addQuarantineRow(item, save = true) {
    const tr = createQuarantineRow(item);
    quarantineTbody.prepend(tr);
    if (save) {
        appData.quarantaine.push(item);
        saveData(appData);
    }
}


// --- Déplacer fichier en quarantaine Windows-safe ---
function moveToQuarantine(filePath) {
    if (!fs.existsSync(filePath)) return;

    const base = path.basename(filePath);
    const destBase = `${Date.now()}__${base}`;
    const dest = path.join(quarantineDir, destBase);

    try {
        // Essai de déplacement direct
        try {
            fs.renameSync(filePath, dest);
            const quarantineItem = { filename: destBase, originalPath: filePath };
            appData.quarantaine.push(quarantineItem);
            saveData(appData);
            addQuarantineRow(quarantineItem, false);
            addHistory(`Quarantaine ${base}`, 'OK (déplacé)');
            return; // tout est OK
        } catch (errRename) {
            // Si échoue, fallback sur copie + suppression retry
            console.warn(`Impossible de déplacer ${filePath} directement, fallback copie+delete`, errRename);
        }

        // Copier le fichier dans la quarantaine
        fs.copyFileSync(filePath, dest);

        // Essayer de supprimer l'original avec retry simple
        let attempts = 0;
        const maxAttempts = 10;
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

        (async () => {
            while (fs.existsSync(filePath) && attempts < maxAttempts) {
                try {
                    fs.unlinkSync(filePath);
                    break;
                } catch (e) {
                    attempts++;
                    console.warn(`Impossible de supprimer ${filePath}, tentative ${attempts}`);
                    await wait(100); // attend 100ms
                }
            }
            if (fs.existsSync(filePath)) {
                console.warn(`Échec suppression après ${maxAttempts} tentatives. Le fichier restera en place.`);
            }
        })();

        const quarantineItem = { filename: destBase, originalPath: filePath };
        appData.quarantaine.push(quarantineItem);
        saveData(appData);
        addQuarantineRow(quarantineItem, false);
        addHistory(`Quarantaine ${base}`, 'OK (copie+delete fallback)');

    } catch (err) {
        addHistory(`Quarantaine ${base}`, `FAILED: ${err.message}`);
    }
}

// Bouton "supprimer fichier"
const deleteFileBtn = document.querySelector('#section-analyse button:nth-child(4)');

if (deleteFileBtn) {
    deleteFileBtn.addEventListener('click', async () => {
        const filePath = await openPicker(['openFile']); // ouvre le sélecteur de fichiers
        if (!filePath) return; // si annulé

        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath); // supprime le fichier
                alert(`Fichier supprimé : ${filePath}`);
                addHistory(`Suppression fichier`, filePath);
            } else {
                alert('Fichier introuvable.');
            }
        } catch (e) {
            alert(`Impossible de supprimer le fichier : ${e.message}`);
            addHistory(`Suppression fichier FAILED`, filePath);
        }
    });
}



// --- Restauration safe ---
function restoreFromQuarantine(item) {
    const src = path.join(quarantineDir, item.filename);
    let dest = item.originalPath || path.join(os.homedir(), 'Documents', item.filename.replace(/^\d+__/, ''));

    // Si le fichier destination existe déjà, ajouter un suffixe
    const parsed = path.parse(dest);
    let counter = 1;
    while (fs.existsSync(dest)) {
        dest = path.join(parsed.dir, `${parsed.name}_copy${counter}${parsed.ext}`);
        counter++;
    }

    try {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        fs.renameSync(src, dest);

        // Mise à jour UI et data.json
        appData.quarantaine = appData.quarantaine.filter(f => f.filename !== item.filename);
        saveData(appData);
        quarantineTbody.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('td').textContent === item.filename.replace(/^\d+__/, '')) tr.remove();
        });

        addHistory(`Restauration ${item.filename}`, 'OK');
    } catch (e) {
        addHistory(`Restauration ${item.filename}`, `FAILED: ${e.message}`);
        alert(`Impossible de restaurer le fichier : ${e.message}`);
    }
}

function showScanLoading() {
    document.getElementById('scanLoading').style.display = 'flex';
}

function hideScanLoading() {
    document.getElementById('scanLoading').style.display = 'none';
}







// parser la sortie du moteur
function handleOutput(stdout, stderr) {
    if (stderr && stderr.trim()) console.warn('antivirus stderr:', stderr);
    const lines = (stdout || '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
    if (lines.length === 0) addHistory('Scan', 'No output from engine');
    for (const line of lines) {
        if (line.startsWith('DIR_ERROR|') || line.startsWith('ERROR|')) {
            addHistory('Engine error', line);
            continue;
        }
        const parts = line.split('|');
        if (parts.length < 2) continue;
        const filePath = parts[0];
        const status = parts[1];
        const fileName = path.basename(filePath); // récupère uniquement le nom du fichier

if (status === 'INFECTED') {
    addHistory(`Scan ${fileName}`, 'INFECTÉ 🔴');
    showMessageBox(`Le fichier ${fileName} est infecté, mise en quarantaine du fichier`, 'infected');
    if (fs.existsSync(filePath)) moveToQuarantine(filePath);
} else if (status === 'CLEAN') {
    addHistory(`Scan ${fileName}`, 'CLEAN 🟢');
    showMessageBox(`Le fichier ${fileName} est clean ✅`, 'safe');
}


    }
    hideScanLoading();

    // ✅ Ajouter message box
    let infected = lines.some(line => line.includes('INFECTED'));
    if (lines.length === 0);
    else if (infected);
    else ;
}


// Lancer l'antivirus
function runAntivirus(targetPath, isFolder=false) {
    if (!fs.existsSync(antivirusExe)) {
        alert('antivirus.exe introuvable dans le dossier de l\'application.');
        return;
    }
    addHistory(`Lancement scan ${targetPath}`, 'DÉMARRÉ 🔵');
    execFile(antivirusExe, [targetPath], { windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
            console.error('Erreur execFile:', err);
            addHistory('Erreur engine', err.message);
            alert('Erreur lors du lancement du moteur. Voir console.');
            return;
        }
        if (isFolder) handleFolderScanOutput(stdout, stderr);
        else handleOutput(stdout, stderr);
    });
}

function handleFolderScanOutput(stdout, stderr) {
    if (stderr && stderr.trim()) console.warn('antivirus stderr:', stderr);
    const lines = (stdout || '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length);

    let cleanCount = 0;
    let infectedCount = 0;
    const fileResults = [];

    for (const line of lines) {
        if (line.startsWith('DIR_ERROR|') || line.startsWith('ERROR|')) continue;
        const parts = line.split('|');
        if (parts.length < 2) continue;

        const filePath = parts[0];
        const status = parts[1];
        const fileName = path.basename(filePath);

        if (status === 'INFECTED') {
            infectedCount++;
            if (fs.existsSync(filePath)) moveToQuarantine(filePath);
            addHistory(`Scan ${fileName}`, 'INFECTÉ 🔴');
            fileResults.push(`${fileName} - INFECTÉ 🔴`);
        } else {
            cleanCount++;
            addHistory(`Scan ${fileName}`, 'CLEAN 🟢');
            fileResults.push(`${fileName} - CLEAN 🟢`);
        }
    }

    showFolderScanMessageBox(cleanCount, infectedCount, fileResults);

    hideScanLoading();
}


async function openPicker(properties = ['openFile']) {
    try {
        const res = await ipcRenderer.invoke('show-open-dialog', { properties });
        if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null;
        return res.filePaths[0];
    } catch (e) {
        console.error('openPicker error:', e);
        return null;
    }
}

// Liaisons boutons UI
if (scanRapideBtn) {
    scanRapideBtn.addEventListener('click', async () => {
        const chosen = await openPicker(['openFile']);
        if (!chosen) return;
        showScanLoading(); // Affiche le message
        runAntivirus(chosen);
        addNotification('Scan rapide lancé');
    });
}
if (scanCompletBtn) {
    scanCompletBtn.addEventListener('click', async () => {
        const chosen = await openPicker(['openDirectory']);
        if (!chosen) return;
        showScanLoading(); // Affiche le message
        runAntivirus(chosen, true); // <-- true pour signaler scan de dossier
        addNotification('Scan complet lancé');
    });
}
if (scanEntierBtn) {
    scanEntierBtn.addEventListener('click', () => {
        ipcRenderer.send('open-scanent'); // message vers main.js pour ouvrir la fenêtre
    });
}


document.getElementById('folderScanOk').addEventListener('click', () => {
    document.getElementById('folderScanMessageBox').style.display = 'none';
});


// ----- Boîte de message personnalisée -----
function showMessageBox(message, type='safe') {
    const box = document.getElementById('customMessageBox');
    const text = document.getElementById('cmb-text');
    const emoji = document.getElementById('cmb-emoji');

    if(type === 'infected') {
        box.style.background = 'rgba(100,0,0,0.5)';
        text.style.color = '#ff4444';
        emoji.textContent = '🛑';
    } else if(type === 'safe') {
        box.style.background = 'rgba(0,0,0,0.5)';
        text.style.color = '#48ff00';
        emoji.textContent = '✅';
    } else if(type === 'warning') {
        box.style.background = 'rgba(50,50,0,0.5)';
        text.style.color = '#ffd700';
        emoji.textContent = '⚠️';
    }

    text.textContent = message;
    box.style.display = 'flex';
}

// Fermer le message box
document.getElementById('cmb-ok').addEventListener('click', () => {
    document.getElementById('customMessageBox').style.display = 'none';
});

function showFolderScanMessageBox(cleanCount, infectedCount, fileResults) {
    const box = document.getElementById('folderScanMessageBox');
    const countText = document.getElementById('folderScanCounts');
    const listText = document.getElementById('folderScanList');

    box.style.display = 'flex';
    countText.textContent = `Clean : ${cleanCount} | Infecté : ${infectedCount}`;
    listText.innerHTML = fileResults.map(f => `<div>${f}</div>`).join('');
}



fullScanOk.addEventListener('click', () => {
    fullScanMB.style.display = 'none';
});

// Restaurer UI depuis appData
function restoreUI() {
    // Historique
    historyTbody.innerHTML = '';
    for (const entry of appData.historique) {
        prependRow(historyTbody, `<td>${entry.date}</td><td>${entry.action}</td><td>${entry.result}</td>`);
        addNotification(`${entry.action} (${entry.result})`);
    }
    

   quarantineTbody.innerHTML = '';
for (const item of appData.quarantaine) {
    const tr = createQuarantineRow(item);
    quarantineTbody.prepend(tr);
}

}

        // ----- Electron window controls (réintégrés) -----
        // (fonctionnera si tu exécutes dans Electron et que `require` est disponible)
        try {
            const { ipcRenderer } = require('electron');
            document.getElementById('min').addEventListener('click', (e) => { e.stopPropagation(); ipcRenderer.send('window-minimize'); });
            document.getElementById('max').addEventListener('click', (e) => { e.stopPropagation(); ipcRenderer.send('window-maximize'); });
            document.getElementById('close').addEventListener('click', (e) => { e.stopPropagation(); ipcRenderer.send('window-close'); });
        } catch (err) {
            // Si tu ouvres le fichier dans un navigateur normal, require n'existe pas — on ignore l'erreur.
            console.warn('ipcRenderer non disponible (mode navigateur).', err);
        }

        // Show interface after welcome
        setTimeout(()=>{
            document.getElementById('welcome').style.display = 'none';
            document.getElementById('interface').style.display = 'flex';
            const topButtonsContainer = document.getElementById('topButtonsContainer');
            topButtonsContainer.style.opacity = '1';
            topButtonsContainer.style.visibility = 'visible';
        }, 3400); // 3.4s

        // Variables
        const bottomSidebar = document.getElementById('sidebar'); // menu bas
        const menuButton = document.getElementById('menuButton');
        const topButtonsContainer = document.getElementById('topButtonsContainer');

        let bottomSidebarOpen = false;          // état du menu du bas
        let currentTopSidebarOpen = null;       // id de la sidebar du haut ouverte (ex: "settings-sidebar")
        
        // Bas: toggle menuButton (menu du bas)
        menuButton.addEventListener('click', (e) => {
            e.stopPropagation(); // empêcher le listener global de fermer immédiatement
            bottomSidebarOpen = !bottomSidebarOpen;
            bottomSidebar.classList.toggle('open', bottomSidebarOpen);
            menuButton.innerHTML = bottomSidebarOpen ? '⌄' : '⌃';
            menuButton.style.bottom = bottomSidebarOpen ? '140px' : '15px';
        });

        // Navigation du menu bas -> sections
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation(); // rester ouvert si on clique dedans
                document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                const sectionId = item.getAttribute('data-section');
                switchSection(sectionId);
            });
        });

        function switchSection(sectionId) {
            const sections = document.querySelectorAll('.section');
            sections.forEach(section => {
                if (section.id === sectionId) {
                    section.classList.add('active');
                    section.classList.remove('leaving');
                } else if (section.classList.contains('active')) {
                    section.classList.remove('active');
                    section.classList.add('leaving');
                    setTimeout(() => {
                        section.classList.remove('leaving');
                    }, 500);
                }
            });
            // mettre à jour le titre de l'interface
            const interfaceTitle = document.getElementById('interface-title');
            const activeItem = document.querySelector(`.sidebar-item[data-section="${sectionId}"]`);
            if (activeItem) interfaceTitle.textContent = activeItem.querySelector('.label').textContent;
        }

        // Top sidebars (settings / notif / help)
        const topButtons = {
            settingsButton: 'settings-sidebar',
            notifButton: 'notif-sidebar',
            helpButton: 'help-sidebar'
        };

        for (const [buttonId, sidebarId] of Object.entries(topButtons)) {
            const button = document.getElementById(buttonId);
            const sb = document.getElementById(sidebarId);
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // important : empêcher le document.click global
                // fermer autre sidebar du haut si ouverte
                if (currentTopSidebarOpen && currentTopSidebarOpen !== sidebarId) {
                    document.getElementById(currentTopSidebarOpen).classList.remove('open');
                }
                // toggle la sidebar
                sb.classList.toggle('open');
                topButtonsContainer.classList.toggle('shift-right', sb.classList.contains('open'));
                currentTopSidebarOpen = sb.classList.contains('open') ? sidebarId : null;
            });
        }

        // Pare-feu toggle
        const firewallStatus = document.getElementById('firewall-status');
        const toggleFirewall = document.getElementById('toggle-firewall');
        toggleFirewall.addEventListener('click', (e)=>{
            e.stopPropagation();
            if(toggleFirewall.textContent=='Désactiver'){
                toggleFirewall.textContent='Activer';
                firewallStatus.textContent='Désactivé ❌';
            } else {
                toggleFirewall.textContent='Désactiver';
                firewallStatus.textContent='Activé ✅';
            }
        });

        // Navigation sécurisée toggle
        const secureBrowserStatus = document.getElementById('secure-browser-status');
        const toggleSecureBrowser = document.getElementById('toggle-secure-browser');
        toggleSecureBrowser.addEventListener('click', (e)=>{
            e.stopPropagation();
            if(toggleSecureBrowser.textContent=='Désactiver'){
                toggleSecureBrowser.textContent='Activer';
                secureBrowserStatus.textContent='Mode sécurisé désactivé ❌';
            } else {
                toggleSecureBrowser.textContent='Désactiver';
                secureBrowserStatus.textContent='Mode sécurisé activé ✅';
            }
        });

        // ----- Fermer les sidebars si on clique ailleurs (mais PAS quand on clique sur la barre haute / boutons) -----
        document.addEventListener('click', (event) => {
            // si rien n'est ouvert => rien à faire
            if (!currentTopSidebarOpen && !bottomSidebarOpen) return;

            // tests : clic à l'intérieur d'une sidebar/topButton/menuButton/titlebar ?
            const clickedInsideTopSidebar = currentTopSidebarOpen ? document.getElementById(currentTopSidebarOpen).contains(event.target) : false;
            const clickedInsideBottomSidebar = bottomSidebarOpen ? bottomSidebar.contains(event.target) : false;
            const clickedOnTopButtons = Object.keys(topButtons).some(id => document.getElementById(id).contains(event.target));
            const clickedOnMenuButton = menuButton.contains(event.target);
            const clickedOnTitlebar = event.target.closest('.title-bar') !== null; // permet aux boutons min/max/close de fonctionner

            // si on a cliqué en dehors de tout ça, on ferme les sidebars ouvertes
            if (!clickedInsideTopSidebar && !clickedInsideBottomSidebar && !clickedOnTopButtons && !clickedOnMenuButton && !clickedOnTitlebar) {
                if (currentTopSidebarOpen) {
                    document.getElementById(currentTopSidebarOpen).classList.remove('open');
                    currentTopSidebarOpen = null;
                    topButtonsContainer.classList.remove('shift-right');
                }
                if (bottomSidebarOpen) {
                    bottomSidebar.classList.remove('open');
                    bottomSidebarOpen = false;
                    menuButton.innerHTML = '⌃';
                    menuButton.style.bottom = '15px';
                }
            }
        });

document.addEventListener('DOMContentLoaded', () => {
    restoreUI();
});
