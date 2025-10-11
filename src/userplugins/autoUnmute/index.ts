import definePlugin from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { UserStore, PermissionStore, PermissionsBits, ChannelStore } from "@webpack/common";

// Récupération des stores et actions nécessaires
const VoiceStateStore = findStoreLazy("VoiceStateStore");
const VoiceActions = findByPropsLazy("toggleSelfMute");

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

export default definePlugin({
    name: "AutoUnmute",
    description: "Démute et désourdine automatiquement quand on se fait mute/sourdine serveur si on a les permissions (sans notifications)",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],

    // Utilisation du système flux pour écouter les événements vocaux
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            // Vérification de sécurité pour l'utilisateur actuel
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) {
                console.warn("[AutoUnmute] Utilisateur actuel non disponible");
                return;
            }

            const currentUserId = currentUser.id;

            // Traitement de chaque changement d'état vocal
            for (const state of voiceStates) {
                const { userId, channelId, guildId, mute, selfMute, deaf, selfDeaf } = state;

                // On ne s'intéresse qu'aux événements de l'utilisateur actuel
                if (userId !== currentUserId) continue;

                // Vérifier si on est dans un salon vocal
                if (!channelId || !guildId) continue;

                // Vérifier les permissions
                const channel = ChannelStore.getChannel(channelId);
                if (!channel) {
                    console.warn("[AutoUnmute] Canal non trouvé");
                    continue;
                }

                // Vérifier si on a été mute par le serveur (pas par soi-même)
                if (mute && !selfMute) {
                    console.log(`[AutoUnmute] Mute serveur détecté pour l'utilisateur ${currentUserId} dans le salon ${channelId}`);

                    // Vérifier si on a la permission MUTE_MEMBERS
                    const hasMutePermission = PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel);

                    if (hasMutePermission) {
                        console.log(`[AutoUnmute] Permission MUTE_MEMBERS détectée, démute automatique en cours...`);

                        // Démute automatiquement sans notification
                        setTimeout(() => {
                            try {
                                // Utiliser toggleSelfMute pour se démute
                                VoiceActions.toggleSelfMute();
                                console.log(`[AutoUnmute] Démute automatique effectué avec succès`);
                            } catch (error) {
                                console.error("[AutoUnmute] Erreur lors du démute automatique:", error);
                            }
                        }, 100); // Petit délai pour éviter les conflits
                    } else {
                        console.log(`[AutoUnmute] Pas de permission MUTE_MEMBERS, pas de démute automatique`);
                    }
                }

                // Vérifier si on a été sourdine par le serveur (pas par soi-même)
                if (deaf && !selfDeaf) {
                    console.log(`[AutoUnmute] Sourdine serveur détectée pour l'utilisateur ${currentUserId} dans le salon ${channelId}`);

                    // Vérifier si on a la permission DEAFEN_MEMBERS
                    const hasDeafenPermission = PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel);

                    if (hasDeafenPermission) {
                        console.log(`[AutoUnmute] Permission DEAFEN_MEMBERS détectée, désourdine automatique en cours...`);

                        // Désourdine automatiquement sans notification
                        setTimeout(() => {
                            try {
                                // Utiliser toggleSelfDeaf pour se désourdine
                                VoiceActions.toggleSelfDeaf();
                                console.log(`[AutoUnmute] Désourdine automatique effectué avec succès`);
                            } catch (error) {
                                console.error("[AutoUnmute] Erreur lors du désourdine automatique:", error);
                            }
                        }, 100); // Petit délai pour éviter les conflits
                    } else {
                        console.log(`[AutoUnmute] Pas de permission DEAFEN_MEMBERS, pas de désourdine automatique`);
                    }
                }
            }
        }
    },

    start() {
        console.log("[AutoUnmute] Plugin AutoUnmute initialisé");

        // Vérification que les stores sont disponibles
        if (!VoiceStateStore || !VoiceActions || !UserStore || !PermissionStore) {
            console.error("[AutoUnmute] Erreur : Stores Discord non disponibles");
            return;
        }
    },

    stop() {
        console.log("[AutoUnmute] Plugin AutoUnmute arrêté");
    }
});
