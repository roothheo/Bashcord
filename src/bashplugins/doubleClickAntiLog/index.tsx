/*
 * Bashcord, a Discord client mod
 * Copyright (c) 2025 Bashcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { RestAPI, UserStore, Constants } from "@webpack/common";
import { findByPropsLazy } from "@webpack";

const MessageActions = findByPropsLazy("deleteMessage", "startEditMessage");

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer la suppression AntiLog par double-clic",
        default: true
    },
    blockMessage: {
        type: OptionType.STRING,
        description: "Texte à afficher à la place du message supprimé (pour AntiLog)",
        default: "x"
    },
    deleteInterval: {
        type: OptionType.NUMBER,
        description: "Délai entre la suppression de l'ancien et du nouveau message (ms) - pour AntiLog",
        default: 200,
        min: 100,
        max: 5000
    },
    requireModifier: {
        type: OptionType.BOOLEAN,
        description: "Nécessiter Shift ou Ctrl lors du double-clic",
        default: false
    },
    showNotification: {
        type: OptionType.BOOLEAN,
        description: "Afficher une notification lors de la suppression",
        default: false
    }
});

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function messageSendWrapper(content: string, nonce: string, channelId: string) {
    const wrapperResponse = await RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body: {
            content: content,
            flags: 0,
            mobile_network_type: "unknown",
            nonce: nonce,
            tts: false,
        }
    });
    return wrapperResponse;
}

async function messageDeleteWrapper(channelId: string, messageId: string) {
    return MessageActions.deleteMessage(channelId, messageId);
}

async function performAntiLogDeletion(messageId: string, channelId: string, blockMessage: string, deleteInterval: number) {
    try {
        // Délai aléatoire pour éviter les rate limits
        const randomDelay = Math.random() * 500 + 1000; // 1000-1500ms
        await sleep(randomDelay);

        // Envoyer un message de remplacement
        const buggedMsgResponse = await messageSendWrapper(
            blockMessage,
            messageId,
            channelId
        );
        const buggedMsgId = buggedMsgResponse.body.id;

        // Délai entre les suppressions
        const deleteDelay = Math.max(deleteInterval, 3000); // Minimum 3 secondes
        await sleep(deleteDelay);

        // Supprimer le message original
        await messageDeleteWrapper(channelId, messageId);

        // Attendre le délai configuré
        await sleep(deleteDelay);

        // Supprimer le message de remplacement
        await messageDeleteWrapper(channelId, buggedMsgId);

        return true;
    } catch (error) {
        console.error("[DoubleClickAntiLog] Erreur lors de la suppression AntiLog:", error);
        throw error;
    }
}

export default definePlugin({
    name: "DoubleClickAntiLog",
    description: "Double-cliquez sur vos messages pour les supprimer avec AntiLog (masque MessageLogger)",
    authors: [{ name: "Bashcord", id: 1234567890123456789n }],
    dependencies: ["MessageEventsAPI"],
    settings,

    onMessageClick(msg: any, channel: any, event: MouseEvent) {
        // Vérifier si le plugin est activé
        if (!settings.store.enabled) return;

        // Vérifier si c'est un double-clic
        if (event.detail !== 2) return;

        // Vérifier si un modificateur est requis
        if (settings.store.requireModifier && !event.ctrlKey && !event.shiftKey) return;

        // Vérifier si c'est notre message
        const currentUser = UserStore.getCurrentUser();
        if (!currentUser || !msg.author || msg.author.id !== currentUser.id) return;

        // Vérifier que le message n'est pas déjà supprimé
        if (msg.deleted === true) return;

        // Vérifier que le message est envoyé
        if (msg.state !== "SENT") return;

        // Empêcher le comportement par défaut
        event.preventDefault();
        event.stopPropagation();

        // Afficher une notification si activée
        if (settings.store.showNotification) {
            console.log(`[DoubleClickAntiLog] Suppression AntiLog du message ${msg.id}`);
        }

        // Effectuer la suppression AntiLog de manière asynchrone
        performAntiLogDeletion(
            msg.id,
            channel.id,
            settings.store.blockMessage,
            settings.store.deleteInterval
        ).catch(error => {
            console.error("[DoubleClickAntiLog] Erreur lors de la suppression:", error);
        });
    }
});

