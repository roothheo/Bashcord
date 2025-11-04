/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { UserStore, FluxDispatcher, Menu, React } from "@webpack/common";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";

// Récupération des stores et actions nécessaires
const VoiceStateStore = findStoreLazy("VoiceStateStore");
const ChannelActions = findByPropsLazy("selectVoiceChannel");

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    guildId?: string;
    deaf: boolean;
    mute: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
    selfStream: boolean;
    selfVideo: boolean;
    sessionId: string;
    suppress: boolean;
    requestToSpeakTimestamp: string | null;
}

interface AnchoredUserInfo {
    userId: string;
    username: string;
    lastChannelId: string | null;
    isAnchored: boolean;
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer le plugin Antimove",
        default: true
    },
    anchorDelay: {
        type: OptionType.NUMBER,
        description: "Délai avant de revenir dans le salon de la personne ancrée (en millisecondes)",
        default: 2000,
        min: 1000,
        max: 10000
    },
    anchorNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions d'ancrage",
        default: true
    },
    verboseLogs: {
        type: OptionType.BOOLEAN,
        description: "Afficher des logs détaillés dans la console",
        default: true
    }
});

// Variables globales
let anchoredUserInfo: AnchoredUserInfo | null = null;
let anchorMonitoringInterval: ReturnType<typeof setInterval> | null = null;
let isMovingInProgress = false;
let lastMoveAttemptTime = 0;
let consecutiveFailures = 0;
const MOVE_COOLDOWN = 3000; // Cooldown de 3 secondes entre les tentatives
const MAX_CONSECUTIVE_FAILURES = 5; // Arrêter après 5 échecs consécutifs

// Fonction de log avec préfixe
function log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[Antimove ${timestamp}]`;

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

// Fonction de log verbose (seulement si activé)
function verboseLog(message: string) {
    if (settings.store.verboseLogs) {
        log(message);
    }
}

// Fonction pour ancrer un utilisateur (le suivre)
async function ancrerUtilisateur(userId: string, username: string) {
    verboseLog(`🚀 Début de la fonction ancrerUtilisateur pour ${username} (${userId})`);

    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) {
        log("❌ Utilisateur actuel non disponible", "error");
        return;
    }

    verboseLog(`✅ Utilisateur actuel trouvé: ${currentUser.username} (${currentUser.id})`);

    const currentUserId = currentUser.id;
    if (userId === currentUserId) {
        log("❌ Impossible de s'ancrer à soi-même", "warn");
        if (settings.store.anchorNotifications) {
            showNotification({
                title: "⚓ Antimove - Erreur",
                body: "Vous ne pouvez pas vous ancrer à vous-même !"
            });
        }
        return;
    }

    // Vérifier si l'utilisateur est déjà ancré
    if (anchoredUserInfo && anchoredUserInfo.userId === userId) {
        log(`⚠️ L'utilisateur ${username} est déjà ancré`, "warn");
        if (settings.store.anchorNotifications) {
            showNotification({
                title: "⚓ Antimove - Info",
                body: `${username} est déjà ancré`
            });
        }
        return;
    }

    // Obtenir l'état vocal actuel de l'utilisateur avec un délai pour laisser le temps à la connexion RTC de s'établir
    let userVoiceState = VoiceStateStore.getVoiceStateForUser(userId);
    let currentVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

    verboseLog(`🔍 État vocal initial (ancrage) - Utilisateur: ${userVoiceState?.channelId || 'null'}, Vous: ${currentVoiceState?.channelId || 'null'}`);

    // Si l'état vocal n'est pas immédiatement disponible, attendre un peu
    if (!userVoiceState?.channelId || !currentVoiceState?.channelId) {
        verboseLog(`⏳ État vocal non disponible immédiatement pour l'ancrage, attente de 500ms...`);

        await new Promise(resolve => setTimeout(resolve, 500));

        userVoiceState = VoiceStateStore.getVoiceStateForUser(userId);
        currentVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

        verboseLog(`🔍 État vocal après attente (ancrage) - Utilisateur: ${userVoiceState?.channelId || 'null'}, Vous: ${currentVoiceState?.channelId || 'null'}`);
    }

    if (!userVoiceState?.channelId) {
        log(`❌ L'utilisateur ${username} n'est pas dans un canal vocal`, "warn");
        if (settings.store.anchorNotifications) {
            showNotification({
                title: "⚓ Antimove - Erreur",
                body: `${username} n'est pas dans un canal vocal`
            });
        }
        return;
    }

    if (!currentVoiceState?.channelId) {
        log(`❌ Vous n'êtes pas dans un canal vocal`, "warn");
        if (settings.store.anchorNotifications) {
            showNotification({
                title: "⚓ Antimove - Erreur",
                body: "Vous devez être dans un canal vocal pour ancrer quelqu'un"
            });
        }
        return;
    }

    // Ancrer l'utilisateur
    anchoredUserInfo = {
        userId,
        username,
        lastChannelId: userVoiceState.channelId,
        isAnchored: true
    };

    log(`⚓ Utilisateur ${username} (${userId}) ancré avec succès`);
    verboseLog(`📊 Informations d'ancrage:
- Utilisateur: ${username} (${userId})
- Canal actuel: ${userVoiceState.channelId}
- Votre canal: ${currentVoiceState.channelId}`);

    // Réinitialiser les variables de contrôle
    consecutiveFailures = 0;
    isMovingInProgress = false;
    lastMoveAttemptTime = 0;

    // Démarrer la surveillance périodique
    startAnchorMonitoring();

    if (settings.store.anchorNotifications) {
        showNotification({
            title: "⚓ Antimove - Activé",
            body: `Vous reviendrez automatiquement dans le salon de ${username} si vous êtes déplacé`
        });
    }
}

