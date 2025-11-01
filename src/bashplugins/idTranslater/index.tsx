/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { addMessagePreSendListener, MessageSendListener, removeMessagePreSendListener } from "@api/MessageEvents";
import definePlugin, { OptionType } from "@utils/types";
import { UserStore, ChannelStore, GuildStore, GuildRoleStore } from "@webpack/common";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer la traduction automatique des IDs",
        default: true
    },
    convertUsers: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs d'utilisateurs en @mentions",
        default: true
    },
    convertChannels: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs de canaux en #mentions",
        default: true
    },
    convertRoles: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs de r?les en mentions",
        default: true
    },
    requirePrefix: {
        type: OptionType.BOOLEAN,
        description: "N?cessiter un pr?fixe (id:) avant l'ID pour la conversion",
        default: false
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode d?bogage (afficher les logs)",
        default: false
    },
    highlightConversions: {
        type: OptionType.BOOLEAN,
        description: "Afficher un message de confirmation des conversions",
        default: false
    }
});

// Pattern pour d?tecter les IDs Discord (17-19 chiffres)
const DISCORD_ID_PATTERN = /\b(\d{17,19})\b/g;
const PREFIXED_ID_PATTERN = /\bid:(\d{17,19})\b/gi;

function debugLog(message: string) {
    if (settings.store.debugMode) {
        console.log(`[IdTranslater] ${message}`);
    }
}

/**
 * V?rifie si un ID correspond ? un utilisateur valide
 */
function isValidUserId(id: string): boolean {
    try {
        const user = UserStore.getUser(id);
        return user !== null && user !== undefined;
    } catch {
        return false;
    }
}

/**
 * V?rifie si un ID correspond ? un canal valide
 */
function isValidChannelId(id: string): boolean {
    try {
        const channel = ChannelStore.getChannel(id);
        return channel !== null && channel !== undefined;
    } catch {
        return false;
    }
}

/**
 * V?rifie si un ID correspond ? un r?le valide
 */
function isValidRoleId(id: string, guildId?: string): boolean {
    try {
        if (!guildId) return false;
        const role = GuildRoleStore.getRole(guildId, id);
        return role !== null && role !== undefined;
    } catch {
        return false;
    }
}

/**
 * Convertit un ID en mention cliquable appropri?e
 */
function convertIdToMention(id: string, guildId?: string): string {
    debugLog(`Tentative de conversion de l'ID: ${id}`);

    // V?rifier d'abord si c'est d?j? une mention
    if (id.includes('<@') || id.includes('<#') || id.includes('<@&')) {
        debugLog(`L'ID ${id} est d?j? une mention`);
        return id;
    }

    // V?rifier dans l'ordre: utilisateur, canal, r?le
    if (settings.store.convertUsers && isValidUserId(id)) {
        debugLog(`ID ${id} converti en mention utilisateur`);
        return `<@${id}>`;
    }

    if (settings.store.convertChannels && isValidChannelId(id)) {
        debugLog(`ID ${id} converti en mention canal`);
        return `<#${id}>`;
    }

    if (settings.store.convertRoles && guildId && isValidRoleId(id, guildId)) {
        debugLog(`ID ${id} converti en mention r?le`);
        return `<@&${id}>`;
    }

    debugLog(`ID ${id} non reconnu, conservation de l'ID original`);
    return id;
}

/**
 * Traite un message et convertit tous les IDs en mentions
 */
function processMessageContent(content: string, guildId?: string): { content: string; conversions: number } {
    let conversions = 0;
    let newContent = content;

    if (settings.store.requirePrefix) {
        // Mode avec pr?fixe: seulement convertir les IDs pr?c?d?s de "id:"
        newContent = content.replace(PREFIXED_ID_PATTERN, (match, id) => {
            const mention = convertIdToMention(id, guildId);
            if (mention !== id) {
                conversions++;
                return mention;
            }
            return match;
        });
    } else {
        // Mode sans pr?fixe: convertir tous les IDs trouv?s
        const matches = Array.from(content.matchAll(DISCORD_ID_PATTERN));
        const replacements = new Map<string, string>();

        for (const match of matches) {
            const id = match[1];
            // ?viter de traiter plusieurs fois le m?me ID
            if (!replacements.has(id)) {
                const mention = convertIdToMention(id, guildId);
                if (mention !== id) {
                    replacements.set(id, mention);
                    conversions++;
                }
            }
        }

        // Appliquer les remplacements
        replacements.forEach((mention, id) => {
            // Utiliser une regex pour remplacer uniquement les IDs isol?s (pas ceux d?j? dans des mentions)
            const idRegex = new RegExp(`(?<!<[@#]&?)\\b${id}\\b(?!>)`, 'g');
            newContent = newContent.replace(idRegex, mention);
        });
    }

    return { content: newContent, conversions };
}

// Listener pour les messages envoy?s
let messageSendListener: MessageSendListener | null = null;

export default definePlugin({
    name: "IdTranslater",
    description: "Traduit automatiquement les IDs Discord en mentions cliquables (@utilisateur, #canal, @r?le)",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    start() {
        console.log("[IdTranslater] Plugin d?marr?");

        // Ajouter le listener pour intercepter les messages avant l'envoi
        messageSendListener = addMessagePreSendListener((channelId, messageObj, options) => {
            if (!settings.store.enabled) {
                debugLog("Plugin d?sactiv?, pas de traitement");
                return;
            }

            const originalContent = messageObj.content;

            // Ne pas traiter les messages vides
            if (!originalContent || originalContent.trim().length === 0) {
                return;
            }

            // Obtenir l'ID du serveur pour la validation des r?les
            const channel = ChannelStore.getChannel(channelId);
            const guildId = channel?.guild_id;

            debugLog(`Traitement du message dans le canal ${channelId} (guild: ${guildId || 'DM'})`);
            debugLog(`Contenu original: "${originalContent}"`);

            // Traiter le contenu
            const { content: newContent, conversions } = processMessageContent(originalContent, guildId);

            // Si des conversions ont ?t? effectu?es, mettre ? jour le message
            if (conversions > 0 && newContent !== originalContent) {
                messageObj.content = newContent;
                debugLog(`? ${conversions} ID(s) converti(s)`);
                debugLog(`Nouveau contenu: "${newContent}"`);

                if (settings.store.highlightConversions) {
                    console.log(`[IdTranslater] ? ${conversions} ID(s) converti(s) en mentions cliquables`);
                }
            } else {
                debugLog("Aucune conversion effectu?e");
            }
        });

        debugLog("Listener de messages configur?");
    },

    stop() {
        console.log("[IdTranslater] Plugin arr?t?");

        // Retirer le listener
        if (messageSendListener) {
            removeMessagePreSendListener(messageSendListener);
            messageSendListener = null;
            debugLog("Listener de messages retir?");
        }
    }
});
