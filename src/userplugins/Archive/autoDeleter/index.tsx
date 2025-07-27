/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import * as DataStore from "@api/DataStore";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, MessageStore, RestAPI, UserStore } from "@webpack/common";

interface TrackedMessage {
    id: string;
    channelId: string;
    timestamp: number;
    scheduledTime: number; // Timestamp absolu de suppression programmée
    timeoutId?: NodeJS.Timeout; // Optionnel car pas sauvegardé
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer la suppression automatique des messages",
        default: false
    },
    defaultDelay: {
        type: OptionType.NUMBER,
        description: "Délai avant suppression (en unité rentrée en bas)",
        default: 300, // 5 minutes
        min: 10,
        max: 86400 // 24 heures
    },
    delayUnit: {
        type: OptionType.SELECT,
        description: "Unité de temps",
        options: [
            { label: "Secondes", value: "seconds", default: true },
            { label: "Minutes", value: "minutes" },
            { label: "Heures", value: "hours" }
        ]
    },
    channelMode: {
        type: OptionType.SELECT,
        description: "Mode de filtrage des canaux",
        options: [
            { label: "Tous les canaux", value: "all", default: true },
            { label: "Canaux spécifiques seulement", value: "whitelist" },
            { label: "Exclure certains canaux", value: "blacklist" }
        ]
    },
    channelList: {
        type: OptionType.STRING,
        description: "IDs des canaux (séparés par des virgules)",
        default: ""
    },
    preserveKeywords: {
        type: OptionType.STRING,
        description: "Mots-clés à préserver (séparés par des virgules)",
        default: ""
    },
    notifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications de suppression",
        default: false
    },
    debug: {
        type: OptionType.BOOLEAN,
        description: "Mode debug (logs détaillés)",
        default: false
    }
});

const STORAGE_KEY = "AutoDeleter_TrackedMessages";

