/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu, RestAPI, UserStore } from "@webpack/common";
// Types pour les canaux et messages
interface Channel {
    id: string;
    name?: string;
    recipients?: string[];
}

interface Message {
    id: string;
    author: { id: string; };
    type: number;
    timestamp: string | { toISOString(): string; };
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer le plugin MessageCleaner",
        default: true
    },
    targetChannelId: {
        type: OptionType.STRING,
        description: "ID du canal à nettoyer (laisser vide pour utiliser le menu contextuel)",
        default: ""
    },
    delayBetweenDeletes: {
        type: OptionType.SLIDER,
        description: "Délai entre chaque suppression (ms) - pour éviter le rate limit",
        default: 1000,
        markers: [100, 500, 1000, 2000, 5000],
        minValue: 100,
        maxValue: 10000,
        stickToMarkers: false
    },
    batchSize: {
        type: OptionType.SLIDER,
        description: "Nombre de messages à traiter par batch",
        default: 50,
        markers: [10, 25, 50, 100],
        minValue: 1,
        maxValue: 100,
        stickToMarkers: false
    },
    onlyOwnMessages: {
        type: OptionType.BOOLEAN,
        description: "Supprimer uniquement ses propres messages",
        default: true
    },
    requireDoubleClick: {
        type: OptionType.BOOLEAN,
        description: "Demander un double-clic pour confirmer (au lieu d'une boîte de dialogue)",
        default: true
    },
    showProgress: {
        type: OptionType.BOOLEAN,
        description: "Afficher la progression en temps réel",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode débogage (logs détaillés)",
        default: false
    },
    skipSystemMessages: {
        type: OptionType.BOOLEAN,
        description: "Ignorer les messages système (rejoindre/quitter, etc.)",
        default: true
    },
    maxAge: {
        type: OptionType.SLIDER,
        description: "Age maximum des messages à supprimer (jours, 0 = pas de limite)",
        default: 0,
        markers: [0, 1, 7, 30, 90],
        minValue: 0,
        maxValue: 365,
        stickToMarkers: false
    }
});

// Variables globales pour le contrôle
let isCleaningInProgress = false;
let shouldStopCleaning = false;
let lastClickTime = 0;
let clickTimeoutId: number | null = null;
let cleaningStats = {
    total: 0,
    deleted: 0,
    failed: 0,
    skipped: 0
};

