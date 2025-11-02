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

async function githubGet<T = any>(endpoint: string) {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            // "All API requests MUST include a valid User-Agent header.
            // Requests with no User-Agent header will be rejected."
            "User-Agent": VENCORD_USER_AGENT
        }
    });
}

async function calculateGitChanges() {
    const isOutdated = await fetchUpdates();
    if (!isOutdated) return [];

    // Pour les utilisateurs standalone, on ne peut pas comparer avec git
    // On retourne simplement une liste avec un message générique indiquant qu'une mise à jour est disponible
    try {
        const release = await githubGet("/releases/latest");
        return [{
            hash: release.tag_name || "latest",
            author: "Bashcord",
            message: release.name || "New Bashcord update available"
        }];
    } catch (err) {
        // Fallback si la récupération de la release échoue
        return [{
            hash: "unknown",
            author: "Bashcord",
            message: "Update available"
        }];
    }
}

async function fetchUpdates() {
    const data = await githubGet("/releases/latest");

    // Vérifier si une mise à jour est disponible
    // Le nom de la release peut contenir un hash ou une version
    const releaseName = data.name || "";
    const releaseHash = releaseName.slice(releaseName.lastIndexOf(" ") + 1);
    
    // Si le hash est présent dans le nom et correspond au hash actuel, pas de mise à jour
    if (releaseHash && releaseHash.length >= 7 && releaseHash === gitHash) {
        return false;
    }

    // Chercher le fichier ASAR dans les assets
    const asset = data.assets.find(a => a.name === ASAR_FILE);
    if (!asset) {
        UpdateLogger.warn(`No ${ASAR_FILE} asset found in latest release`);
        return false;
    }

    PendingUpdate = asset.browser_download_url;
    return true;
}

async function applyUpdates() {
    if (!PendingUpdate) return true;

    const data = await fetchBuffer(PendingUpdate);
    originalWriteFileSync(__dirname, data);

    PendingUpdate = null;

    return true;
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

        return data.commits.map((commit: any) => {
            const message: string = commit?.commit?.message ?? "";
            const summary = message.split("\n")[0] || "No message";
            const authorName =
                commit?.commit?.author?.name ||
                commit?.author?.login ||
                "Unknown";
            const timestamp = commit?.commit?.author?.date
                ? Date.parse(commit.commit.author.date)
                : undefined;

            return {
                hash: commit?.sha || "",
                author: authorName,
                message: summary,
                timestamp: Number.isNaN(timestamp) ? undefined : timestamp,
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
