/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, GuildStore, Menu, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";
import { openModal, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";

// Type simple pour Guild
interface Guild {
    id: string;
    name: string;
    ownerId: string;
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer le plugin LeaveAllServer",
        default: true
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions",
        default: true
    },
    confirmBeforeLeave: {
        type: OptionType.BOOLEAN,
        description: "Demander confirmation dans une modal Discord avant de quitter tous les serveurs",
        default: false
    },
    delayBetweenLeaves: {
        type: OptionType.NUMBER,
        description: "Délai en millisecondes entre chaque sortie de serveur (pour éviter le rate limiting)",
        default: 500,
        min: 100,
        max: 2000
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
    const prefix = `[LeaveAllServer ${timestamp}]`;

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

// Modal de confirmation Discord
function ConfirmationModal({ modalProps, serverCount, onConfirm }: { modalProps: ModalProps, serverCount: number, onConfirm: () => void; }) {
    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <h2>⚠️ Confirmation</h2>
            </ModalHeader>
            <ModalContent>
                <div style={{ padding: "16px 0" }}>
                    <p><strong>Êtes-vous sûr de vouloir quitter tous les {serverCount} serveurs ?</strong></p>
                    <br />
                    <p>• Cette action ne peut pas être annulée</p>
                    <p>• Vous serez retiré de tous les serveurs instantanément</p>
                    <p>• Les serveurs dont vous êtes propriétaire seront ignorés</p>
                </div>
            </ModalContent>
            <ModalFooter>
                <Button
                    color={Button.Colors.RED}
                    onClick={() => {
                        modalProps.onClose();
                        onConfirm();
                    }}
                >
                    🚪 Quitter tous les serveurs
                </Button>
                <Button
                    color={Button.Colors.PRIMARY}
                    onClick={modalProps.onClose}
                >
                    Annuler
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

// Fonction pour demander confirmation avec modal Discord
function showConfirmation(serverCount: number, onConfirm: () => void) {
    if (!settings.store.confirmBeforeLeave) {
        onConfirm();
        return;
    }

    openModal(modalProps => (
        <ConfirmationModal
            modalProps={modalProps}
            serverCount={serverCount}
            onConfirm={onConfirm}
        />
    ));
}

// Fonction pour quitter un serveur spécifique
async function leaveServer(guildId: string): Promise<boolean> {
    try {
        debugLog(`Tentative de sortie du serveur ${guildId}`);

        // Utiliser l'API Discord pour quitter le serveur
        await RestAPI.del({
            url: `/users/@me/guilds/${guildId}`
        });

        debugLog(`✅ Serveur ${guildId} quitté avec succès`);
        return true;
    } catch (error) {
        log(`❌ Erreur lors de la sortie du serveur ${guildId}: ${error}`, "error");
        return false;
    }
}

// Fonction pour obtenir tous les serveurs
function getAllServers(): Guild[] {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return [];

    const guilds = GuildStore.getGuilds();
    const serverList: Guild[] = [];

    Object.values(guilds).forEach((guild: Guild) => {
        // Exclure les serveurs dont l'utilisateur est propriétaire
        if (guild && guild.ownerId !== currentUserId) {
            serverList.push(guild);
        }
    });

    return serverList;
}

// Fonction principale pour quitter tous les serveurs
async function leaveAllServers() {
    if (!settings.store.enabled) {
        log("Plugin désactivé", "warn");
        return;
    }

    try {
        const currentUserId = UserStore.getCurrentUser()?.id;

        if (!currentUserId) {
            log("Impossible d'obtenir l'ID de l'utilisateur actuel", "error");
            return;
        }

        const servers = getAllServers();

        debugLog(`📊 Informations:
- Nombre de serveurs trouvés: ${servers.length}
- Utilisateur actuel: ${currentUserId}`);

        if (servers.length === 0) {
            log("Aucun serveur à quitter (propriétaire de tous les serveurs ou aucun serveur)", "warn");

            if (settings.store.showNotifications) {
                showNotification({
                    title: "ℹ️ LeaveAllServer",
                    body: "Aucun serveur à quitter",
                    icon: undefined
                });
            }

            showToast(Toasts.Type.MESSAGE, "ℹ️ Aucun serveur à quitter");
            return;
        }

        // Fonction interne pour exécuter la sortie
        const executeLeave = async () => {
            log(`🚀 Début de la sortie de ${servers.length} serveur(s)`);

            let successCount = 0;
            let failureCount = 0;

            // Notification de début
            if (settings.store.showNotifications) {
                showNotification({
                    title: "🔄 LeaveAllServer en cours",
                    body: `Sortie de ${servers.length} serveur(s) en cours...`,
                    icon: undefined
                });
            }

            showToast(Toasts.Type.MESSAGE, `🔄 Sortie de ${servers.length} serveur(s) en cours...`);

            // Quitter chaque serveur
            for (const server of servers) {
                const serverName = server.name || `Serveur ${server.id}`;
                debugLog(`Traitement du serveur: ${serverName} (${server.id})`);

                const success = await leaveServer(server.id);
                if (success) {
                    successCount++;
                    debugLog(`✅ Quitté: ${serverName}`);
                } else {
                    failureCount++;
                    debugLog(`❌ Échec: ${serverName}`);
                }

                // Délai pour éviter le rate limiting
                if (settings.store.delayBetweenLeaves > 0) {
                    await new Promise(resolve => setTimeout(resolve, settings.store.delayBetweenLeaves));
                }
            }

            const totalProcessed = successCount + failureCount;

            log(`✅ Opération terminée:
- Serveurs traités: ${totalProcessed}
- Succès: ${successCount}
- Échecs: ${failureCount}`);

            // Notification finale
            if (settings.store.showNotifications) {
                const title = failureCount > 0 ? "⚠️ LeaveAllServer terminé avec erreurs" : "✅ LeaveAllServer terminé";
                const body = failureCount > 0
                    ? `${successCount} serveurs quittés, ${failureCount} échecs`
                    : `${successCount} serveurs quittés avec succès`;

                showNotification({
                    title,
                    body,
                    icon: undefined
                });
            }

            // Toast final
            if (failureCount > 0) {
                showToast(Toasts.Type.FAILURE, `⚠️ ${successCount} serveurs quittés, ${failureCount} échecs`);
            } else {
                showToast(Toasts.Type.SUCCESS, `✅ ${successCount} serveurs quittés avec succès`);
            }
        };

        // Demander confirmation ou exécuter directement
        showConfirmation(servers.length, executeLeave);

    } catch (error) {
        log(`❌ Erreur générale: ${error}`, "error");

        if (settings.store.showNotifications) {
            showNotification({
                title: "❌ LeaveAllServer - Erreur",
                body: "Une erreur est survenue lors de la sortie des serveurs",
                icon: undefined
            });
        }

        showToast(Toasts.Type.FAILURE, "❌ Erreur lors de la sortie des serveurs");
    }
}

// Menu contextuel pour les serveurs
const ServerContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!settings.store.enabled) return;

    // Trouver un groupe approprié dans le menu contextuel
    const group = findGroupChildrenByChildId("privacy", children) ||
        findGroupChildrenByChildId("leave-guild", children) ||
        findGroupChildrenByChildId("guild-settings", children);

    if (group) {
        group.push(
            <Menu.MenuItem
                id="vc-leave-all-servers"
                label="🚪 Quitter tous les serveurs"
                action={leaveAllServers}
                color="danger"
            />
        );
    }
};

export default definePlugin({
    name: "LeaveAllServer",
    description: "Permet de quitter tous les serveurs Discord d'un seul clic (sauf ceux dont vous êtes propriétaire) avec rate limiting configurable",
    authors: [Devs.BigDuck],
    settings,

    contextMenus: {
        "guild-context": ServerContextMenuPatch
    },

    start() {
        log("Plugin LeaveAllServer démarré");
    },

    stop() {
        log("Plugin LeaveAllServer arrêté");
    }
});
