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

import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain } from "electron";

import gitRemote from "~git-remote";

import { serializeErrors } from "./common";

// Handler pour récupérer les commits GitHub (fonctionne même si updater est désactivé)
async function fetchGitHubCommitsFallback(repoSlug: string, fromHash: string, toHash: string) {
    try {
        const { fetchJson } = require("@main/utils/http");
        const { VENCORD_USER_AGENT } = require("@shared/vencordUserAgent");
        const url = `https://api.github.com/repos/${repoSlug}/compare/${fromHash}...${toHash}`;
        const data = await fetchJson(url, {
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
        throw err;
    }
}

if (!IS_UPDATER_DISABLED) {
    require(IS_STANDALONE ? "./http" : "./git");
} else {
    ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => `https://github.com/${gitRemote}`));
    ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(() => []));
}

// Toujours enregistrer le handler pour fetchGitHubCommits même si updater est désactivé
ipcMain.handle(IpcEvents.FETCH_GITHUB_COMMITS, serializeErrors((repoSlug: string, fromHash: string, toHash: string) => fetchGitHubCommitsFallback(repoSlug, fromHash, toHash)));