// Fonction de log avec préfixe
function log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[MessageCleaner ${timestamp}]`;

    switch (level) {
        case "warn":
            console.warn(prefix, message);
            break;
        case "error":
            console.error(prefix, message);
            break;
        default:
            console.log(prefix, message);
    }
}

// Log de débogage
function debugLog(message: string) {
    if (settings.store.debugMode) {
        log(`🔍 ${message}`, "info");
    }
}

// Fonction pour vérifier si un message peut être supprimé
function canDeleteMessage(message: Message, currentUserId: string): boolean {
    // Messages système
    if (settings.store.skipSystemMessages && message.type !== 0) {
        return false;
    }

    // Uniquement ses propres messages
    if (settings.store.onlyOwnMessages && message.author.id !== currentUserId) {
        return false;
    }

    // Age maximum
    if (settings.store.maxAge > 0) {
        // Gérer le timestamp comme un Moment ou une string
        const messageTime = typeof message.timestamp === 'string'
            ? new Date(message.timestamp).getTime()
            : new Date(message.timestamp.toISOString()).getTime();

        const messageAge = Date.now() - messageTime;
        const maxAgeMs = settings.store.maxAge * 24 * 60 * 60 * 1000;
        if (messageAge > maxAgeMs) {
            return false;
        }
    }

    return true;
}

// Fonction pour supprimer un message
async function deleteMessage(channelId: string, messageId: string): Promise<boolean> {
    try {
        await RestAPI.del({
            url: `/channels/${channelId}/messages/${messageId}`
        });
        return true;
    } catch (error) {
        debugLog(`❌ Erreur lors de la suppression du message ${messageId}: ${error}`);
        return false;
    }
}

// Fonction pour obtenir les messages d'un canal
async function getChannelMessages(channelId: string, before?: string): Promise<Message[]> {
    try {
        const url = before
            ? `/channels/${channelId}/messages?limit=${settings.store.batchSize}&before=${before}`
            : `/channels/${channelId}/messages?limit=${settings.store.batchSize}`;

        const response = await RestAPI.get({ url });
        return response.body;
    } catch (error) {
        log(`❌ Erreur lors de la récupération des messages: ${error}`, "error");
        return [];
    }
}

// Fonction pour afficher la progression
function updateProgress() {
    if (!settings.store.showProgress) return;

    const { total, deleted, failed, skipped } = cleaningStats;
    const processed = deleted + failed + skipped;
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

    showNotification({
        title: `🧹 Nettoyage en cours (${percentage}%)`,
        body: `Traités: ${processed}/${total} | Supprimés: ${deleted} | Échecs: ${failed} | Ignorés: ${skipped}`,
        icon: undefined
    });
}

// Fonction principale de nettoyage
async function cleanChannel(channelId: string) {
    if (!settings.store.enabled) {
        log("Plugin désactivé", "warn");
        return;
    }

    if (isCleaningInProgress) {
        log("Un nettoyage est déjà en cours", "warn");
        showNotification({
            title: "⚠️ Nettoyage en cours",
            body: "Un nettoyage est déjà en cours. Utilisez 'Arrêter le nettoyage' si nécessaire.",
            icon: undefined
        });
        return;
    }

    try {
        const channel = ChannelStore.getChannel(channelId);
        const currentUserId = UserStore.getCurrentUser()?.id;

        if (!channel) {
            log("Canal introuvable", "error");
            return;
        }

        if (!currentUserId) {
            log("Impossible d'obtenir l'ID de l'utilisateur actuel", "error");
            return;
        }

        const channelName = channel.name || channel.recipients?.map((id: string) => {
            const user = UserStore.getUser(id);
            return user?.username || "Utilisateur inconnu";
        }).join(", ") || "Canal privé";

        // Estimation initiale du nombre de messages
        log(`🔍 Analyse du canal "${channelName}"...`);
        let estimatedTotal = 0;
        let lastMessageId: string | undefined;

        showNotification({
            title: "🔍 Analyse en cours",
            body: `Analyse du canal "${channelName}" pour estimer le nombre de messages...`,
            icon: undefined
        });

        // Compter approximativement les messages
        for (let i = 0; i < 10; i++) { // Maximum 10 batches pour l'estimation
            const messages = await getChannelMessages(channelId, lastMessageId);
            if (messages.length === 0) break;

            const validMessages = messages.filter(msg => canDeleteMessage(msg, currentUserId));
            estimatedTotal += validMessages.length;
            lastMessageId = messages[messages.length - 1].id;

            if (messages.length < settings.store.batchSize) break;
        }

        if (estimatedTotal === 0) {
            log("Aucun message à supprimer trouvé", "warn");
            showNotification({
                title: "ℹ️ MessageCleaner",
                body: "Aucun message à supprimer dans ce canal",
                icon: undefined
            });
            return;
        }

        // Afficher les informations et demander confirmation via notification
        const configInfo = `Config: ${settings.store.delayBetweenDeletes}ms délai, batch ${settings.store.batchSize}, ${settings.store.onlyOwnMessages ? "propres messages" : "tous messages"}`;

        showNotification({
            title: `⚠️ Nettoyage prêt`,
            body: `~${estimatedTotal} messages à supprimer dans "${channelName}". ${configInfo}. Cliquez à nouveau pour CONFIRMER.`,
            icon: undefined
        });

        log(`📊 Estimation: ${estimatedTotal} messages à supprimer`);
        log(`⚙️ Configuration: délai ${settings.store.delayBetweenDeletes}ms, batch ${settings.store.batchSize}`);

        // Si double-clic requis, attendre la confirmation
        if (settings.store.requireDoubleClick) {
            const now = Date.now();
            if (now - lastClickTime > 3000) { // 3 secondes pour confirmer
                lastClickTime = now;
                return; // Premier clic, attendre le second
            }
        }

        // Initialiser les statistiques
        isCleaningInProgress = true;
        shouldStopCleaning = false;
        cleaningStats = {
            total: estimatedTotal,
            deleted: 0,
            failed: 0,
            skipped: 0
        };

        log(`🧹 Début du nettoyage de "${channelName}" - ${estimatedTotal} message(s) estimé(s)`);

        showNotification({
            title: "🧹 Nettoyage démarré",
            body: `Suppression de ~${estimatedTotal} messages en cours...`,
            icon: undefined
        });

        lastMessageId = undefined;
        let totalProcessed = 0;

        // Boucle principale de nettoyage
        while (!shouldStopCleaning) {
            const messages = await getChannelMessages(channelId, lastMessageId);

            if (messages.length === 0) {
                log("Plus de messages à traiter");
                break;
            }

            const validMessages = messages.filter(msg => canDeleteMessage(msg, currentUserId));

            if (validMessages.length === 0) {
                // Si aucun message valide dans ce batch, passer au suivant
                lastMessageId = messages[messages.length - 1].id;
                cleaningStats.skipped += messages.length;
                continue;
            }

            // Supprimer les messages un par un
            for (const message of validMessages) {
                if (shouldStopCleaning) break;

                const success = await deleteMessage(channelId, message.id);

                if (success) {
                    cleaningStats.deleted++;
                    debugLog(`✅ Message ${message.id} supprimé`);
                } else {
                    cleaningStats.failed++;
                }

                totalProcessed++;

                // Délai anti-rate-limit
                await new Promise(resolve => setTimeout(resolve, settings.store.delayBetweenDeletes));

                // Mise à jour de la progression tous les 10 messages
                if (totalProcessed % 10 === 0) {
                    updateProgress();
                }
            }

            // Messages non valides comptés comme ignorés
            const invalidMessages = messages.filter(msg => !canDeleteMessage(msg, currentUserId));
            cleaningStats.skipped += invalidMessages.length;

            lastMessageId = messages[messages.length - 1].id;

            // Si on a traité moins de messages que la taille du batch, on a fini
            if (messages.length < settings.store.batchSize) {
                break;
            }
        }

        // Nettoyage terminé
        isCleaningInProgress = false;

        const { deleted, failed, skipped } = cleaningStats;
        const finalTotal = deleted + failed + skipped;

        log(`✅ Nettoyage terminé:
