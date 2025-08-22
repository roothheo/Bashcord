import definePlugin from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { UserStore, FluxDispatcher } from "@webpack/common";

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

// Variables pour détecter les déconnexions volontaires
let isVoluntaryDisconnect = false;
let disconnectTimeout: NodeJS.Timeout | null = null;
let lastChannelId: string | null = null;
let isChannelSwitching = false;
let switchTimeout: NodeJS.Timeout | null = null;

// Fonction pour marquer une déconnexion comme volontaire
function markVoluntaryDisconnect() {
    isVoluntaryDisconnect = true;
    console.log("[AntiDéco] Déconnexion volontaire marquée");
    // Reset le flag après un court délai
    if (disconnectTimeout) clearTimeout(disconnectTimeout);
    disconnectTimeout = setTimeout(() => {
        isVoluntaryDisconnect = false;
        console.log("[AntiDéco] Flag de déconnexion volontaire reseté");
    }, 2000);
}

// Fonction pour marquer un changement de canal
function markChannelSwitch() {
    isChannelSwitching = true;
    console.log("[AntiDéco] Changement de canal en cours");
    if (switchTimeout) clearTimeout(switchTimeout);
    switchTimeout = setTimeout(() => {
        isChannelSwitching = false;
        console.log("[AntiDéco] Flag de changement de canal reseté");
    }, 3000); // Plus long pour les changements de canal
}

export default definePlugin({
    name: "AntiDéconnexion",
    description: "Reconnecte automatiquement au salon vocal en cas de déconnexion forcée",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],

    // Utilisation du système flux pour écouter les événements vocaux
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const currentUserId = UserStore.getCurrentUser().id;

            // Traitement de chaque changement d'état vocal
            for (const state of voiceStates) {
                const { userId, channelId, oldChannelId } = state;

                // On ne s'intéresse qu'aux événements de l'utilisateur actuel
                if (userId !== currentUserId) continue;

                // Stocker le canal actuel pour la prochaine fois
                if (channelId) {
                    lastChannelId = channelId;
                }

                // Détection d'une déconnexion :
                // L'utilisateur était dans un salon (oldChannelId existe)
                // mais n'est plus dans aucun salon (channelId est null/undefined)
                if (oldChannelId && !channelId) {
                    // Vérifier si c'est une déconnexion volontaire
                    if (isVoluntaryDisconnect) {
                        console.log(`[AntiDéco] Déconnexion volontaire détectée, pas de reconnexion`);
                        isVoluntaryDisconnect = false; // Reset le flag
                        continue;
                    }

                    // Vérifier si c'est un changement de canal en cours
                    if (isChannelSwitching) {
                        console.log(`[AntiDéco] Changement de canal détecté, pas de reconnexion`);
                        continue;
                    }

                    // Attendre un peu pour voir si un nouveau canal est sélectionné (changement rapide)
                    setTimeout(() => {
                        const currentState = VoiceStateStore.getVoiceStateForUser(currentUserId);

                        // Si l'utilisateur est maintenant dans un autre canal, c'était un changement
                        if (currentState?.channelId) {
                            console.log(`[AntiDéco] Changement de canal détecté (${oldChannelId} -> ${currentState.channelId}), pas de reconnexion`);
                            return;
                        }

                        // Si on arrive ici, c'est vraiment une déconnexion forcée
                        console.log(`[AntiDéco] Déconnexion FORCÉE confirmée du salon ${oldChannelId}`);

                        // Tentative de reconnexion
                        setTimeout(() => {
                            try {
                                console.log(`[AntiDéco] Tentative de reconnexion au salon ${oldChannelId}`);
                                ChannelActions.selectVoiceChannel(oldChannelId);
                            } catch (error) {
                                console.error("[AntiDéco] Erreur lors de la reconnexion:", error);
                            }
                        }, 100);

                    }, 100); // Attendre 100ms pour détecter les changements rapides
                }
            }
        },

        // Écouter les actions de déconnexion volontaire
        VOICE_CHANNEL_SELECT({ channelId }: { channelId: string | null; }) {
            const currentUserId = UserStore.getCurrentUser().id;
            const currentVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

            if (currentVoiceState?.channelId) {
                if (channelId === null) {
                    // Déconnexion volontaire
                    console.log("[AntiDéco] Action de déconnexion volontaire détectée via VOICE_CHANNEL_SELECT");
                    markVoluntaryDisconnect();
                } else if (channelId !== currentVoiceState.channelId) {
                    // Changement de canal
                    console.log(`[AntiDéco] Changement de canal détecté via VOICE_CHANNEL_SELECT (${currentVoiceState.channelId} -> ${channelId})`);
                    markChannelSwitch();
                }
            }
        }
    },

    // Expose les fonctions pour usage externe si nécessaire
    markVoluntaryDisconnect,
    markChannelSwitch,

    start() {
        console.log("[AntiDéco] Plugin AntiDéconnexion initialisé");

        // Écouter les événements de clic sur le bouton de déconnexion
        const originalSelectVoiceChannel = ChannelActions.selectVoiceChannel;
        ChannelActions.selectVoiceChannel = function (channelId: string | null) {
            const currentUserId = UserStore.getCurrentUser().id;
            const currentVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

            if (currentVoiceState?.channelId) {
                if (channelId === null) {
                    // Déconnexion volontaire
                    console.log("[AntiDéco] Déconnexion volontaire interceptée via selectVoiceChannel");
                    markVoluntaryDisconnect();
                } else if (channelId !== currentVoiceState.channelId) {
                    // Changement de canal
                    console.log(`[AntiDéco] Changement de canal intercepté via selectVoiceChannel (${currentVoiceState.channelId} -> ${channelId})`);
                    markChannelSwitch();
                }
            }

            return originalSelectVoiceChannel.call(this, channelId);
        };
    },

    stop() {
        console.log("[AntiDéco] Plugin AntiDéconnexion arrêté");
        if (disconnectTimeout) {
            clearTimeout(disconnectTimeout);
            disconnectTimeout = null;
        }
        if (switchTimeout) {
            clearTimeout(switchTimeout);
            switchTimeout = null;
        }
        isVoluntaryDisconnect = false;
        isChannelSwitching = false;
        lastChannelId = null;
    }
});
