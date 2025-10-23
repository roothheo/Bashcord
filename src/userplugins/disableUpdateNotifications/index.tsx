/*
 * Bashcord Plugin - Disable Update Notifications
 * Désactive les notifications d'update gênantes tout en gardant l'updater fonctionnel
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "DisableUpdateNotifications",
    description: "Désactive les notifications d'update gênantes tout en gardant l'updater fonctionnel",
    authors: [Devs.Ven], // Utilise un auteur existant
    
    patches: [
        {
            find: "runUpdateCheck",
            replacement: [
                {
                    match: /async function runUpdateCheck\(\)\s*{[\s\S]*?}/,
                    replace: `async function runUpdateCheck() {
    // Fonction désactivée par DisableUpdateNotifications
    // L'updater reste fonctionnel via l'interface des paramètres
    return;
}`
                }
            ]
        }
    ]
});
