<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/9/91/Electron_Software_Framework_Logo.svg" width="180" alt="Electron Logo">
</p>

# Sentinel – Logiciel Antivirus Desktop (Electron + C++)

> **Projet Personnel**  
> **Statut :** En développement terminé. 
> **Type :** Application Desktop Antivirus.

---

## Description du Projet

Sentinel est un projet personnel de développement d’un logiciel antivirus desktop capable de détecter des fichiers suspects et d’effectuer différents types d’analyses système.

L’objectif principal de ce projet est de concevoir une application antivirus moderne avec une interface graphique intuitive développée avec Electron et un moteur de scan performant développé en C++.

Le logiciel permet notamment :

- d’effectuer un scan ciblé d’un fichier ou d’un dossier ;
- de scanner l’ensemble des disques présents sur une machine ;
- de détecter des signatures de virus connues ;
- de mettre automatiquement les fichiers infectés en quarantaine.

Ce projet m’a également permis d’approfondir plusieurs domaines techniques comme :
- le développement desktop avec Electron ;
- l’interconnexion Node.js / C++ ;
- la gestion des processus système ;
- l’analyse de fichiers et la sécurité informatique.

---

## Fonctionnalités Principales

* **Scan Ciblé :** Analyse d’un fichier ou dossier spécifique sélectionné par l’utilisateur.
* **Scan Complet du Système :** Analyse complète des disques présents sur l’ordinateur.
* **Détection de Signatures Virales :** Vérification des fichiers grâce à une base de signatures.
* **Mise en Quarantaine :** Isolation automatique des fichiers suspects détectés.
* **Interface Graphique Moderne :** Interface desktop développée avec Electron.
* **Communication Electron ↔ C++ :** Interaction entre le moteur natif et l’interface Node.js.
* **Gestion des Rapports de Scan :** Affichage des résultats des analyses effectuées.

---

## Technologies et Environnement

* **Interface Desktop :** Electron (Node.js)
* **Langages :** JavaScript / C++
* **Frontend :** HTML / CSS
* **Moteur Antivirus :** C++
* **Communication Backend :** Node.js Child Process
* **Système ciblé :** Windows

---

Installation et Configuration Locale

Si vous souhaitez cloner le projet et le lancer en local, suivez les étapes suivantes :

### 1. Prérequis 
Installer le framework Electron, Node.js, npm, un compilateur C++ (MinGW / g++) est requis.

### 2. Clonage du dépôt
```bash
git clone https://github.com/Diby-dev/Sentinel
cd Sentinel
```

## Architecture du Projet

```plaintext
Sentinel/
│
├── build/               # Binaires et outils du moteur
├── include/             # Fichiers d’en-tête C++
├── quarantine/          # Fichiers mis en quarantaine
├── main.js              # Process principal Electron
├── preload.js           # Bridge sécurisé Electron
├── renderer.js          # Gestion interface utilisateur
├── antivirus.cpp        # Moteur antivirus principal
├── scanner.cpp          # Analyse des fichiers
├── data.json            # Données et signatures
└── package.json
