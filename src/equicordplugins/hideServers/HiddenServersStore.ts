/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Guild } from "@vencord/discord-types";
import { findStoreLazy, proxyLazyWebpack } from "@webpack";
import { Flux, FluxDispatcher, GuildStore } from "@webpack/common";


export const HiddenServersStore = proxyLazyWebpack(() => {
    const { Store } = Flux;

    const SortedGuildStore = findStoreLazy("SortedGuildStore");
    const DB_KEY = "HideServers_servers";
    class HiddenServersStore extends Store {
        public _hiddenGuilds: Set<string> = new Set();

        public get hiddenGuilds() { return this._hiddenGuilds; }

        public async load() {
            const data = await DataStore.get(DB_KEY);
            if (data && data instanceof Set) {
                this._hiddenGuilds = data;
            }
        }

        public unload() {
            this._hiddenGuilds.clear();
        }

        public save() {
            DataStore.set(DB_KEY, this._hiddenGuilds);
        }

        public addHiddenGuild(id: string) {
            this._hiddenGuilds.add(id);
            this.save();
            this.emitChange();
        }

        public removeHiddenGuild(id: string) {
            this._hiddenGuilds.delete(id);
            this.save();
            this.emitChange();
        }

        public addHiddenFolder(id: string, guildIds: string[]) {
            this._hiddenGuilds.add(`folder-${id}`);
            guildIds.forEach(gid => this._hiddenGuilds.add(gid));
            this.save();
            this.emitChange();
        }

        public removeHiddenFolder(id: string, guildIds: string[]) {
            this._hiddenGuilds.delete(`folder-${id}`);
            guildIds.forEach(gid => this._hiddenGuilds.delete(gid));
            this.save();
            this.emitChange();
        }

        public clearHidden() {
            this._hiddenGuilds.clear();
            DataStore.del(DB_KEY);
            this.emitChange();
        }

        public hiddenGuildsDetail(): Guild[] {
            const sortedGuildIds = SortedGuildStore.getFlattenedGuildIds() as string[];
            // otherwise the list is in order of increasing id number which is confusing
            return sortedGuildIds.filter(id => this._hiddenGuilds.has(id)).map(id => GuildStore.getGuild(id));
        }
    }

    return new HiddenServersStore(FluxDispatcher);
});
