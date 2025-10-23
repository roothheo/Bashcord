/*
 * Bashcord Plugin - Welcome Notification
 * Affiche une notification de bienvenue avec invitation au serveur Discord
 */

import { Settings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const settings = Settings.plugins.WelcomeNotification = {
    hasShownWelcome: false
};

export default definePlugin({
    name: "WelcomeNotification",
    description: "Affiche une notification de bienvenue avec invitation au serveur Discord Bashcord",
    authors: [Devs.Ven], // Utilise un auteur existant
    
    start() {
        // Vérifier si c'est la première fois
        if (settings.hasShownWelcome) return;
        
        // Attendre que Discord soit prêt
        setTimeout(() => {
            showNotification({
                title: "🎉 Bienvenue sur Bashcord !",
                body: "Rejoignez notre serveur Discord pour obtenir de l'aide, des mises à jour et partager vos créations !",
                permanent: true,
                onClick: () => {
                    // Ouvrir le lien d'invitation
                    window.open("https://discord.gg/GxbcPKKCnS", "_blank");
                }
            });
            
            // Marquer comme affiché
            settings.hasShownWelcome = true;
        }, 3000); // Attendre 3 secondes après le démarrage
    }
});
