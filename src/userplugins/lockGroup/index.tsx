/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu, RestAPI, UserStore } from "@webpack/common";
import { Channel } from "discord-types/general";

// État des groupes verrouillés
const lockedGroups = new Set<string>();

const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode débogage (logs détaillés)",
        default: false
    }
});

// Fonction de log avec préfixe
function log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[LockGroup ${timestamp}]`;

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

// Fonction de débogage
function debugLog(message: string) {
    if (settings.store.debugMode) {
        log(`🔍 DEBUG: ${message}`);
    }
}

// Intercepter les tentatives d'ajout de membres
function interceptAddMember(originalMethod: any) {
    return function (this: any, ...args: any[]) {
        const [requestData] = args;

        // Vérifier si c'est une requête d'ajout de membre à un groupe
        // Format: PUT /channels/{channelId}/recipients/{userId}
        if (requestData?.url?.match(/^\/channels\/\d+\/recipients\/\d+$/)) {
            const urlParts = requestData.url.split('/');
            const channelId = urlParts[2]; // /channels/{channelId}/recipients/{userId}
            const targetUserId = urlParts[4];

            // Vérifier si le groupe est verrouillé
            if (lockedGroups.has(channelId)) {
                const channel = ChannelStore.getChannel(channelId);
                const currentUserId = UserStore.getCurrentUser()?.id;

                debugLog(`Détection d'ajout dans groupe verrouillé:
- Canal: ${channelId}
- Utilisateur cible: ${targetUserId}
- Groupe verrouillé: OUI
- Propriétaire du canal: ${channel?.ownerId}
- Utilisateur actuel: ${currentUserId}`);

                // Vérifier si c'est un groupe DM et si l'utilisateur actuel est propriétaire
                if (channel && channel.type === 3 && channel.ownerId === currentUserId) {
                    const channelName = channel.name || "Groupe sans nom";
                    log(`🔒 Détection d'ajout dans "${channelName}" - Auto-kick programmé`);

                    // Programmer le kick après 100ms
                    setTimeout(async () => {
                        try {
                            debugLog(`🦶 Tentative de kick automatique de ${targetUserId}`);

                            await RestAPI.del({
                                url: `/channels/${channelId}/recipients/${targetUserId}`
                            });

                            log(`✅ Utilisateur ${targetUserId} automatiquement kické du groupe verrouillé`);

                            if (settings.store.showNotifications) {
                                showNotification({
                                    title: "🔒 LockGroup - Auto-kick",
                                    body: `Membre automatiquement retiré du groupe verrouillé "${channelName}"`,
                                    icon: undefined
                                });
                            }
                        } catch (error) {
                            log(`❌ Erreur lors du kick automatique: ${error}`, "error");
                        }
                    }, 100);

                    if (settings.store.showNotifications) {
                        showNotification({
                            title: "🔒 LockGroup - Ajout détecté",
                            body: `Ajout détecté dans "${channelName}" - Auto-kick en cours...`,
                            icon: undefined
                        });
                    }
                }
            }
        }

        return originalMethod.apply(this, args);
    };
}

// Fonction pour activer/désactiver le verrouillage d'un groupe
function toggleGroupLock(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const currentUserId = UserStore.getCurrentUser()?.id;

    if (!channel) {
        log("Canal introuvable", "error");
        return;
    }

    if (channel.type !== 3) { // 3 = GROUP_DM
        log("Ce n'est pas un groupe DM", "error");
        return;
    }

    if (!currentUserId) {
        log("Impossible d'obtenir l'ID de l'utilisateur actuel", "error");
        return;
    }

    const channelName = channel.name || "Groupe sans nom";

    // Vérifier si l'utilisateur est le propriétaire du groupe
    if (channel.ownerId !== currentUserId) {
        log("❌ Seul le propriétaire du groupe peut utiliser cette fonction", "error");

        if (settings.store.showNotifications) {
            showNotification({
                title: "❌ LockGroup",
                body: "Seul le propriétaire du groupe peut verrouiller/déverrouiller le groupe",
                icon: undefined
            });
        }
        return;
    }

    const isCurrentlyLocked = lockedGroups.has(channelId);

    if (isCurrentlyLocked) {
        // Déverrouiller le groupe
        lockedGroups.delete(channelId);
        log(`🔓 Groupe "${channelName}" déverrouillé`);

        if (settings.store.showNotifications) {
            showNotification({
                title: "🔓 LockGroup",
                body: `Groupe "${channelName}" déverrouillé - Ajout de membres autorisé`,
                icon: undefined
            });
        }
    } else {
        // Verrouiller le groupe
        lockedGroups.add(channelId);
        log(`🔒 Groupe "${channelName}" verrouillé`);

        if (settings.store.showNotifications) {
            showNotification({
                title: "🔒 LockGroup",
                body: `Groupe "${channelName}" verrouillé - Ajout de membres bloqué`,
                icon: undefined
            });
        }
    }

    debugLog(`État des groupes verrouillés: ${Array.from(lockedGroups).join(", ")}`);
}

