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

        // Patch de la fonction updateSetting pour modifier les objets directement
        const originalUpdateSetting = SettingsStore.updateSetting;
        SettingsStore.updateSetting = function(section, key, value) {
            // Modifier les valeurs avant de les sauvegarder
            let modifiedValue = value;
            if (key === 'label') {
                if (value === 'Bashcord' || value === currentMainLabel) {
                    modifiedValue = currentMainLabel;
                } else if (value === 'Bashplugins' || value === currentCategoryName) {
                    modifiedValue = currentCategoryName;
                }
            }

            return originalUpdateSetting.call(this, section, key, modifiedValue);
        };

        debugLog("SettingsStore patché pour intercepter et modifier les paramètres");

    } catch (error) {
        debugLog(`Erreur lors du patch SettingsStore: ${error}`);
    }
}

// Fonction pour patcher directement les objets de configuration des paramètres
function patchSettingsConfig() {
    try {
        // Trouver les modules de paramètres
        const settingsModules = [
            findByPropsLazy("getSettingsCategories"),
            findByPropsLazy("settings", "categories"),
            findByPropsLazy("SETTINGS_CATEGORIES")
        ];

        settingsModules.forEach(module => {
            if (!module) return;

            // Patcher les catégories de paramètres
            if (module.getSettingsCategories) {
                const originalGetSettingsCategories = module.getSettingsCategories;
                module.getSettingsCategories = function() {
                    const categories = originalGetSettingsCategories.call(this);
                    return patchCategoriesObject(categories);
                };
                debugLog("getSettingsCategories patché");
            }

            // Patcher les objets de catégories directement
            if (module.categories) {
                module.categories = patchCategoriesObject(module.categories);
                debugLog("Objet categories patché");
            }

            // Patcher les constantes de catégories
            if (module.SETTINGS_CATEGORIES) {
                module.SETTINGS_CATEGORIES = patchCategoriesObject(module.SETTINGS_CATEGORIES);
                debugLog("SETTINGS_CATEGORIES patché");
            }
        });

    } catch (error) {
        debugLog(`Erreur lors du patch des configurations: ${error}`);
    }
}

// Fonction pour patcher un objet de catégories de paramètres
function patchCategoriesObject(categories: any): any {
    if (!categories || typeof categories !== 'object') return categories;

    const patched = { ...categories };

    // Parcourir toutes les propriétés de l'objet
    Object.keys(patched).forEach(key => {
        const category = patched[key];

        if (category && typeof category === 'object') {
            // Patcher les labels
            if (category.label === 'Bashcord') {
                category.label = currentMainLabel;
                debugLog(`Catégorie ${key} label patché: Bashcord -> ${currentMainLabel}`);
            } else if (category.label === 'Bashplugins') {
                category.label = currentCategoryName;
                debugLog(`Catégorie ${key} label patché: Bashplugins -> ${currentCategoryName}`);
            }

            // Patcher les searchableTitles
            if (category.searchableTitles && Array.isArray(category.searchableTitles)) {
                category.searchableTitles = category.searchableTitles.map(title =>
                    title === 'Bashplugins' ? currentCategoryName :
                    title === 'Bashcord' ? currentMainLabel : title
                );
            }

            // Patcher les sections
            if (category.section) {
                if (category.section === 'BashcordPlugins') {
                    category.section = `${currentMainLabel}Plugins`;
                } else if (category.section === 'BashcordThemes') {
                    category.section = `${currentMainLabel}Themes`;
                } else if (category.section === 'BashcordUpdater') {
                    category.section = `${currentMainLabel}Updater`;
                } else if (category.section === 'BashcordCloud') {
                    category.section = `${currentMainLabel}Cloud`;
                }
            }

            // Patcher récursivement les sous-objets
            if (category.settings && typeof category.settings === 'object') {
                category.settings = patchCategoriesObject(category.settings);
            }
        }
    });

    return patched;
}