// Fonction pour désancrer un utilisateur
function desancrerUtilisateur() {
    if (!anchoredUserInfo) {
        log("⚠️ Aucun utilisateur ancré", "warn");
        return;
    }

    const { username } = anchoredUserInfo;
    anchoredUserInfo = null;

    // Arrêter la surveillance périodique
    stopAnchorMonitoring();

    log(`⚓ Utilisateur ${username} désancré`);

    if (settings.store.anchorNotifications) {
        showNotification({
            title: "⚓ Antimove - Désactivé",
            body: `Vous n'êtes plus ancré à ${username}`
        });
    }
}

// Fonction pour démarrer la surveillance périodique de l'ancrage
function startAnchorMonitoring() {
    if (anchorMonitoringInterval) {
        clearInterval(anchorMonitoringInterval);
    }

    console.log("🔍🔍🔍 DÉMARRAGE SURVEILLANCE ANCRAGE 🔍🔍🔍");

    anchorMonitoringInterval = setInterval(() => {
        if (!anchoredUserInfo) {
            verboseLog("🔍 Surveillance ancrage: Aucun utilisateur ancré");
            return;
        }

        const currentUser = UserStore.getCurrentUser();
        if (!currentUser) {
            verboseLog("🔍 Surveillance ancrage: Utilisateur actuel non disponible");
            return;
        }

        const currentUserId = currentUser.id;
        const myVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);
        const anchoredUserVoiceState = VoiceStateStore.getVoiceStateForUser(anchoredUserInfo.userId);

        if (!myVoiceState?.channelId || !anchoredUserVoiceState?.channelId) {
            verboseLog(`🔍 Surveillance ancrage: Un des utilisateurs n'est pas dans un canal vocal - Vous: ${myVoiceState?.channelId || 'null'}, Ancré: ${anchoredUserVoiceState?.channelId || 'null'}`);
            return;
        }

        // Log périodique pour vérifier l'état
        if (Math.random() < 0.1) { // 10% de chance à chaque vérification
            verboseLog(`🔍 Surveillance ancrage: Vous: ${myVoiceState.channelId}, ${anchoredUserInfo.username}: ${anchoredUserVoiceState.channelId}`);
        }

        // Si on n'est pas dans le même canal que la personne ancrée
        if (myVoiceState.channelId !== anchoredUserVoiceState.channelId) {
            // Vérifier si une tentative est déjà en cours ou si on est en cooldown
            const now = Date.now();
            const timeSinceLastAttempt = now - lastMoveAttemptTime;
            
            if (isMovingInProgress) {
                verboseLog(`⏸️ Déplacement déjà en cours, attente...`);
                return;
            }

            if (timeSinceLastAttempt < MOVE_COOLDOWN) {
                verboseLog(`⏸️ Cooldown actif, ${Math.ceil((MOVE_COOLDOWN - timeSinceLastAttempt) / 1000)}s restantes`);
                return;
            }

            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                log(`🛑 Trop d'échecs consécutifs (${consecutiveFailures}), arrêt de la tentative automatique. Désancrez et réancrez pour réessayer.`, "warn");
                if (settings.store.anchorNotifications) {
                    showNotification({
                        title: "⚓ Antimove - Arrêt automatique",
                        body: `Trop d'échecs. Veuillez désancrer et réancrer pour réessayer.`
                    });
                }
                return;
            }

            console.log("🚨🚨🚨 SURVEILLANCE ANCRAGE - DÉPLACEMENT DÉTECTÉ 🚨🚨🚨");
            console.log(`Vous: ${myVoiceState.channelId}, Personne ancrée: ${anchoredUserVoiceState.channelId}`);

            log(`⚠️ Surveillance: Vous avez été déplacé, retour automatique vers le salon de ${anchoredUserInfo.username}`);

            // Revenir dans le salon de la personne ancrée
            setTimeout(async () => {
                try {
                    await moveCurrentUserToVoiceChannel(anchoredUserVoiceState.channelId);
                    consecutiveFailures = 0; // Réinitialiser le compteur en cas de succès
                } catch (error: any) {
                    consecutiveFailures++;
                    const errorMsg = error?.body?.message || error?.message || String(error);
                    log(`❌ Erreur lors du retour automatique (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${errorMsg}`, "error");
                    
                    // Si c'est une erreur de permissions, arrêter immédiatement
                    if (error?.status === 403 || errorMsg.includes("Permissions")) {
                        log(`🛑 Permissions insuffisantes. Arrêt de la tentative automatique.`, "error");
                        consecutiveFailures = MAX_CONSECUTIVE_FAILURES;
                        if (settings.store.anchorNotifications) {
                            showNotification({
                                title: "⚓ Antimove - Permissions insuffisantes",
                                body: `Impossible de revenir dans le salon. Permissions manquantes.`
                            });
                        }
                    }
                }
            }, settings.store.anchorDelay);
        } else {
            // Si on est dans le bon canal, réinitialiser le compteur d'échecs
            if (consecutiveFailures > 0) {
                verboseLog(`✅ Retour dans le bon canal, réinitialisation du compteur d'échecs`);
                consecutiveFailures = 0;
            }
        }
    }, 1000); // Vérifier toutes les secondes
}

