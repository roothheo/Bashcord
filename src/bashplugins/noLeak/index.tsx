/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { findByPropsLazy } from "@webpack";

const settings = definePluginSettings({
    categoryName: {
        type: OptionType.STRING,
        description: "Nom de remplacement pour 'Bashplugins'",
        default: "Plugins"
    },
    mainLabel: {
        type: OptionType.STRING,
        description: "Nom de remplacement pour 'Bashcord'",
        default: "Vencord"
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode débogage",
        default: false
    }
});

// Variables pour stocker les noms actuels
let currentMainLabel = "Vencord";
let currentCategoryName = "Plugins";

function debugLog(message: string) {
    if (settings.store.debugMode) {
        console.log(`[NoLeak] ${message}`);
    }
}

// Fonction pour mettre à jour les noms depuis les paramètres
function updateNames() {
    currentMainLabel = settings.store.mainLabel || "Vencord";
    currentCategoryName = settings.store.categoryName || "Plugins";
    debugLog(`Noms mis à jour: Main="${currentMainLabel}", Category="${currentCategoryName}"`);
}

// Fonction pour masquer les éléments DOM contenant "Bashcord" ou "Bashplugins"
function hideBashcordReferences() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as Element;

                    // Rechercher tous les éléments texte
                    const textElements = element.querySelectorAll('*');
                    textElements.forEach(el => {
                        if (el.textContent?.includes('Bashcord')) {
                            el.textContent = el.textContent.replace(/Bashcord/g, currentMainLabel);
                            debugLog(`DOM modifié: Bashcord -> ${currentMainLabel}`);
                        }
                        if (el.textContent?.includes('Bashplugins')) {
                            el.textContent = el.textContent.replace(/Bashplugins/g, currentCategoryName);
                            debugLog(`DOM modifié: Bashplugins -> ${currentCategoryName}`);
                        }
                    });

                    // Vérifier aussi l'élément lui-même
                    if (element.textContent?.includes('Bashcord')) {
                        element.textContent = element.textContent.replace(/Bashcord/g, currentMainLabel);
                        debugLog(`DOM modifié: Bashcord -> ${currentMainLabel}`);
                    }
                    if (element.textContent?.includes('Bashplugins')) {
                        element.textContent = element.textContent.replace(/Bashplugins/g, currentCategoryName);
                        debugLog(`DOM modifié: Bashplugins -> ${currentCategoryName}`);
                    }
                }
            });
        });
    });

    // Observer tout le document
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    debugLog("Observateur DOM configuré pour masquer les références");
    return observer;
}

// Fonction pour patcher les objets de paramètres au runtime
function patchSettingsObject() {
    try {
        // Trouver le store des paramètres
        const SettingsStore = findByPropsLazy("settings", "getSetting", "updateSetting");
        if (!SettingsStore) {
            debugLog("SettingsStore non trouvé");
            return;
        }

        // Patch de la fonction getSetting pour intercepter les demandes
        const originalGetSetting = SettingsStore.getSetting;
        SettingsStore.getSetting = function (section, key, defaultValue) {
            const result = originalGetSetting.call(this, section, key, defaultValue);

            // Intercepter les clés liées aux labels
            if (key === 'label' && (result === 'Bashcord' || result === 'Bashplugins')) {
                const replacement = result === 'Bashcord' ? currentMainLabel : currentCategoryName;
                debugLog(`Paramètre intercepté: ${result} -> ${replacement}`);
                return replacement;
            }

            return result;
        };

        debugLog("SettingsStore patché pour intercepter les demandes");

    } catch (error) {
        debugLog(`Erreur lors du patch SettingsStore: ${error}`);
    }
}

// Fonction pour scanner et modifier les éléments existants
function scanAndReplaceExistingElements() {
    const elements = document.querySelectorAll('*');
    let modified = 0;

    elements.forEach(element => {
        if (element.textContent?.includes('Bashcord')) {
            element.textContent = element.textContent.replace(/Bashcord/g, currentMainLabel);
            modified++;
        }
        if (element.textContent?.includes('Bashplugins')) {
            element.textContent = element.textContent.replace(/Bashplugins/g, currentCategoryName);
            modified++;
        }
    });

    debugLog(`${modified} éléments DOM modifiés lors du scan initial`);
}

export default definePlugin({
    name: "No Leak",
    description: "Masque les références à Bashcord en remplaçant les noms dans l'interface",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    patches: [
        {
            // Patch minimal pour s'assurer que le plugin se charge
            find: "console.log",
            replacement: {
                match: /console\.log\("([^"]*)"\)/,
                replace: 'console.log("$1 [NoLeak Active]")'
            }
        }
    ],

    start() {
        console.log("[NoLeak] Plugin démarré - Masquage des références Bashcord activé");

        // Mettre à jour les noms depuis les paramètres
        updateNames();

        debugLog("Configuration:");
        debugLog(`  - Main label: "${currentMainLabel}"`);
        debugLog(`  - Category: "${currentCategoryName}"`);

        // Attendre que le DOM soit prêt
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeHiding();
            });
        } else {
            this.initializeHiding();
        }
    },

    stop() {
        console.log("[NoLeak] Plugin arrêté");

        // Restaurer les noms par défaut (mais ils resteront cachés jusqu'au redémarrage)
        currentMainLabel = "Bashcord";
        currentCategoryName = "Bashplugins";

        debugLog("Plugin arrêté - références restaurées");
    },

    initializeHiding() {
        debugLog("Initialisation du masquage...");

        // Scanner et remplacer les éléments existants
        scanAndReplaceExistingElements();

        // Configurer l'observateur DOM
        this.domObserver = hideBashcordReferences();

        // Patcher les objets de paramètres
        patchSettingsObject();

        debugLog("Masquage initialisé avec succès");
    }
});