// Fonction pour patcher les listes de plugins
function patchPluginLists() {
    try {
        // Trouver les modules de plugins
        const pluginModules = [
            findByPropsLazy("getAllPlugins", "plugins"),
            findByPropsLazy("getPluginList"),
            findByPropsLazy("PLUGINS")
        ];

        pluginModules.forEach(module => {
            if (!module) return;

            // Patcher getAllPlugins
            if (module.getAllPlugins) {
                const originalGetAllPlugins = module.getAllPlugins;
                module.getAllPlugins = function() {
                    const plugins = originalGetAllPlugins.call(this);
                    return patchPluginObject(plugins);
                };
                debugLog("getAllPlugins patché");
            }

            // Patcher getPluginList
            if (module.getPluginList) {
                const originalGetPluginList = module.getPluginList;
                module.getPluginList = function() {
                    const plugins = originalGetPluginList.call(this);
                    return patchPluginObject(plugins);
                };
                debugLog("getPluginList patché");
            }

            // Patcher l'objet PLUGINS directement
            if (module.PLUGINS) {
                module.PLUGINS = patchPluginObject(module.PLUGINS);
                debugLog("Objet PLUGINS patché");
            }

            // Patcher l'objet plugins directement
            if (module.plugins) {
                module.plugins = patchPluginObject(module.plugins);
                debugLog("Objet plugins patché");
            }
        });

    } catch (error) {
        debugLog(`Erreur lors du patch des plugins: ${error}`);
    }
}

// Fonction pour patcher un objet de plugins
function patchPluginObject(plugins: any): any {
    if (!plugins || typeof plugins !== 'object') return plugins;

    const patched = { ...plugins };

    // Parcourir tous les plugins
    Object.keys(patched).forEach(pluginKey => {
        const plugin = patched[pluginKey];

        if (plugin && typeof plugin === 'object') {
            // Patcher le nom du plugin
            if (plugin.name && typeof plugin.name === 'string') {
                // Ici on peut ajouter des règles personnalisées pour renommer les plugins
                // Par exemple, remplacer "Bashcord" dans les noms de plugins
                if (plugin.name.includes('Bashcord')) {
                    plugin.name = plugin.name.replace(/Bashcord/g, currentMainLabel);
                    debugLog(`Plugin ${pluginKey} renommé: ${plugin.name}`);
                }
            }

            // Patcher la description
            if (plugin.description && typeof plugin.description === 'string') {
                if (plugin.description.includes('Bashcord')) {
                    plugin.description = plugin.description.replace(/Bashcord/g, currentMainLabel);
                    debugLog(`Description du plugin ${pluginKey} modifiée`);
                }
            }

            // Patcher les auteurs
            if (plugin.authors && Array.isArray(plugin.authors)) {
                plugin.authors = plugin.authors.map(author => {
                    if (author && typeof author === 'object' && author.name) {
                        if (author.name === 'Bashcord') {
                            return { ...author, name: currentMainLabel };
                        }
                    }
                    return author;
                });
            }
        }
    });

    return patched;
}

// Fonction pour forcer la mise à jour des paramètres
function forceSettingsRefresh() {
    try {
        // Dispatcher un événement de mise à jour des paramètres
        const FluxDispatcher = findByPropsLazy("dispatch", "register");
        if (FluxDispatcher) {
            FluxDispatcher.dispatch({
                type: "USER_SETTINGS_UPDATE",
                settings: {}
            });
            debugLog("Événement USER_SETTINGS_UPDATE dispatché");
        }

        // Forcer un re-render des composants de paramètres
        const React = findByPropsLazy("createElement", "Component");
        if (React && window.location) {
            // Simuler un changement d'URL pour forcer un re-render
            const currentUrl = window.location.href;
            window.history.replaceState({}, '', currentUrl + '#refresh');
            window.history.replaceState({}, '', currentUrl);
            debugLog("Re-render forcé via history API");
        }

    } catch (error) {
        debugLog(`Erreur lors du refresh forcé: ${error}`);
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
    description: "Masque et remplace complètement les références à Bashcord dans les objets de configuration, plugins et interface",
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

        // Patcher les configurations de paramètres directement
        patchSettingsConfig();

        // Patcher les listes de plugins
        patchPluginLists();

        // Forcer un refresh des paramètres
        forceSettingsRefresh();

        debugLog("Masquage initialisé avec succès - objets et plugins patchés directement");
    }
});