// Fonction pour arrêter la surveillance périodique de l'ancrage
function stopAnchorMonitoring() {
    if (anchorMonitoringInterval) {
        console.log("🛑🛑🛑 ARRÊT SURVEILLANCE ANCRAGE 🛑🛑🛑");
        clearInterval(anchorMonitoringInterval);
        anchorMonitoringInterval = null;
    }
    // Réinitialiser les variables de contrôle
    isMovingInProgress = false;
    lastMoveAttemptTime = 0;
    consecutiveFailures = 0;
}

// Fonction pour déplacer l'utilisateur actuel vers un canal vocal
async function moveCurrentUserToVoiceChannel(channelId: string): Promise<void> {
    if (isMovingInProgress) {
        verboseLog(`⏸️ Déplacement déjà en cours, annulation de la nouvelle tentative`);
        return;
    }

    console.log("🚀🚀🚀 DÉPLACEMENT UTILISATEUR ACTUEL VERS CANAL 🚀🚀🚀", channelId);

    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) {
        console.error("❌❌❌ UTILISATEUR ACTUEL NON DISPONIBLE ❌❌❌");
        throw new Error("Utilisateur actuel non disponible");
    }

    isMovingInProgress = true;
    lastMoveAttemptTime = Date.now();

    try {
        console.log(`🔄 Tentative de déplacement de ${currentUser.username} vers le canal ${channelId}`);
        verboseLog(`🔄 Tentative de déplacement vers le canal ${channelId}`);

        // Vérifier qu'on est toujours ancré et que la personne est toujours dans ce canal
        if (!anchoredUserInfo) {
            verboseLog(`ℹ️ Plus ancré, annulation du déplacement`);
            isMovingInProgress = false;
            return;
        }

        const anchoredUserVoiceState = VoiceStateStore.getVoiceStateForUser(anchoredUserInfo.userId);
        if (!anchoredUserVoiceState?.channelId || anchoredUserVoiceState.channelId !== channelId) {
            verboseLog(`ℹ️ La personne ancrée n'est plus dans ce canal, annulation`);
            isMovingInProgress = false;
            return;
        }

        // Utiliser ChannelActions.selectVoiceChannel (méthode native Discord) au lieu de l'API REST
        if (!ChannelActions?.selectVoiceChannel) {
            throw new Error("ChannelActions.selectVoiceChannel n'est pas disponible");
        }

        ChannelActions.selectVoiceChannel(channelId);

        verboseLog(`✅ Commande de déplacement envoyée vers le canal ${channelId}`);

        // Attendre un peu pour vérifier que le déplacement s'est bien effectué
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Vérifier que le déplacement s'est bien effectué
        const myCurrentState = VoiceStateStore.getVoiceStateForUser(currentUser.id);
        if (myCurrentState?.channelId !== channelId) {
            throw new Error(`Le déplacement n'a pas fonctionné. Canal actuel: ${myCurrentState?.channelId}, Canal cible: ${channelId}`);
        }

        verboseLog(`✅ Déplacement vers le canal ${channelId} confirmé`);

        if (settings.store.anchorNotifications) {
            showNotification({
                title: "⚓ Antimove - Retour automatique",
                body: `Vous êtes revenu dans le salon de ${anchoredUserInfo?.username}`
            });
        }
    } catch (error: any) {
        console.error("Antimove: Erreur lors du déplacement:", error);
        throw error;
    } finally {
        // Réinitialiser le flag après un délai pour permettre au déplacement de se terminer
        setTimeout(() => {
            isMovingInProgress = false;
        }, 2000);
    }
}

