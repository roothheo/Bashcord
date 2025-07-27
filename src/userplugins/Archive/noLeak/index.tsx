/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    customName: {
        type: OptionType.STRING,
        description: "Nom personnalisé à afficher à la place de Bashcord",
        default: "MonCord"
    }
});

export default definePlugin({
    name: "noLeak",
    description: "Remplace 'Bashcord' par un nom personnalisé dans les paramètres en temps réel",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    settings,

    start() {
        console.log(`[noLeak] Plugin démarré - Remplacement de "Bashcord" par "${this.getCustomName()}"`);

        // Démarrer le remplacement en temps réel
        this.startReplacement();

        // Observer les changements de paramètres
        this.observer = new MutationObserver(() => {
            this.replaceInSettings();
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    },

    stop() {
        console.log("[noLeak] Plugin arrêté");
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    },

    getCustomName() {
        return settings.store.customName || "MonCord";
    },

    startReplacement() {
        // Remplacer immédiatement
        this.replaceInSettings();

        // Puis toutes les 500ms pour être sûr
        this.intervalId = setInterval(() => {
            this.replaceInSettings();
        }, 500);
    },

    replaceInSettings() {
        const customName = this.getCustomName();

        // Cibler spécifiquement les éléments des paramètres Bashcord
        const settingsSelectors = [
            // Headers et titres
            'h2:contains("Bashcord")',
            'h3:contains("Bashcord")',
            'h5:contains("Bashcord")',
            // Labels et textes
            '[class*="vc-settings"] *:contains("Bashcord")',
            '[class*="vc-"] *:contains("Bashcord")',
            // Éléments de formulaire
            'label:contains("Bashcord")',
            'span:contains("Bashcord")',
            'div:contains("Bashcord")'
        ];

        // Fonction pour remplacer le texte dans un nœud
        const replaceTextInNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent && node.textContent.includes("Bashcord")) {
                    node.textContent = node.textContent.replace(/Bashcord/g, customName);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Vérifier les attributs
                if (node.title && node.title.includes("Bashcord")) {
                    node.title = node.title.replace(/Bashcord/g, customName);
                }
                if (node.placeholder && node.placeholder.includes("Bashcord")) {
                    node.placeholder = node.placeholder.replace(/Bashcord/g, customName);
                }

                // Parcourir les enfants
                for (let child of node.childNodes) {
                    replaceTextInNode(child);
                }
            }
        };

        // Cibler spécifiquement la div header "Bashcord"
        const bashcordHeaders = document.querySelectorAll('.eyebrow_cf4812.headerText_b3f026[data-text-variant="eyebrow"]');
        bashcordHeaders.forEach(header => {
            if (header.textContent && header.textContent.includes("Bashcord")) {
                header.textContent = header.textContent.replace(/Bashcord/g, customName);
            }
        });

        // Chercher dans les sections de paramètres spécifiquement
        const settingsSections = document.querySelectorAll('[class*="vc-"], [class*="settings"], [role="tabpanel"], [class*="eyebrow"], [class*="headerText"]');

        settingsSections.forEach(section => {
            const walker = document.createTreeWalker(
                section,
                NodeFilter.SHOW_TEXT
            );

            const textNodes: Text[] = [];
            let node: Node | null;
            while (node = walker.nextNode()) {
                if (node.textContent && node.textContent.includes("Bashcord")) {
                    textNodes.push(node as Text);
                }
            }

            textNodes.forEach(textNode => {
                if (textNode.textContent) {
                    textNode.textContent = textNode.textContent.replace(/Bashcord/g, customName);
                }
            });
        });

        // Remplacer aussi dans les éléments avec des attributs spécifiques
        const elementsWithBashcord = document.querySelectorAll('[title*="Bashcord"], [aria-label*="Bashcord"], [placeholder*="Bashcord"]');
        elementsWithBashcord.forEach(element => {
            const htmlElement = element as HTMLElement;
            if (htmlElement.title) {
                htmlElement.title = htmlElement.title.replace(/Bashcord/g, customName);
            }
            const ariaLabel = element.getAttribute('aria-label');
            if (ariaLabel) {
                element.setAttribute('aria-label',
                    ariaLabel.replace(/Bashcord/g, customName)
                );
            }
            const inputElement = element as HTMLInputElement;
            if (inputElement.placeholder) {
                inputElement.placeholder = inputElement.placeholder.replace(/Bashcord/g, customName);
            }
        });
    }
}); 