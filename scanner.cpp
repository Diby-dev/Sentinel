#include <iostream>// Pour les entrées/sorties
#include <fstream>// Pour la gestion des fichiers
#include <string>// Pour les chaînes de caractères
#include <unordered_set>// Pour les ensembles non ordonnés
#include <vector>// Pour les vecteurs
#include <filesystem>// Pour la manipulation des chemins de fichiers
#include <openssl/sha.h>// Pour le calcul SHA-256
#include <algorithm>// Pour les algorithmes standards
#include <cctype>// Pour la manipulation de caractères
#include <system_error>// Pour la gestion des erreurs système
#include <atomic>// Pour les variables atomiques
#include <thread>// Pour la gestion des threads
#include <chrono>// Pour les durées et les pauses
#include <windows.h> // ✅ pour détecter les lecteurs Windows

namespace fs = std::filesystem;
std::atomic<bool> g_pause_scan(false);

// Trim et lowercase helpers
std::string trim(const std::string &s) {
    size_t b = s.find_first_not_of(" \r\n\t");
    if (b == std::string::npos) return "";
    size_t e = s.find_last_not_of(" \r\n\t");
    return s.substr(b, e - b + 1);
}

std::string to_lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c){ return std::tolower(c); });
    return s;
}

// Charger les signatures depuis un fichier
bool load_signatures(const std::string &path, std::unordered_set<std::string> &out) {
    std::ifstream ifs(path);
    if (!ifs.is_open()) return false;
    std::string line;
    while (std::getline(ifs, line)) {
        line = trim(line);
        if (line.empty()) continue;
        out.insert(to_lower(line));
    }
    return true;
}

// Calculer le SHA256 d’un fichier
std::string sha256_file(const fs::path &p) {
    std::ifstream ifs(p, std::ios::binary);
    if (!ifs.is_open()) return "";

    SHA256_CTX ctx;
    SHA256_Init(&ctx);

    const size_t BUF = 32768;
    std::vector<char> buffer(BUF);
    while (ifs) {
        while (g_pause_scan) std::this_thread::sleep_for(std::chrono::milliseconds(100));
        ifs.read(buffer.data(), BUF);
        std::streamsize r = ifs.gcount();
        if (r > 0) SHA256_Update(&ctx, reinterpret_cast<unsigned char*>(buffer.data()), r);
    }

    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_Final(hash, &ctx);

    char out[65];
    for (int i = 0; i < SHA256_DIGEST_LENGTH; ++i) sprintf(out + i*2, "%02x", hash[i]);
    out[64] = '\0';
    return std::string(out);
}

// Ignorer certains fichiers système
bool is_ignored_name(const fs::path &p) {
    if (p.filename().empty()) return false;
    static const std::vector<std::string> ignore = {
        "system volume information",
        "$recycle.bin",
        "thumbs.db",
        "pagefile.sys",
        "hiberfil.sys"
    };
    std::string name = to_lower(p.filename().string());
    for (const auto &n : ignore)
        if (name == n || name.find(n) != std::string::npos)
            return true;
    return false;
}

// Traverser les dossiers de manière sécurisée
template<typename F>
void traverse_safe(const fs::path &root, F on_file) {
    std::vector<fs::path> stack;
    std::error_code ec;
    if (!fs::exists(root, ec)) return;
    stack.push_back(root);

    while (!stack.empty()) {
        if (g_pause_scan) std::this_thread::sleep_for(std::chrono::milliseconds(100));
        fs::path dir = stack.back(); stack.pop_back();
        if (is_ignored_name(dir)) continue;

        std::error_code dir_ec;
        fs::directory_iterator it(dir, fs::directory_options::skip_permission_denied, dir_ec);
        if (dir_ec) continue;

        for (auto &entry : it) {
            if (g_pause_scan) std::this_thread::sleep_for(std::chrono::milliseconds(100));
            std::error_code ent_ec;
            fs::file_status st = entry.symlink_status(ent_ec);
            if (ent_ec) continue;

            fs::path p = entry.path();
            if (is_ignored_name(p)) continue;

            if (fs::is_directory(st) && !fs::is_symlink(st)) {
                stack.push_back(p);
            } else if (fs::is_regular_file(st)) {
                on_file(p);
            }
        }
    }
}

// Lister les lecteurs disponibles
std::vector<std::string> list_drives() {
    std::vector<std::string> drives;
    DWORD mask = GetLogicalDrives();
    if (mask == 0) return drives;

    for (char letter = 'A'; letter <= 'Z'; ++letter) {
        if (mask & 1) {
            std::string drive = std::string(1, letter) + ":\\";
            UINT type = GetDriveTypeA(drive.c_str());
            if (type == DRIVE_FIXED || type == DRIVE_REMOVABLE) {
                drives.push_back(drive);
            }
        }
        mask >>= 1;
    }
    return drives;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: scanner <signatures.txt>\n";
        return 1;
    }

    std::string sigfile = argv[1];
    std::unordered_set<std::string> sigs;
    if (!load_signatures(sigfile, sigs)) {
        std::cerr << "Impossible d'ouvrir le fichier de signatures: " << sigfile << "\n";
        return 2;
    }

    auto drives = list_drives();
    if (drives.empty()) {
        std::cerr << "Aucun lecteur trouvé.\n";
        return 3;
    }

    std::cout << "Lecteurs détectés : ";
    for (auto &d : drives) std::cout << d << " ";
    std::cout << "\nDémarrage du scan...\n";

    for (auto &drive : drives) {
        std::cout << "\n--- SCAN DU LECTEUR " << drive << " ---\n";
        traverse_safe(drive, [&](const fs::path &file) {
            std::string hash = sha256_file(file);
            if (hash.empty()) {
                std::cout << file.u8string() << " | ERROR" << std::endl;
                std::cout.flush();
                return;
            }

            hash = to_lower(hash);
            bool infected = (sigs.find(hash) != sigs.end());
            if (infected)
                // ✅ Signaler le fichier infecté avec un tag spécial "QUARANTINE"
                std::cout << file.u8string() << " | INFECTED | QUARANTINE" << std::endl;
            else
                std::cout << file.u8string() << " | CLEAN" << std::endl;

            std::cout.flush();
        });
    }

    return 0;
}