• Messages traités: ${finalTotal}
• Supprimés: ${deleted}
• Échecs: ${failed}
• Ignorés: ${skipped}`);

        const title = shouldStopCleaning ? "⏹️ Nettoyage arrêté" : "✅ Nettoyage terminé";
        const body = failed > 0
            ? `${deleted} supprimés, ${failed} échecs, ${skipped} ignorés`
            : `${deleted} messages supprimés avec succès`;

        showNotification({
            title,
            body,
            icon: undefined
        });

    } catch (error) {
        isCleaningInProgress = false;
        log(`❌ Erreur globale lors du nettoyage: ${error}`, "error");

        showNotification({
            title: "❌ MessageCleaner - Erreur",
            body: "Une erreur est survenue lors du nettoyage",
            icon: undefined
        });
    }
}

// Fonction pour arrêter le nettoyage
function stopCleaning() {
    if (isCleaningInProgress) {
        shouldStopCleaning = true;
        log("⏹️ Arrêt du nettoyage demandé");

        showNotification({
            title: "⏹️ Arrêt en cours",
            body: "Le nettoyage va s'arrêter après le message actuel",
            icon: undefined
        });
    }
}

// Patch du menu contextuel des canaux
const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!channel) return;

    const group = findGroupChildrenByChildId("mark-channel-read", children) ?? children;

    if (group) {
        const menuItems = [
            <Menu.MenuSeparator key="separator" />,
            <Menu.MenuItem
                key="clean-messages"
                id="vc-clean-messages"
                label="🧹 Nettoyer les messages"
                color="danger"
                action={() => cleanChannel(channel.id)}
                disabled={isCleaningInProgress}
            />
        ];

        if (isCleaningInProgress) {
            menuItems.push(
                <Menu.MenuItem
                    key="stop-cleaning"
                    id="vc-stop-cleaning"
                    label="⏹️ Arrêter le nettoyage"
                    color="danger"
                    action={stopCleaning}
                />
            );
        }

        group.push(...menuItems);
    }
};

// Patch du menu contextuel des utilisateurs
const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: any; }) => {
    if (!user) return;

    // Log de débogage pour voir les éléments du menu
    if (settings.store.debugMode) {
        log(`🔍 Menu contextuel utilisateur - ${children.length} éléments trouvés`);
        children.forEach((child: any, index: number) => {
            log(`  [${index}] ID: ${child?.props?.id}, Label: ${child?.props?.label}`);
        });
    }

    // Essayer plusieurs méthodes pour trouver l'élément "Copier l'identifiant"
    let copyIdIndex = -1;

    // Méthode 1: Recherche par ID exact
    copyIdIndex = children.findIndex((child: any) =>
        child?.props?.id === "copy-user-id" ||
        child?.props?.id === "copy-user-id-button"
    );

    // Méthode 2: Recherche par label exact
    if (copyIdIndex === -1) {
        copyIdIndex = children.findIndex((child: any) =>
            child?.props?.label === "Copier l'identifiant de l'utilisateur" ||
            child?.props?.label === "Copy user ID"
        );
    }

    // Méthode 3: Recherche par label partiel
    if (copyIdIndex === -1) {
        copyIdIndex = children.findIndex((child: any) =>
            child?.props?.label?.includes("Copier l'identifiant") ||
            child?.props?.label?.includes("Copy user ID")
        );
    }

    // Méthode 4: Recherche par texte du bouton
    if (copyIdIndex === -1) {
        copyIdIndex = children.findIndex((child: any) =>
            child?.props?.children?.includes("ID") ||
            child?.props?.text?.includes("ID")
        );
    }

    // Méthode 5: Recherche par position approximative (généralement vers la fin du menu)
    if (copyIdIndex === -1) {
        // Chercher dans les 5 derniers éléments
        for (let i = Math.max(0, children.length - 5); i < children.length; i++) {
            const child = children[i];
            if (child?.props?.label?.toLowerCase().includes("copier") ||
                child?.props?.label?.toLowerCase().includes("copy") ||
                child?.props?.label?.toLowerCase().includes("id")) {
                copyIdIndex = i;
                break;
            }
        }
    }

    if (settings.store.debugMode) {
        log(`🔍 Index trouvé pour "Copier l'identifiant": ${copyIdIndex}`);
    }

    // Si on trouve l'élément, insérer notre option
    if (copyIdIndex !== -1) {
        const menuItems = [
            <Menu.MenuItem
                key="clean-messages-user"
                id="vc-clean-messages-user"
                label="🧹 Nettoyer les messages"
                color="danger"
                action={() => {
                    // Pour les utilisateurs, on nettoie le canal actuel
                    // Essayer de récupérer le canal actuel de différentes façons
                    let currentChannel: Channel | null = null;

                    // Méthode 1: Canal sélectionné
                    try {
                        const selectedChannelId = (ChannelStore as any).getLastSelectedChannelId?.();
                        if (selectedChannelId) {
                            currentChannel = ChannelStore.getChannel(selectedChannelId) as Channel | null;
                        }
                    } catch (e) {
                        // Ignorer l'erreur
                    }

                    // Méthode 2: Premier canal disponible
                    if (!currentChannel) {
                        try {
                            const channelIds = (ChannelStore as any).getChannelIds?.();
                            if (channelIds && channelIds.length > 0) {
                                currentChannel = ChannelStore.getChannel(channelIds[0]) as Channel | null;
                            }
                        } catch (e) {
                            // Ignorer l'erreur
                        }
                    }

                    if (currentChannel) {
                        cleanChannel(currentChannel.id);
                    } else {
                        showNotification({
                            title: "❌ MessageCleaner",
                            body: "Impossible de déterminer le canal à nettoyer",
                            icon: undefined
                        });
                    }
                }}
                disabled={isCleaningInProgress}
            />
        ];

        if (isCleaningInProgress) {
            menuItems.push(
                <Menu.MenuItem
                    key="stop-cleaning-user"
                    id="vc-stop-cleaning-user"
                    label="⏹️ Arrêter le nettoyage"
                    color="danger"
                    action={stopCleaning}
                />
            );
        }

        // Insérer les éléments après "Copier l'identifiant"
        children.splice(copyIdIndex + 1, 0, ...menuItems);

        if (settings.store.debugMode) {
            log(`✅ Option "Nettoyer les messages" insérée à l'index ${copyIdIndex + 1}`);
        }
    } else {
        // Si on ne trouve pas l'élément, essayer d'insérer après "View Avatar" ou avant les plugins
        let insertIndex = -1;

        // Chercher "View Avatar" qui est généralement avant "Copier l'identifiant"
        const viewAvatarIndex = children.findIndex((child: any) =>
            child?.props?.label?.includes("View Avatar") ||
            child?.props?.label?.includes("Voir l'avatar")
        );

        if (viewAvatarIndex !== -1) {
            insertIndex = viewAvatarIndex + 1;
        } else {
            // Chercher le premier élément de plugin (généralement "Accrocher")
            const pluginIndex = children.findIndex((child: any) =>
                child?.props?.label?.includes("Accrocher") ||
                child?.props?.label?.includes("Hook")
            );

            if (pluginIndex !== -1) {
                insertIndex = pluginIndex;
            } else {
                // En dernier recours, insérer vers la fin mais avant les derniers éléments
                insertIndex = Math.max(0, children.length - 3);
            }
        }

        const menuItems = [
            <Menu.MenuItem
                key="clean-messages-user"
                id="vc-clean-messages-user"
                label="🧹 Nettoyer les messages"
                color="danger"
                action={() => {
                    // Pour les utilisateurs, on nettoie le canal actuel
                    let currentChannel: Channel | null = null;

                    try {
                        const selectedChannelId = (ChannelStore as any).getLastSelectedChannelId?.();
                        if (selectedChannelId) {
                            currentChannel = ChannelStore.getChannel(selectedChannelId) as Channel | null;
                        }
                    } catch (e) {
                        // Ignorer l'erreur
                    }

                    if (!currentChannel) {
                        try {
                            const channelIds = (ChannelStore as any).getChannelIds?.();
                            if (channelIds && channelIds.length > 0) {
                                currentChannel = ChannelStore.getChannel(channelIds[0]) as Channel | null;
                            }
                        } catch (e) {
                            // Ignorer l'erreur
                        }
                    }

                    if (currentChannel) {
                        cleanChannel(currentChannel.id);
                    } else {
                        showNotification({
                            title: "❌ MessageCleaner",
                            body: "Impossible de déterminer le canal à nettoyer",
                            icon: undefined
                        });
                    }
                }}
                disabled={isCleaningInProgress}
            />
        ];

        if (isCleaningInProgress) {
            menuItems.push(
                <Menu.MenuItem
                    key="stop-cleaning-user"
                    id="vc-stop-cleaning-user"
                    label="⏹️ Arrêter le nettoyage"
                    color="danger"
                    action={stopCleaning}
                />
            );
        }

        // Insérer à l'index calculé
        children.splice(insertIndex, 0, ...menuItems);

        if (settings.store.debugMode) {
            log(`⚠️ Élément "Copier l'identifiant" non trouvé, option insérée à l'index ${insertIndex}`);
        }
    }
};

