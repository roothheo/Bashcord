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

import gitHash from "~git-hash";

import { Logger } from "./Logger";
import { localStorage } from "./localStorage";
import { relaunch } from "./native";
import { IpcRes } from "./types";

export const UpdateLogger = /* #__PURE__*/ new Logger("Updater", "white");
export let isOutdated = false;
export let isNewer = false;
export let updateError: any;
export let changes: Record<"hash" | "author" | "message", string>[];


export function shortGitHash(length = 7) {
    return gitHash.slice(0, length);
}

async function Unwrap<T>(p: Promise<IpcRes<T>>) {
    const res = await p;

    if (res.ok) return res.value;

    updateError = res.error;
    throw res.error;
}

export async function checkForUpdates() {
    changes = await Unwrap(VencordNative.updater.getUpdates());

    // we only want to check this for the git updater, not the http updater
    if (!IS_STANDALONE) {
        if (changes.some(c => c.hash === gitHash)) {
            isNewer = true;
            return (isOutdated = false);
        }
    } else {
        // Pour les standalone, utiliser les timestamps pour comparer les versions
        // Plus simple et fiable que les hashes Git
        if (changes.length > 0) {
            const releaseTimestamp = changes[0].hash; // Le hash contient maintenant le timestamp published_at
            if (releaseTimestamp) {
                // Parser le timestamp ISO ou utiliser directement si c'est un timestamp
                let releaseTime: number;
                try {
                    // Essayer de parser comme ISO date string
                    releaseTime = new Date(releaseTimestamp).getTime();
                    if (isNaN(releaseTime)) {
                        // Si ce n'est pas une date valide, essayer comme timestamp numérique
                        releaseTime = parseInt(releaseTimestamp, 10);
                    }
                } catch {
                    releaseTime = parseInt(releaseTimestamp, 10);
                }
                
                if (!isNaN(releaseTime) && releaseTime > 0) {
                    // Validation : vérifier que le timestamp n'est pas dans le futur (plus de 1 jour)
                    const now = Date.now();
                    const futureDiff = releaseTime - now;
                    if (futureDiff > 24 * 60 * 60 * 1000) {
                        UpdateLogger.warn(`Release timestamp is in the future (${Math.round(futureDiff / 1000 / 60 / 60)} hours ahead), ignoring`);
                        return (isOutdated = false);
                    }

                    const lastInstalledTimestamp = localStorage.getItem("bashcord-last-installed-timestamp");
                    
                    if (lastInstalledTimestamp) {
                        const lastInstalledTime = parseInt(lastInstalledTimestamp, 10);
                        
                        if (isNaN(lastInstalledTime) || lastInstalledTime <= 0) {
                            UpdateLogger.warn("Invalid lastInstalledTimestamp in localStorage, resetting");
                            localStorage.removeItem("bashcord-last-installed-timestamp");
                            // Continuer comme si c'était la première vérification
                        } else {
                            // Utiliser une comparaison avec une tolérance de 1 seconde pour éviter les problèmes d'égalité exacte
                            const timeDiff = releaseTime - lastInstalledTime;
                            
                            // Si la release est identique ou plus ancienne (dans la tolérance de 1 seconde), on est à jour
                            if (timeDiff <= 1000) {
                                UpdateLogger.info(`Already on latest version (installed: ${new Date(lastInstalledTime).toISOString()}, release: ${new Date(releaseTime).toISOString()}, diff: ${Math.round(timeDiff / 1000)}s), no update needed`);
                                return (isOutdated = false);
                            }
                            
                            // Si la release est plus récente de plus d'1 seconde, c'est une nouvelle mise à jour
                            if (timeDiff > 1000) {
                                UpdateLogger.info(`New release detected: ${new Date(releaseTime).toISOString()} (current: ${new Date(lastInstalledTime).toISOString()}, diff: ${Math.round(timeDiff / 1000 / 60)} minutes)`);
                                // Pas de return ici, on veut continuer pour déclarer qu'on est outdated
                            }
                        }
                    }
                    
                    // Première vérification ou timestamp invalide dans localStorage
                    if (!lastInstalledTimestamp || isNaN(parseInt(lastInstalledTimestamp, 10))) {
                        // Si le timestamp de la release est très récent (moins d'1 heure), on assume qu'on vient de l'installer
                        const timeDiff = Math.abs(now - releaseTime);
                        if (timeDiff < 60 * 60 * 1000) { // 1 heure
                            UpdateLogger.info(`First check: release timestamp is recent (${Math.round(timeDiff / 1000 / 60)} minutes old), assuming up-to-date`);
                            localStorage.setItem("bashcord-last-installed-timestamp", releaseTime.toString());
                            return (isOutdated = false);
                        }
                        // Sinon, c'est probablement une nouvelle release
                        UpdateLogger.info(`First check: release timestamp is old (${Math.round(timeDiff / 1000 / 60 / 60)} hours old), this appears to be a new release`);
                    }
                } else {
                    UpdateLogger.warn(`Invalid release timestamp: ${releaseTimestamp}, cannot compare versions`);
                }
            }
        }
    }

    return (isOutdated = changes.length > 0);
}

export async function update() {
    if (!isOutdated) {
        UpdateLogger.debug("update() called but not outdated, skipping");
        return true;
    }

    try {
        UpdateLogger.info("Starting update process...");
        const res = await Unwrap(VencordNative.updater.update());

        if (res) {
            UpdateLogger.info("Update downloaded, starting rebuild...");
            isOutdated = false;
            
            const rebuildSuccess = await Unwrap(VencordNative.updater.rebuild());
            if (!rebuildSuccess) {
                UpdateLogger.error("Build failed after update");
                throw new Error("The Build failed. Please try manually building the new update");
            }
            
            UpdateLogger.info("Update and rebuild completed successfully");
        } else {
            UpdateLogger.warn("Update returned false (no update needed or failed)");
        }

        return res;
    } catch (err: any) {
        UpdateLogger.error("Update process failed", err);
        // Réinitialiser isOutdated en cas d'erreur pour permettre une nouvelle tentative
        isOutdated = true;
        throw err;
    }
}

export const getRepo = () => Unwrap(VencordNative.updater.getRepo());

export async function maybePromptToUpdate(confirmMessage: string, checkForDev = false) {
    if (IS_WEB || IS_UPDATER_DISABLED) return;
    if (checkForDev && IS_DEV) return;

    try {
        const isOutdated = await checkForUpdates();
        if (isOutdated) {
            const wantsUpdate = confirm(confirmMessage);
            if (wantsUpdate && isNewer) return alert("Your local copy has more recent commits. Please stash or reset them.");
            if (wantsUpdate) {
                await update();
                relaunch();
            }
        }
    } catch (err) {
        UpdateLogger.error(err);
        alert("That also failed :( Try updating or re-installing with the installer!");
    }
}
