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
        // Pour les standalone, vérifier si le hash de la release correspond à celui déjà installé
        // Le hash du build ne change pas après une mise à jour, donc on utilise localStorage
        if (changes.length > 0) {
            const releaseHash = changes[0].hash;
            if (releaseHash && releaseHash.length >= 7) {
                const releaseHashShort = releaseHash.slice(0, 7);
                const lastInstalledHash = localStorage.getItem("bashcord-last-installed-hash");
                const lastCheckedHash = localStorage.getItem("bashcord-last-checked-hash");
                
                // Comparer avec le dernier hash installé (priorité) ou le dernier hash vérifié
                const hashToCompare = lastInstalledHash || lastCheckedHash || gitHash.slice(0, 7);
                
                if (releaseHashShort.toLowerCase() === hashToCompare.toLowerCase()) {
                    UpdateLogger.info(`Already on latest version (installed hash: ${hashToCompare}), no update needed`);
                    return (isOutdated = false);
                }
                
                // Si le hash de la release correspond au hash du build actuel et qu'on n'a pas de hash installé,
                // c'est probablement la première vérification et on est à jour
                if (!lastInstalledHash && releaseHashShort.toLowerCase() === gitHash.slice(0, 7).toLowerCase()) {
                    UpdateLogger.info(`Already on latest version (build hash match: ${gitHash.slice(0, 7)}), no update needed`);
                    localStorage.setItem("bashcord-last-checked-hash", releaseHashShort);
                    return (isOutdated = false);
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
