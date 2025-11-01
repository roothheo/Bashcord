/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, GuildStore, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    translateUserIds: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs d'utilisateurs en mentions @ cliquables",
        default: true
    },
    translateChannelIds: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs de canaux en références # cliquables",
        default: true
    },
    translateRoleIds: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs de rôles en mentions @& cliquables",
        default: true
    },
    translateMessageIds: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs de messages en liens cliquables",
        default: false
    },
    minIdLength: {
        type: OptionType.NUMBER,
        description: "Longueur minimale des IDs à convertir (Discord: 17-19 chiffres)",
        default: 17
    },
    maxIdLength: {
        type: OptionType.NUMBER,
        description: "Longueur maximale des IDs à convertir",
        default: 19
    }
});

// Regex pour détecter les IDs Discord (nombres de 17-19 chiffres généralement)
function createIdRegex(minLength: number, maxLength: number): RegExp {
    return new RegExp(`\\b\\d{${minLength},${maxLength}}\\b`, "g");
}

// Vérifier si un ID correspond à un utilisateur
function isUserId(id: string): boolean {
    try {
        const user = UserStore.getUser(id);
        return user !== undefined && user !== null;
    } catch {
        return false;
    }
}

// Vérifier si un ID correspond à un canal
function isChannelId(id: string): boolean {
    try {
        const channel = ChannelStore.getChannel(id);
        return channel !== undefined && channel !== null;
    } catch {
        return false;
    }
}

// Vérifier si un ID correspond à un rôle (via le canal actuel)
function isRoleId(id: string, channelId?: string): boolean {
    if (!channelId) return false;
    try {
        const channel = ChannelStore.getChannel(channelId);
        if (!channel?.guild_id) return false;
        
        const guild = GuildStore.getGuild(channel.guild_id);
        if (!guild) return false;
        
        // Vérifier si le rôle existe dans le serveur
        return guild.roles?.[id] !== undefined;
    } catch {
        return false;
    }
}

// Vérifier si un ID est déjà dans une mention Discord ou une URL
function isIdInContext(content: string, id: string, index: number): boolean {
    // Vérifier le contexte avant l'ID
    const beforeStart = Math.max(0, index - 5);
    const before = content.substring(beforeStart, index);
    
    // Vérifier le contexte après l'ID
    const afterEnd = Math.min(content.length, index + id.length + 5);
    const after = content.substring(index + id.length, afterEnd);
    
    // Ignorer si l'ID fait partie d'une mention Discord existante
    if (before.includes("<@") || before.includes("<#") || before.includes("<@&")) {
        return true;
    }
    
    // Ignorer si l'ID fait partie d'une URL
    if (before.match(/[:\/\.]/) || after.match(/[:\/\.]/)) {
        return true;
    }
    
    // Ignorer si l'ID est précédé ou suivi par @ ou #
    if (before.endsWith("@") || before.endsWith("#") || after.startsWith("@") || after.startsWith("#")) {
        return true;
    }
    
    return false;
}

// Fonction principale pour traduire les IDs en mentions cliquables
function translateIds(content: string, channelId?: string): string {
    if (!content) return content;

    const { translateUserIds, translateChannelIds, translateRoleIds, translateMessageIds, minIdLength, maxIdLength } = settings.store;
    
    if (!translateUserIds && !translateChannelIds && !translateRoleIds && !translateMessageIds) {
        return content;
    }

    const idRegex = createIdRegex(minIdLength, maxIdLength);
    let translatedContent = content;
    const processedIds = new Map<string, string>(); // ID -> replacement

    // Trouver tous les IDs et déterminer leurs remplacements
    let match;
    const idMatches: Array<{ id: string; index: number }> = [];
    
    while ((match = idRegex.exec(content)) !== null) {
        const id = match[0];
        const index = match.index;
        
        // Vérifier si l'ID est dans un contexte spécial
        if (isIdInContext(content, id, index)) {
            continue;
        }
        
        // éviter les doublons
        if (processedIds.has(id)) {
            continue;
        }
        
        // Déterminer le type d'ID et le remplacement approprié
        let replacement: string | null = null;
        
        if (translateUserIds && isUserId(id)) {
            replacement = `<@${id}>`;
        } else if (translateChannelIds && isChannelId(id)) {
            replacement = `<#${id}>`;
        } else if (translateRoleIds && channelId && isRoleId(id, channelId)) {
            replacement = `<@&${id}>`;
        } else if (translateMessageIds && channelId) {
            // Pour les messages, créer un lien Discord
            const channel = ChannelStore.getChannel(channelId);
            if (channel?.guild_id) {
                replacement = `https://discord.com/channels/${channel.guild_id}/${channelId}/${id}`;
            } else {
                // DM
                replacement = `https://discord.com/channels/@me/${channelId}/${id}`;
            }
        }
        
        if (replacement) {
            processedIds.set(id, replacement);
            idMatches.push({ id, index });
        }
    }
    
    // Remplacer les IDs de la fin vers le début pour préserver les indices
    idMatches.reverse().forEach(({ id, index }) => {
        const replacement = processedIds.get(id);
        if (replacement) {
            translatedContent = translatedContent.substring(0, index) + replacement + translatedContent.substring(index + id.length);
        }
    });

    return translatedContent;
}

// Fonction pour modifier les messages entrants
function modifyIncomingMessage(message: Message): string {
    if (!message.content) return message.content || "";

    // Ne pas modifier les messages qui contiennent déjà des mentions Discord
    // pour éviter les doublons (sauf si c'est juste un lien de message)
    if (message.content.includes("<@") || message.content.includes("<#")) {
        return message.content;
    }

    return translateIds(message.content, message.channel_id);
}

// Fonction pour modifier les messages avant envoi
function onBeforeMessageSend(channelId: string, msg: { content: string }) {
    if (!msg.content) return;

    // Ne pas modifier si le contenu contient déjà des mentions
    if (msg.content.includes("<@") || msg.content.includes("<#")) {
        return;
    }

    msg.content = translateIds(msg.content, channelId);
}

export default definePlugin({
    name: "ID Translater",
    description: "Traduit automatiquement les IDs Discord en mentions @ ou références # cliquables",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    isModified: true,

    settings,
    modifyIncomingMessage,
    onBeforeMessageSend,

    // Patch temporairement désactivé - fonctionne via onBeforeMessageSend
    patches: [],

    start() {
        console.log("[ID Translater] Plugin demarre - Conversion automatique des IDs activee");
    },

    stop() {
        console.log("[ID Translater] Plugin arrete");
    }
});