export default definePlugin({
    name: "AutoDeleter",
    description: "Supprime automatiquement vos messages après un délai configurable (persistant après redémarrage)",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    settings,

    // Map pour suivre les messages en attente de suppression
    trackedMessages: new Map<string, TrackedMessage>(),

    // Fonction liée pour l'événement MESSAGE_CREATE
    boundOnMessageCreate: null as any,

    // Statistiques
    stats: {
        messagesDeleted: 0,
        messagesSaved: 0,
        errors: 0,
        restoredFromStorage: 0
    },

    async start() {
        this.log("Plugin AutoDeleter démarré");

        // Lier le contexte pour onMessageCreate
        this.boundOnMessageCreate = this.onMessageCreate.bind(this);

        // Écouter les nouveaux messages
        FluxDispatcher.subscribe("MESSAGE_CREATE", this.boundOnMessageCreate);

        // Restaurer les messages depuis le stockage
        await this.restoreTrackedMessages();

        this.log(`Restauration terminée: ${this.stats.restoredFromStorage} messages restaurés`);
    },

    stop() {
        this.log("Plugin AutoDeleter arrêté");

        // Arrêter d'écouter les messages
        if (this.boundOnMessageCreate) {
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", this.boundOnMessageCreate);
        }

        // Annuler tous les timeouts en cours
        this.trackedMessages.forEach(message => {
            if (message.timeoutId) {
                clearTimeout(message.timeoutId);
            }
        });

        // Sauvegarder les messages restants
        this.saveTrackedMessages();
    },

    // Sauvegarder les messages programmés
    async saveTrackedMessages() {
        try {
            const messagesToSave = Array.from(this.trackedMessages.values()).map(msg => ({
                id: msg.id,
                channelId: msg.channelId,
                timestamp: msg.timestamp,
                scheduledTime: msg.scheduledTime
            }));

            await DataStore.set(STORAGE_KEY, messagesToSave);
            this.debug(`Sauvegarde: ${messagesToSave.length} messages sauvegardés`);
        } catch (error) {
            this.error("Erreur lors de la sauvegarde des messages:", error);
        }
    },

    // Restaurer les messages depuis le stockage
    async restoreTrackedMessages() {
        try {
            const savedMessages = await DataStore.get<TrackedMessage[]>(STORAGE_KEY);

            if (!savedMessages || savedMessages.length === 0) {
                this.debug("Aucun message à restaurer");
                return;
            }

            const now = Date.now();
            let restoredCount = 0;

            for (const savedMsg of savedMessages) {
                const timeUntilDeletion = savedMsg.scheduledTime - now;

                // Si le message aurait dû être supprimé, le supprimer maintenant
                if (timeUntilDeletion <= 0) {
                    this.debug(`Message ${savedMsg.id} aurait dû être supprimé, suppression immédiate`);
                    await this.deleteMessage(savedMsg.id, savedMsg.channelId);
                    continue;
                }

                // Vérifier si le message existe encore
                try {
                    const message = MessageStore.getMessage(savedMsg.channelId, savedMsg.id);
                    if (!message) {
                        this.debug(`Message ${savedMsg.id} n'existe plus, ignoré`);
                        continue;
                    }

                    // Reprogrammer la suppression
                    this.scheduleMessageDeletionFromRestore(savedMsg, timeUntilDeletion);
                    restoredCount++;
                } catch (error) {
                    this.debug(`Message ${savedMsg.id} introuvable, ignoré`);
                }
            }

            this.stats.restoredFromStorage = restoredCount;
            this.debug(`Restauration: ${restoredCount} messages reprogrammés`);

        } catch (error) {
            this.error("Erreur lors de la restauration des messages:", error);
        }
    },

    onMessageCreate(event: any) {
        try {
            if (!settings.store.enabled) return;

            const message = event?.message;
            if (!message) return;

            // Vérifier si c'est notre message
            const currentUser = UserStore.getCurrentUser();
            if (!message.author || !currentUser || message.author.id !== currentUser.id) {
                return;
            }

            // Vérifier les filtres de canal
            if (!this.shouldProcessChannel(message.channel_id)) {
                this.debug(`Canal ${message.channel_id} ignoré par les filtres`);
                return;
            }

            // Vérifier les mots-clés à préserver
            if (this.shouldPreserveMessage(message.content)) {
                this.debug(`Message préservé à cause des mots-clés: ${message.content}`);
                this.stats.messagesSaved++;
                return;
            }

            // Programmer la suppression
            this.scheduleMessageDeletion(message);
        } catch (error) {
            this.error("Erreur dans onMessageCreate:", error);
        }
    },

    shouldProcessChannel(channelId: string): boolean {
        const mode = settings.store.channelMode;
        const channelList = settings.store.channelList
            .split(',')
            .map(id => id.trim())
            .filter(id => id.length > 0);

        switch (mode) {
            case "all":
                return true;
            case "whitelist":
                return channelList.includes(channelId);
            case "blacklist":
                return !channelList.includes(channelId);
            default:
                return true;
        }
    },

    shouldPreserveMessage(content: string): boolean {
        if (!content) return false;

        const keywords = settings.store.preserveKeywords
            .split(',')
            .map(keyword => keyword.trim().toLowerCase())
            .filter(keyword => keyword.length > 0);

        if (keywords.length === 0) return false;

        const lowerContent = content.toLowerCase();
        return keywords.some(keyword => lowerContent.includes(keyword));
    },

    scheduleMessageDeletion(message: any) {
        const delay = this.getDelayInMs();
        const scheduledTime = Date.now() + delay;

        this.debug(`Programmation suppression message ${message.id} dans ${delay}ms (${new Date(scheduledTime).toLocaleString()})`);

        const timeoutId = setTimeout(() => {
            this.deleteMessage(message.id, message.channel_id);
        }, delay);

        // Suivre le message
        const trackedMessage: TrackedMessage = {
            id: message.id,
            channelId: message.channel_id,
            timestamp: Date.now(),
            scheduledTime: scheduledTime,
            timeoutId: timeoutId
        };

        this.trackedMessages.set(message.id, trackedMessage);

        // Sauvegarder immédiatement
        this.saveTrackedMessages();
    },

    scheduleMessageDeletionFromRestore(savedMsg: TrackedMessage, delay: number) {
        this.debug(`Reprogrammation suppression message ${savedMsg.id} dans ${delay}ms`);

        const timeoutId = setTimeout(() => {
            this.deleteMessage(savedMsg.id, savedMsg.channelId);
        }, delay);

        // Mettre à jour le message avec le nouveau timeout
        const trackedMessage: TrackedMessage = {
            ...savedMsg,
            timeoutId: timeoutId
        };

        this.trackedMessages.set(savedMsg.id, trackedMessage);
    },

    async deleteMessage(messageId: string, channelId: string) {
        try {
            this.debug(`Tentative de suppression du message ${messageId}`);

            // Utiliser l'API REST de Discord pour supprimer le message
            await RestAPI.del({
                url: `/channels/${channelId}/messages/${messageId}`
            });

            this.log(`Message ${messageId} supprimé avec succès`);
            this.stats.messagesDeleted++;

            if (settings.store.notifications) {
                this.showNotification("Message supprimé automatiquement", "success");
            }

        } catch (error) {
            this.error(`Erreur lors de la suppression du message ${messageId}:`, error);
            this.stats.errors++;

            if (settings.store.notifications) {
                this.showNotification("Erreur lors de la suppression", "error");
            }
        } finally {
            // Retirer le message du suivi
            this.trackedMessages.delete(messageId);
            // Sauvegarder après suppression
            this.saveTrackedMessages();
        }
    },

    getDelayInMs(): number {
        const delay = settings.store.defaultDelay;
        const unit = settings.store.delayUnit;

        switch (unit) {
            case "seconds":
                return delay * 1000;
            case "minutes":
                return delay * 60 * 1000;
            case "hours":
                return delay * 60 * 60 * 1000;
            default:
                return delay * 1000;
        }
    },

    showNotification(message: string, type: "success" | "error" | "info" = "info") {
        // Fallback vers console pour l'instant
        const prefix = type === "error" ? "❌" : type === "success" ? "✅" : "ℹ️";
        console.log(`[AutoDeleter] ${prefix} ${message}`);
    },

    // Méthodes de logging
    log(message: string, ...args: any[]) {
        console.log(`[AutoDeleter] ${message}`, ...args);
    },

    debug(message: string, ...args: any[]) {
        if (settings.store.debug) {
            console.debug(`[AutoDeleter DEBUG] ${message}`, ...args);
        }
    },

    error(message: string, ...args: any[]) {
        console.error(`[AutoDeleter ERROR] ${message}`, ...args);
    },

    // Méthodes utilitaires pour les statistiques
    getStats() {
        return {
            ...this.stats,
            trackedMessages: this.trackedMessages.size,
            uptime: Date.now() - (this.startTime || Date.now())
        };
    },

    resetStats() {
        this.stats = {
            messagesDeleted: 0,
            messagesSaved: 0,
            errors: 0,
            restoredFromStorage: 0
        };
        this.log("Statistiques réinitialisées");
    },

    // Méthode pour nettoyer le stockage (utile pour le debug)
    async clearStorage() {
        try {
            await DataStore.del(STORAGE_KEY);
            this.log("Stockage nettoyé");
        } catch (error) {
            this.error("Erreur lors du nettoyage du stockage:", error);
        }
    }
}); 