// Menu contextuel pour les utilisateurs
const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: any; }) => {
    console.log("🔍🔍🔍 MENU CONTEXTUEL ANTIMOVE APPELÉ 🔍🔍🔍", user?.username || 'utilisateur inconnu');
    verboseLog(`🔍 Menu contextuel appelé pour ${user?.username || 'utilisateur inconnu'}`);

    if (!settings.store.enabled || !user) {
        console.log("❌❌❌ PLUGIN DÉSACTIVÉ OU UTILISATEUR MANQUANT ❌❌❌", { enabled: settings.store.enabled, user: !!user });
        verboseLog(`❌ Plugin désactivé ou utilisateur manquant - enabled: ${settings.store.enabled}, user: ${!!user}`);
        return;
    }

    const currentUser = UserStore.getCurrentUser();
    if (!currentUser || user.id === currentUser.id) {
        verboseLog(`❌ Utilisateur actuel manquant ou même utilisateur - currentUser: ${!!currentUser}, sameUser: ${user.id === currentUser?.id}`);
        return;
    }

    verboseLog(`✅ Menu contextuel ajouté pour ${user.username}`);

    const isCurrentlyAnchored = anchoredUserInfo?.userId === user.id;

    children.push(
        React.createElement(Menu.MenuSeparator, {}),
        React.createElement(Menu.MenuItem, {
            id: "anchor-user",
            label: isCurrentlyAnchored ? `⚓ Désancrer ${user.username}` : `⚓ Ancrer ${user.username}`,
            action: async () => {
                if (isCurrentlyAnchored) {
                    desancrerUtilisateur();
                } else {
                    await ancrerUtilisateur(user.id, user.username);
                }
            }
        })
    );
};