// Patch du menu contextuel des groupes
const GroupContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!channel || channel.type !== 3) return; // 3 = GROUP_DM

    const currentUserId = UserStore.getCurrentUser()?.id;
    const isOwner = channel.ownerId === currentUserId;

    // Ne pas afficher l'option si l'utilisateur n'est pas propriétaire
    if (!isOwner) return;

    const isLocked = lockedGroups.has(channel.id);
    const group = findGroupChildrenByChildId("leave-channel", children);

    if (group) {
        const menuItems = [<Menu.MenuSeparator key="separator" />];

        // Option pour verrouiller (uniquement si pas verrouillé)
        if (!isLocked) {
            menuItems.push(
                <Menu.MenuItem
                    key="lock-group"
                    id="vc-lock-group"
                    label="🔒 Verrouiller le groupe"
                    color="danger"
                    action={() => toggleGroupLock(channel.id)}
                    icon={() => (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z" />
                        </svg>
                    )}
                />
            );
        }

        // Option pour déverrouiller (uniquement si verrouillé)
        if (isLocked) {
            menuItems.push(
                <Menu.MenuItem
                    key="unlock-group"
                    id="vc-unlock-group"
                    label="🔓 Déverrouiller le groupe"
                    color="brand"
                    action={() => toggleGroupLock(channel.id)}
                    icon={() => (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z" />
                        </svg>
                    )}
                />
            );
        }

        group.push(...menuItems);
    }
};

// Variable pour stocker la méthode originale
let originalPutMethod: any = null;

export default definePlugin({
    name: "LockGroup",
    description: "Permet de verrouiller/déverrouiller les groupes via le menu contextuel (empêche l'ajout de membres)",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "gdm-context": GroupContextMenuPatch
    },

    flux: {
        // Surveiller les messages pour détecter les ajouts de membres
        MESSAGE_CREATE(event: { message: any; }) {
            const { message } = event;
            const currentUserId = UserStore.getCurrentUser()?.id;

            // Vérifier si c'est un message d'ajout de membre (type 1)
            if (message && message.type === 1) { // RECIPIENT_ADD
                const channelId = message.channel_id;

                if (lockedGroups.has(channelId)) {
                    const channel = ChannelStore.getChannel(channelId);

                    if (channel && channel.type === 3 && channel.ownerId === currentUserId) {
                        const channelName = channel.name || "Groupe sans nom";
                        const addedUserId = message.mentions?.[0]?.id;

                        log(`📨 Message d'ajout détecté dans "${channelName}"`);

                        if (addedUserId) {
                            debugLog(`Utilisateur ajouté via message: ${addedUserId}`);

                            // Kick de sécurité au cas où l'interception REST n'aurait pas fonctionné
                            setTimeout(async () => {
                                try {
                                    await RestAPI.del({
                                        url: `/channels/${channelId}/recipients/${addedUserId}`
                                    });
                                    log(`🔒 Kick de sécurité effectué pour ${addedUserId}`);
                                } catch (error) {
                                    debugLog(`Erreur kick de sécurité: ${error}`);
                                }
                            }, 150);
                        }

                        if (settings.store.showNotifications) {
                            showNotification({
                                title: "🔒 LockGroup - Membre ajouté",
                                body: `Membre ajouté dans "${channelName}" puis automatiquement retiré`,
                                icon: undefined
                            });
                        }
                    }
                }
            }
        }
    },

    start() {
        log("🚀 Plugin LockGroup démarré");
        debugLog(`Configuration actuelle:
- Notifications: ${settings.store.showNotifications ? "ON" : "OFF"}
- Debug: ${settings.store.debugMode ? "ON" : "OFF"}`);

        // Intercepter les méthodes REST API
        if (RestAPI && RestAPI.put) {
            originalPutMethod = RestAPI.put;
            RestAPI.put = interceptAddMember(originalPutMethod);
            debugLog("Interception REST API configurée");
        }

        if (settings.store.showNotifications) {
            showNotification({
                title: "🔒 LockGroup activé",
                body: "Clic droit sur un groupe pour le verrouiller/déverrouiller",
                icon: undefined
            });
        }
    },

    stop() {
        log("🛑 Plugin LockGroup arrêté");

        // Restaurer la méthode originale
        if (originalPutMethod && RestAPI) {
            RestAPI.put = originalPutMethod;
            originalPutMethod = null;
            debugLog("Interception REST API restaurée");
        }

        // Nettoyer l'état
        lockedGroups.clear();

        if (settings.store.showNotifications) {
            showNotification({
                title: "🔒 LockGroup désactivé",
                body: "Tous les verrouillages ont été supprimés",
                icon: undefined
            });
        }
    }
});
