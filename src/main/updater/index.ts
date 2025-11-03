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

import { fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { ipcMain } from "electron";

import gitRemote from "~git-remote";

import { serializeErrors } from "./common";

// Handler pour récupérer les commits GitHub (fonctionne même si updater est désactivé)
async function fetchGitHubCommitsFallback(repoSlug: string, fromHash: string, toHash: string) {
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
    // git.ts et http.ts enregistrent déjà FETCH_GITHUB_COMMITS
} else {
    ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => `https://github.com/${gitRemote}`));
    ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(() => []));
    // Enregistrer le handler pour fetchGitHubCommits seulement si updater est désactivé
    ipcMain.handle(IpcEvents.FETCH_GITHUB_COMMITS, serializeErrors((repoSlug: string, fromHash: string, toHash: string) => fetchGitHubCommitsFallback(repoSlug, fromHash, toHash)));
}