export default definePlugin({
    name: "MessageCleaner",
    description: "Nettoie tous les messages d'un canal avec gestion intelligente du rate limiting",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "channel-context": ChannelContextMenuPatch,
        "gdm-context": ChannelContextMenuPatch,
        "user-context": UserContextMenuPatch
    },

    start() {
        log("🚀 Plugin MessageCleaner démarré");

        // Si un canal est configuré dans les settings, proposer de le nettoyer
        if (settings.store.targetChannelId.trim()) {
            const channel = ChannelStore.getChannel(settings.store.targetChannelId);
            if (channel) {
                const channelName = channel.name || "Canal privé";
                log(`🎯 Canal cible configuré: "${channelName}" (${settings.store.targetChannelId})`);
            } else {
                log("⚠️ Canal cible configuré mais introuvable", "warn");
            }
        }

        debugLog(`Configuration:
• Délai: ${settings.store.delayBetweenDeletes}ms
• Batch: ${settings.store.batchSize}
• Propres messages: ${settings.store.onlyOwnMessages}
• Double-clic: ${settings.store.requireDoubleClick}
• Age max: ${settings.store.maxAge} jours`);

        showNotification({
            title: "🧹 MessageCleaner activé",
            body: "Clic droit sur un canal pour nettoyer les messages",
            icon: undefined
        });
    },

    stop() {
        log("🛑 Plugin MessageCleaner arrêté");

        // Arrêter le nettoyage en cours
        if (isCleaningInProgress) {
            shouldStopCleaning = true;
        }

        // Nettoyer les timeouts
        if (clickTimeoutId) {
            clearTimeout(clickTimeoutId);
            clickTimeoutId = null;
        }

        showNotification({
            title: "🧹 MessageCleaner désactivé",
            body: "Plugin arrêté",
            icon: undefined
        });
    }
}); 