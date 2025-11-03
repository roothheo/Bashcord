/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { ipcMain } from "electron";
import { writeFileSync as originalWriteFileSync } from "original-fs";

import { Logger } from "@utils/Logger";

const UpdateLogger = new Logger("Updater", "white");

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

import { ASAR_FILE, serializeErrors } from "./common";

// Utiliser le repo Bashcord pour les mises à jour standalone
// Cela garantit que les utilisateurs de l'installer obtiennent les mises à jour Bashcord
const BASHCORD_REPO = "roothheo/Bashcord";
const API_BASE = `https://api.github.com/repos/${BASHCORD_REPO}`;
let PendingUpdate: string | null = null;

// Cache pour éviter trop de requêtes (validité: 5 minutes)
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const apiCache = new Map<string, CacheEntry<any>>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 seconde de base

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function githubGet<T = any>(endpoint: string, useCache = true): Promise<T> {
    const cacheKey = endpoint;
    
    // Vérifier le cache
    if (useCache) {
        const cached = apiCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            UpdateLogger.debug(`Cache hit for ${endpoint}`);
            return cached.data;
        }
    }

    let lastError: any;
    
    // Retry logic avec exponential backoff
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await fetchJson<T>(API_BASE + endpoint, {
                headers: {
                    Accept: "application/vnd.github+json",
                    "User-Agent": VENCORD_USER_AGENT
                },
                // Timeout implicite via fetch (les navigateurs ont un timeout par défaut)
            });

            // Gérer le rate limiting GitHub
            // Note: fetchJson ne retourne pas les headers, on devrait vérifier res.headers
            // Mais pour l'instant, on catch les erreurs 429
            
            // Mettre en cache si succès
            if (useCache) {
                apiCache.set(cacheKey, {
                    data: response,
                    timestamp: Date.now()
                });
            }

            return response;
        } catch (err: any) {
            lastError = err;
            
            // Si c'est un rate limit (429), attendre plus longtemps
            if (err.message?.includes("429") || err.message?.includes("rate limit")) {
                const retryAfter = attempt === MAX_RETRIES - 1 ? 60 * 1000 : RETRY_DELAY_BASE * Math.pow(2, attempt + 2);
                UpdateLogger.warn(`Rate limited, waiting ${retryAfter / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}`);
                await sleep(retryAfter);
                continue;
            }
            
            // Pour les autres erreurs, retry avec exponential backoff
            if (attempt < MAX_RETRIES - 1) {
                const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
                UpdateLogger.warn(`Request failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms:`, err.message);
                await sleep(delay);
            }
        }
    }

    // Toutes les tentatives ont échoué
    UpdateLogger.error(`Failed to fetch ${endpoint} after ${MAX_RETRIES} attempts`, lastError);
    throw lastError;
}

async function calculateGitChanges() {
    const isOutdated = await fetchUpdates();
    if (!isOutdated) return [];

    // Pour les utilisateurs standalone, on retourne les infos de la release
    // Le timestamp sera utilisé pour la comparaison côté renderer
    try {
        const release = await githubGet<any>("/releases/latest", false); // Pas de cache pour latest
        
        // Validation des données de release
        if (!release || typeof release !== "object") {
            UpdateLogger.warn("Invalid release data received");
            return [];
        }

        if (!release.published_at && !release.tag_name) {
            UpdateLogger.warn("Release missing both published_at and tag_name");
            return [];
        }

        return [{
            hash: release.published_at || release.tag_name || "latest",
            author: "Bashcord",
            message: release.name || `New Bashcord update available (${release.tag_name || "latest"})`
        }];
    } catch (err: any) {
        UpdateLogger.error("Failed to fetch release info", err);
        // Ne pas retourner de fake update si la requête échoue
        // Cela évite de fausses détections de mise à jour
        return [];
    }
}

async function fetchUpdates() {
    try {
        const data = await githubGet<any>("/releases/latest", false); // Pas de cache pour latest release
        
        // Validation stricte des données
        if (!data || typeof data !== "object") {
            UpdateLogger.error("Invalid release data structure");
            return false;
        }

        // Chercher le fichier ASAR dans les assets
        if (!Array.isArray(data.assets)) {
            UpdateLogger.warn("Release assets is not an array");
            return false;
        }

        const asset = data.assets.find((a: any) => a?.name === ASAR_FILE);
        if (!asset) {
            UpdateLogger.warn(`No ${ASAR_FILE} asset found in latest release. Available assets: ${data.assets.map((a: any) => a?.name).join(", ") || "none"}`);
            return false;
        }

        // Valider l'URL de téléchargement
        if (!asset.browser_download_url || typeof asset.browser_download_url !== "string") {
            UpdateLogger.error("Asset missing browser_download_url");
            return false;
        }

        // Utiliser les timestamps pour comparer les versions (plus simple et fiable)
        // La release GitHub a un champ published_at qui indique quand elle a été publiée
        const releasePublishedAt = data.published_at;
        if (!releasePublishedAt) {
            UpdateLogger.warn("Release has no published_at timestamp, skipping update to prevent loop");
            return false;
        }

        // Valider que le timestamp est une date ISO valide
        const timestamp = new Date(releasePublishedAt).getTime();
        if (isNaN(timestamp)) {
            UpdateLogger.error(`Invalid published_at timestamp: ${releasePublishedAt}`);
            return false;
        }

        // Vérifier la taille du fichier si disponible (pour détecter les fichiers corrompus)
        if (asset.size !== undefined && asset.size <= 0) {
            UpdateLogger.warn(`Asset has invalid size: ${asset.size} bytes`);
            return false;
        }

        // Le timestamp sera comparé côté renderer avec localStorage
        // Ici, on retourne simplement si une release avec ASAR est disponible
        UpdateLogger.info(`Release found: ${data.name || data.tag_name} (${data.tag_name || "latest"}) published at ${releasePublishedAt}, asset size: ${asset.size ? `${(asset.size / 1024 / 1024).toFixed(2)} MB` : "unknown"}`);
        
        PendingUpdate = asset.browser_download_url;
        return true;
    } catch (err: any) {
        UpdateLogger.error("Failed to fetch updates", err);
        return false;
    }
}

