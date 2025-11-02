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
                    const lastInstalledTimestamp = localStorage.getItem("bashcord-last-installed-timestamp");
                    
                    if (lastInstalledTimestamp) {
                        const lastInstalledTime = parseInt(lastInstalledTimestamp, 10);
                        if (!isNaN(lastInstalledTime) && releaseTime <= lastInstalledTime) {
                            UpdateLogger.info(`Already on latest version (installed: ${new Date(lastInstalledTime).toISOString()}, release: ${new Date(releaseTime).toISOString()}), no update needed`);
                            return (isOutdated = false);
                        }
                    } else {
                        // Première vérification : on est probablement à jour si le timestamp est très récent
                        // (moins d'1 heure = probablement la même release qu'on vient d'installer)
                        const now = Date.now();
                        const timeDiff = Math.abs(now - releaseTime);
                        if (timeDiff < 60 * 60 * 1000) { // 1 heure
                            UpdateLogger.info(`First check: release timestamp is recent (${Math.round(timeDiff / 1000 / 60)} minutes old), assuming up-to-date`);
                            localStorage.setItem("bashcord-last-installed-timestamp", releaseTime.toString());
                            return (isOutdated = false);
                        }
                    }
                }
            }
        }
    }

    return (isOutdated = changes.length > 0);
}

export async function update() {
    if (!isOutdated) return true;

    const res = await Unwrap(VencordNative.updater.update());

    if (res) {
        isOutdated = false;
        if (!await Unwrap(VencordNative.updater.rebuild()))
            throw new Error("The Build failed. Please try manually building the new update");
    }

    return res;
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
