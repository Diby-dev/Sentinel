#include <iostream>// Pour les entrées/sorties
#include <fstream>// Pour la gestion des fichiers
#include <string>// Pour les chaînes de caractères
#include <vector>// Pour les vecteurs Un vecteur (std::vector) est un tableau dynamique : tu peux y ajouter ou supprimer des éléments sans connaître sa taille à l’avance.
#include <filesystem>// Pour la manipulation des chemins de fichiers
#include <openssl/sha.h>// Pour le calcul SHA-256
#include <algorithm>// inclut la bibliothèque des algorithmes standards. Contient des fonctions pour trier, transformer, rechercher, ou manipuler des collections.
#include <cctype>//cctype> //inclut les fonctions de manipulation de caractères. par exemple std::tolower transforme un caractère en minuscule utile pour la comparaison des sha256

namespace fs = std::filesystem;  //En C++, std est l’espace de noms standard (« standard namespace ») de la bibliothèque standard du C++. std contient toutes les fonctions, classes et objets de la bibliothèque standard de C++.

// --- Nettoie les espaces et retours chariot ---
std::string trim(const std::string &s) {
    size_t start = s.find_first_not_of(" \r\n\t");
    size_t end = s.find_last_not_of(" \r\n\t");
    return (start == std::string::npos) ? "" : s.substr(start, end - start + 1);
}

// --- Chargement des signatures depuis un fichier ---
std::vector<std::string> loadSignatures(const std::string &filename) {
    std::vector<std::string> sigs;
    std::ifstream file(filename);
    if (!file.is_open()) return sigs;

    std::string line;
    while (std::getline(file, line)) {
        line = trim(line);
        if (!line.empty()) {
            // Forcer en minuscules
            std::transform(line.begin(), line.end(), line.begin(), ::tolower);
            sigs.push_back(line);
        }
    }
    return sigs;
}

// --- Calcul SHA-256 d'un fichier ---
std::string sha256File(const fs::path &p) {
    std::ifstream in(p, std::ios::binary);
    if (!in.is_open()) return "";

    SHA256_CTX ctx;
    SHA256_Init(&ctx);

    const size_t BUF = 8192;
    std::vector<char> buffer(BUF);

    while (in) {
        in.read(buffer.data(), BUF);
        std::streamsize readBytes = in.gcount();
        if (readBytes > 0) {
            SHA256_Update(&ctx, buffer.data(), readBytes);
        }
    }

    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_Final(hash, &ctx);

    std::string hexHash;
    char buf[3];
    for (int i = 0; i < SHA256_DIGEST_LENGTH; ++i) {
        sprintf(buf, "%02x", hash[i]);
        hexHash += buf;
    }
    return hexHash;
}

// --- Vérifie si le fichier est infecté ---
bool isInfected(const fs::path &p, const std::vector<std::string> &signatures) {
    std::string fileHash = sha256File(p);
    for (const auto &sig : signatures) {
        if (fileHash == sig) return true;
    }
    return false;
}

// --- Rapporte le résultat d'un fichier ---
void reportFile(const fs::path &p, const std::vector<std::string> &signatures) {
    try {
        bool inf = isInfected(p, signatures);
        std::cout << p.u8string() << "|" << (inf ? "INFECTED" : "CLEAN") << std::endl;
    } catch (...) {
        std::cout << p.u8string() << "|ERROR" << std::endl;
    }
}

// --- Scan récursif d'un dossier ---
void scanDirectoryRecursive(const fs::path &dir, const std::vector<std::string> &signatures) {
    try {
        for (auto it = fs::recursive_directory_iterator(dir, fs::directory_options::skip_permission_denied);
             it != fs::recursive_directory_iterator(); ++it) {
            try {
                if (it->is_regular_file()) reportFile(it->path(), signatures);
            } catch (const fs::filesystem_error &) {
                std::cout << it->path().u8string() << "|ERROR" << std::endl;
            }
        }
    } catch (const fs::filesystem_error &e) {
        std::cerr << "DIR_ERROR|" << e.what() << std::endl;
    }
}

// --- Fonction principale ---
int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "USAGE|antivirus <file-or-directory>" << std::endl;
        return 1;
    }

    // Charger les signatures
    fs::path exePath = fs::absolute(argv[0]).parent_path();
    fs::path sigPath = exePath / "../data/signatures.txt";
    std::vector<std::string> signatures = loadSignatures(sigPath.string());
    if (signatures.empty()) {
        std::cerr << "ERROR|Impossible de charger signatures.txt" << std::endl;
        return 2;
    }

    fs::path target = argv[1];

    try {
        if (!fs::exists(target)) {
            std::cout << target.u8string() << "|FILE_NOT_FOUND" << std::endl;
            return 1;
        }
        if (fs::is_regular_file(target)) {
            reportFile(target, signatures);
        } else if (fs::is_directory(target)) {
            scanDirectoryRecursive(target, signatures);
        } else {
            std::cout << target.u8string() << "|UNSUPPORTED" << std::endl;
        }
    } catch (const std::exception &e) {
        std::cerr << "ERROR|" << e.what() << std::endl;
        return 2;
    }

    return 0;
}