async function applyUpdates() {
    if (!PendingUpdate) {
        UpdateLogger.warn("applyUpdates called but no pending update");
        return true;
    }

    try {
        UpdateLogger.info(`Downloading update from ${PendingUpdate}...`);
        
        // Télécharger avec retry
        let data: Buffer | null = null;
        let lastError: any;
        
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                data = await fetchBuffer(PendingUpdate!);
                
                // Vérifier que le fichier a une taille raisonnable (> 1 KB pour un ASAR)
                if (data.length < 1024) {
                    throw new Error(`Downloaded file is too small: ${data.length} bytes (expected at least 1 KB)`);
                }

                // Vérifier que c'est bien un fichier ASAR (commence par "asar" magic bytes ou structure valide)
                // Les fichiers ASAR commencent typiquement avec une structure spécifique
                // On vérifie au moins que ce n'est pas un fichier texte d'erreur HTML
                if (data.length > 100 && data.toString("utf-8", 0, 100).includes("<html")) {
                    throw new Error("Downloaded file appears to be HTML (likely an error page)");
                }

                break; // Succès, sortir de la boucle
            } catch (err: any) {
                lastError = err;
                if (attempt < MAX_RETRIES - 1) {
                    const delay = RETRY_DELAY_BASE * Math.pow(2, attempt + 1); // Plus long délai pour downloads
                    UpdateLogger.warn(`Download failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay / 1000}s:`, err.message);
                    await sleep(delay);
                }
            }
        }

        if (!data) {
            throw lastError || new Error("Failed to download update after all retries");
        }

        UpdateLogger.info(`Update downloaded successfully (${(data.length / 1024 / 1024).toFixed(2)} MB), applying...`);
        
        // Créer une backup avant d'écraser
        const backupPath = `${__dirname}.backup`;
        try {
            const { readFileSync, existsSync, writeFileSync } = require("original-fs");
            if (existsSync(__dirname)) {
                const existing = readFileSync(__dirname);
                writeFileSync(backupPath, existing);
                UpdateLogger.debug(`Backup created at ${backupPath}`);
            }
        } catch (backupErr) {
            UpdateLogger.warn("Failed to create backup, continuing anyway", backupErr);
        }

        originalWriteFileSync(__dirname, data);
        UpdateLogger.info("Update applied successfully");

        PendingUpdate = null;

        return true;
    } catch (err: any) {
        UpdateLogger.error("Failed to apply updates", err);
        PendingUpdate = null;
        throw err;
    }
}

// Handler pour récupérer les commits GitHub (pour éviter CORS depuis le navigateur)
async function fetchGitHubCommits(repoSlug: string, fromHash: string, toHash: string) {
    try {
        const url = `https://api.github.com/repos/${repoSlug}/compare/${fromHash}...${toHash}`;
        const data = await fetchJson<any>(url, {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": VENCORD_USER_AGENT
            }
        });

        if (!data || !Array.isArray(data.commits)) return [];

        // Filtrer pour ne garder que les commits de actions-user (releases automatiques)
        const filteredCommits = data.commits.filter((commit: any) => {
            const authorName =
                commit?.commit?.author?.name ||
                commit?.author?.login ||
                "";
            // Accepter github-actions, github-actions[bot], ou actions-user
            return authorName?.includes("actions") || 
                   authorName?.toLowerCase() === "actions-user" || 
                   authorName?.toLowerCase().includes("github-actions");
        });

        return filteredCommits.map((commit: any) => {
            const message: string = commit?.commit?.message ?? "";
            const summary = message.split("\n")[0] || "No message";
            const authorName =
                commit?.commit?.author?.name ||
                commit?.author?.login ||
                "Unknown";
            
            let timestamp: number | undefined;
            if (commit?.commit?.author?.date) {
                const parsed = Date.parse(commit.commit.author.date);
                timestamp = Number.isNaN(parsed) ? undefined : parsed;
            }

            // Validation du hash
            const hash = commit?.sha || "";
            if (!hash || hash.length < 7) {
                UpdateLogger.warn(`Invalid commit hash: ${hash}`);
            }

            return {
                hash,
                author: authorName,
                message: summary,
                timestamp,
            };
        });
    } catch (err) {
        UpdateLogger.error("Failed to fetch GitHub commits", err);
        throw err;
    }
}

// Retourner toujours le repo Bashcord pour les utilisateurs standalone
ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => `https://github.com/${BASHCORD_REPO}`));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(calculateGitChanges));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(applyUpdates));
ipcMain.handle(IpcEvents.FETCH_GITHUB_COMMITS, serializeErrors((repoSlug: string, fromHash: string, toHash: string) => fetchGitHubCommits(repoSlug, fromHash, toHash)));
