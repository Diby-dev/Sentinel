const scanButton = document.getElementById('scanButton');
const pauseButton = document.getElementById('pauseButton');
const resultsDiv = document.getElementById('results');

// ------------------ Scan complet ------------------ //
scanButton.addEventListener('click', async () => {
    resultsDiv.innerHTML = "<p><b>🔍 Démarrage du scan complet des disques présent sur le PC...</b></p>";
    scanButton.disabled = true;
    pauseButton.disabled = false;

    try {
        // 🧾 Historique - démarrage
        await window.antivirusAPI.addHistory("Scan entier du PC", "DÉMARRÉ 🔵");

        // Lancement du scan
        await window.antivirusAPI.startFullScan();

        // 🧾 Historique - terminé
        await window.antivirusAPI.addHistory("Le scan entier avait été lancé", "");

        resultsDiv.innerHTML += "<p style='color:lightgreen;'>✔️ Scan complet terminé avec succès.</p>";
    } catch (err) {
        resultsDiv.innerHTML += `<p style="color:orange;">[Erreur] ${err}</p>`;
        await window.antivirusAPI.addHistory("Scan complet du disque", `ÉCHEC: ${err.message || err}`);
    } finally {
        scanButton.disabled = false;
        pauseButton.disabled = true;
    }
});

// ------------------ Afficher la progression ------------------ //
window.antivirusAPI.onProgress(async (line) => {
    line = line.trim();
    if (!line) return;

    let color = "white";

    if (line.includes("INFECTED")) {
        color = "red";

        // 🔹 Tentative de mise en quarantaine automatique
        const filePath = line.split("|")[0].trim();
        try {
            const quarantined = await window.antivirusAPI.moveToQuarantine(filePath);
            if (quarantined) {
                resultsDiv.innerHTML += `<p style="color:orange;">⚠️ ${filePath} mis en quarantaine.</p>`;
            } else {
                resultsDiv.innerHTML += `<p style="color:orange;">infecté repéré : ${filePath}</p>`;
            }
        } catch (err) {
            resultsDiv.innerHTML += `<p style="color:orange;">[Erreur quarantaine] ${err}</p>`;
        }
    } else if (line.includes("CLEAN")) {
        color = "lightgreen";
    } else if (line.includes("ERROR")) {
        color = "orange";
    }

    resultsDiv.innerHTML += `<p style="color:${color};">${line}</p>`;
    resultsDiv.scrollTop = resultsDiv.scrollHeight;
});

// ------------------ Bouton "Pause" ------------------ //
pauseButton.addEventListener('click', async () => {
    const confirmation = confirm("⚠️ Le scan est en cours.\nVoulez-vous vraiment quitter ?");
    if (confirmation) {
        window.antivirusAPI.requestCloseScanWindow();
    } else {
        resultsDiv.innerHTML += "<p style='color:orange;'>⏸️ Fermeture annulée, le scan continue...</p>";
    }
});