export default definePlugin({
    name: "Antimove",
    description: "S'ancrer à un utilisateur pour revenir automatiquement dans son salon si vous êtes déplacé",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    settings,

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!settings.store.enabled) return;

            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) return;

            const currentUserId = currentUser.id;
            const currentVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

            // Si l'utilisateur actuel n'est pas dans un canal vocal, ne rien faire
            if (!currentVoiceState?.channelId) {
                verboseLog("🔇 Vous n'êtes pas dans un canal vocal, ancrage suspendu");
                return;
            }

            // Logique d'ancrage (revenir automatiquement dans le salon de la personne ancrée)
            if (anchoredUserInfo) {
                console.log("🔍🔍🔍 ANCRAGE ACTIF - Vérification des changements de canal 🔍🔍🔍");
                verboseLog(`⚓ Ancrage actif pour ${anchoredUserInfo.username} (${anchoredUserInfo.userId})`);

                for (const voiceState of voiceStates) {
                    const { userId, channelId, oldChannelId } = voiceState;

                    // Détecter quand VOUS êtes déplacé (utilisateur actuel)
                    if (userId === currentUserId && channelId !== currentVoiceState.channelId) {
                        console.log("🚨🚨🚨 DÉPLACEMENT DÉTECTÉ - ANCRAGE EN COURS 🚨🚨🚨");
                        console.log(`Vous: ${currentUserId}, Ancien canal: ${currentVoiceState.channelId}, Nouveau canal: ${channelId}`);
                        verboseLog(`🔄 Vous avez été déplacé: ${currentVoiceState.channelId} -> ${channelId}`);

                        // Vérifier si la personne à qui vous êtes ancré est toujours dans un canal vocal
                        const anchoredUserVoiceState = VoiceStateStore.getVoiceStateForUser(anchoredUserInfo!.userId);

                        if (!anchoredUserVoiceState?.channelId) {
                            log(`🚪 ${anchoredUserInfo!.username} a quitté le canal vocal, ancrage suspendu`);
                            if (settings.store.anchorNotifications) {
                                showNotification({
                                    title: "⚓ Antimove - Suspendu",
                                    body: `${anchoredUserInfo!.username} a quitté le canal vocal`
                                });
                            }
                            continue;
                        }

                        // Si vous n'êtes pas dans le même canal que la personne ancrée
                        if (channelId !== anchoredUserVoiceState.channelId) {
                            // Vérifier si une tentative est déjà en cours ou si on est en cooldown
                            const now = Date.now();
                            const timeSinceLastAttempt = now - lastMoveAttemptTime;
                            
                            if (isMovingInProgress) {
                                verboseLog(`⏸️ Déplacement déjà en cours (flux), attente...`);
                                continue;
                            }

                            if (timeSinceLastAttempt < MOVE_COOLDOWN) {
                                verboseLog(`⏸️ Cooldown actif (flux), ${Math.ceil((MOVE_COOLDOWN - timeSinceLastAttempt) / 1000)}s restantes`);
                                continue;
                            }

                            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                                verboseLog(`🛑 Trop d'échecs consécutifs (${consecutiveFailures}), arrêt de la tentative automatique`);
                                continue;
                            }

                            log(`⚠️ Vous avez été déplacé, retour automatique vers le salon de ${anchoredUserInfo!.username}`);

                            // Attendre un délai avant de revenir dans le salon de la personne ancrée
                            setTimeout(async () => {
                                try {
                                    // Vérifier que l'utilisateur est toujours ancré
                                    const currentAnchoredState = VoiceStateStore.getVoiceStateForUser(anchoredUserInfo!.userId);
                                    const myCurrentState = VoiceStateStore.getVoiceStateForUser(currentUserId);

                                    if (!anchoredUserInfo || !currentAnchoredState?.channelId) {
                                        verboseLog("🔍 Utilisateur plus ancré ou personne ancrée plus dans un canal vocal");
                                        return;
                                    }

                                    if (myCurrentState?.channelId === currentAnchoredState.channelId) {
                                        verboseLog("✅ Vous êtes déjà dans le bon canal");
                                        consecutiveFailures = 0; // Réinitialiser le compteur en cas de succès
                                        return;
                                    }

                                    // Revenir dans le salon de la personne ancrée
                                    await moveCurrentUserToVoiceChannel(currentAnchoredState.channelId);
                                    consecutiveFailures = 0; // Réinitialiser le compteur en cas de succès

                                } catch (error: any) {
                                    consecutiveFailures++;
                                    const errorMsg = error?.body?.message || error?.message || String(error);
                                    log(`❌ Erreur lors du retour vers ${anchoredUserInfo!.username} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${errorMsg}`, "error");

                                    // Si c'est une erreur de permissions, arrêter immédiatement
                                    if (error?.status === 403 || errorMsg.includes("Permissions")) {
                                        log(`🛑 Permissions insuffisantes. Arrêt de la tentative automatique.`, "error");
                                        consecutiveFailures = MAX_CONSECUTIVE_FAILURES;
                                    }

                                    if (settings.store.anchorNotifications && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                                        showNotification({
                                            title: "⚓ Antimove - Arrêt automatique",
                                            body: `Trop d'échecs. Veuillez désancrer et réancrer pour réessayer.`
                                        });
                                    }
                                }
                            }, settings.store.anchorDelay);
                        } else {
                            // Si on est dans le bon canal, réinitialiser le compteur d'échecs
                            if (consecutiveFailures > 0) {
                                verboseLog(`✅ Retour dans le bon canal (flux), réinitialisation du compteur d'échecs`);
                                consecutiveFailures = 0;
                            }
                        }
                    }
                }
            }
        }
    },

    start() {
        console.log("🚀🚀🚀 PLUGIN ANTIMOVE DÉMARRÉ 🚀🚀🚀");
        log("🚀 Plugin Antimove démarré");
        log(`⚙️ Configuration actuelle:
- Délai d'ancrage: ${settings.store.anchorDelay}ms
- Notifications d'ancrage: ${settings.store.anchorNotifications ? "ON" : "OFF"}
- Logs verbeux: ${settings.store.verboseLogs ? "ON" : "OFF"}`);

        // Vérifier que les stores sont disponibles
        console.log("🔍 Vérification des stores:");
        console.log("- VoiceStateStore:", !!VoiceStateStore);
        console.log("- UserStore:", !!UserStore);

        // Démarrer la surveillance périodique pour l'ancrage
        console.log("🔍🔍🔍 DÉMARRAGE SURVEILLANCE ANCRAGE AU START 🔍🔍🔍");
        startAnchorMonitoring();

        if (settings.store.anchorNotifications) {
            showNotification({
                title: "⚓ Antimove activé",
                body: "Plugin d'ancrage activé - Vous reviendrez automatiquement dans le salon de la personne ancrée si vous êtes déplacé"
            });
        }
    },

    stop() {
        log("🛑 Plugin Antimove arrêté");

        // Arrêter la surveillance périodique
        stopAnchorMonitoring();

        // Désancrer l'utilisateur s'il y en a un
        if (anchoredUserInfo) {
            desancrerUtilisateur();
        }

        if (settings.store.anchorNotifications) {
            showNotification({
                title: "⚓ Antimove désactivé",
                body: "Plugin d'ancrage désactivé"
            });
        }
    }
});

