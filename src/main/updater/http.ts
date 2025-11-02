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

    // Chercher le fichier ASAR dans les assets
    const asset = data.assets.find(a => a.name === ASAR_FILE);
    if (!asset) {
        UpdateLogger.warn(`No ${ASAR_FILE} asset found in latest release`);
        return false;
    }

    // Vérifier si une mise à jour est disponible
    // Pour les standalone, on compare le hash Git actuel avec celui de la release
    // Le nom ou le tag de la release peut contenir un hash Git
    const releaseName = data.name || "";
    const releaseTag = data.tag_name || "";
    
    // Extraire le hash du nom ou du tag (peut être en fin de chaîne après un espace ou dans le tag)
    // Format attendu : "Release Name abc1234" ou tag "abc1234" ou "v1.0.0-abc1234"
    let releaseHash = "";
    
    // D'abord essayer d'extraire du nom (dernier mot après un espace)
    const nameParts = releaseName.trim().split(/\s+/);
    if (nameParts.length > 0) {
        const lastPart = nameParts[nameParts.length - 1];
        // Si le dernier mot fait au moins 7 caractères et contient seulement des caractères hexadécimaux, c'est probablement un hash
        if (lastPart.length >= 7 && /^[0-9a-f]+$/i.test(lastPart)) {
            releaseHash = lastPart;
        }
    }
    
    // Si pas trouvé dans le nom, essayer le tag
    if (!releaseHash && releaseTag) {
        // Le tag peut être juste le hash, ou au format "v1.0.0-abc1234"
        const tagParts = releaseTag.split("-");
        const lastTagPart = tagParts[tagParts.length - 1];
        if (lastTagPart.length >= 7 && /^[0-9a-f]+$/i.test(lastTagPart)) {
            releaseHash = lastTagPart;
        } else if (releaseTag.length >= 7 && /^[0-9a-f]+$/i.test(releaseTag)) {
            releaseHash = releaseTag;
        }
    }
    
    // Pour les standalone, le hash Git compilé dans l'ASAR ne change pas après une mise à jour.
    // On ne peut donc pas comparer directement le hash du build avec celui de la release.
    // La comparaison sera faite côté renderer avec localStorage.
    // Ici, on retourne simplement si une release avec ASAR est disponible.
    
    // Si on a trouvé un hash valide dans la release, on le retourne pour comparaison côté renderer
    if (releaseHash && releaseHash.length >= 7) {
        const releaseHashShort = releaseHash.slice(0, 7);
        const currentHashShort = gitHash.slice(0, 7);
        
        // Comparer quand même avec le hash du build (au cas où c'est la première fois)
        // Mais ce ne sera pas fiable après la première mise à jour
        if (releaseHashShort.toLowerCase() === currentHashShort.toLowerCase()) {
            UpdateLogger.info(`Already on latest version (initial hash match: ${currentHashShort}), no update needed`);
            return false;
        }
        
        UpdateLogger.info(`Release hash found: ${releaseHashShort}, current build hash: ${currentHashShort}`);
    } else {
        // Si on ne peut pas déterminer le hash de la release, on ne déclenche PAS de mise à jour pour éviter les boucles
        UpdateLogger.warn(`Could not extract hash from release (name: "${releaseName}", tag: "${releaseTag}"), skipping update to prevent loop`);
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
