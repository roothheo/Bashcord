import definePlugin from "@utils/types";
import { ApplicationCommandInputType } from "@api/Commands";

export default definePlugin({
    name: "AntiDéconnexion",
    description: "Reconnecte automatiquement au salon vocal en cas de déconnexion forcée",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    dependencies: ["CommandsAPI"],
    start() {
        // Stocke l'ID du dernier salon vocal
        let lastVoiceChannelId: string | null = null;

        // Initialisation au démarrage
        this.onStart = () => {
            console.log("Plugin AntiDéconnexion initialisé");
        };

        // Écoute les événements de déconnexion
        this.onVoiceStateUpdate = (oldState, newState) => {
            // Si l'utilisateur est déconnecté de force
            if (oldState.channelId && !newState.channelId) {
                lastVoiceChannelId = oldState.channelId;
                
                // Tente de se reconnecter après un court délai
                setTimeout(() => {
                    if (lastVoiceChannelId) {
                        try {
                            // Tente de rejoindre le salon
                            newState.setChannel(lastVoiceChannelId);
                        } catch (error) {
                            console.error("Erreur lors de la reconnexion:", error);
                        }
                    }
                }, 1000); // Délai d'une seconde
            }
        };
    },
    stop() {
        // Nettoyage si nécessaire
        console.log("Plugin AntiDéconnexion arrêté");
    }
});
