/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { addMessagePreSendListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { React, useState } from "@webpack/common";

interface WordData {
    count: number;
    lastUsed: number;
}

interface PhraseData {
    phrase: string;
    count: number;
    lastUsed: number;
    contexts: string[];
}

const STORAGE_KEY = "AutoCompletion_Words";
const PHRASE_STORAGE_KEY = "AutoCompletion_Phrases";

// Configuration
const MIN_WORD_LENGTH = 3;
const MIN_PHRASE_LENGTH = 10;
const MAX_SUGGESTIONS = 8;
const SUGGESTION_THRESHOLD = 2;

let wordFrequency: Record<string, WordData> = {};
let phraseFrequency: Record<string, PhraseData> = {};
let messageSendListener: any;
let isAutoCompleteVisible = false;
let currentSuggestions: string[] = [];

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer l'autocomplétion intelligente",
        default: true,
    },
    minOccurrences: {
        type: OptionType.NUMBER,
        description: "Nombre minimum d'occurrences pour suggérer un mot",
        default: 3,
    },
    maxSuggestions: {
        type: OptionType.NUMBER,
        description: "Nombre maximum de suggestions à afficher",
        default: 5,
    },
    learnFromAllMessages: {
        type: OptionType.BOOLEAN,
        description: "Apprendre des messages reçus (pas seulement les vôtres)",
        default: false,
    },
    suggestPhrases: {
        type: OptionType.BOOLEAN,
        description: "Suggérer des phrases complètes",
        default: true,
    },
    showPreview: {
        type: OptionType.BOOLEAN,
        description: "Afficher un aperçu des suggestions",
        default: true,
    },
});

// Charger les données
async function loadData() {
    try {
        const data = await DataStore.get(STORAGE_KEY);
        if (data) {
            wordFrequency = data;
            console.log("[AutoCompletion] Données chargées:", Object.keys(wordFrequency).length, "mots");
        }
    } catch (error) {
        console.error("[AutoCompletion] Erreur chargement:", error);
    }
}

// Sauvegarder les données
async function saveData() {
    try {
        await DataStore.set(STORAGE_KEY, wordFrequency);
        console.log("[AutoCompletion] Données sauvegardées:", Object.keys(wordFrequency).length, "mots");
    } catch (error) {
        console.error("[AutoCompletion] Erreur sauvegarde:", error);
    }
}

// Nettoyer et traiter le texte
function cleanText(text: string): string {
    return text.toLowerCase()
        .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Extraire les mots d'un texte
function extractWords(text: string): string[] {
    const cleaned = cleanText(text);
    return cleaned.split(" ").filter(word => word.length >= MIN_WORD_LENGTH);
}

// Extraire les phrases d'un texte
function extractPhrases(text: string): string[] {
    const cleaned = cleanText(text);
    if (cleaned.length < MIN_PHRASE_LENGTH) return [];

    const phrases: string[] = [];
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > MIN_PHRASE_LENGTH);

    sentences.forEach(sentence => {
        sentence = sentence.trim();
        if (sentence.length >= MIN_PHRASE_LENGTH) {
            phrases.push(sentence);

            // Extraire aussi des sous-phrases
            const words = sentence.split(" ");
            for (let i = 0; i < words.length - 2; i++) {
                for (let j = i + 3; j <= words.length && j <= i + 8; j++) {
                    const subPhrase = words.slice(i, j).join(" ");
                    if (subPhrase.length >= MIN_PHRASE_LENGTH) {
                        phrases.push(subPhrase);
                    }
                }
            }
        }
    });

    return phrases;
}

// Apprendre des mots
function learnFromMessage(content: string) {
    if (!settings.store.enabled || !content) return;

    console.log("[AutoCompletion] Apprentissage du message:", content);

    const words = content.toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .split(" ")
        .filter(word => word.length >= 3);

    const now = Date.now();
    let newWordsLearned = 0;

    words.forEach(word => {
        if (!wordFrequency[word]) {
            wordFrequency[word] = { count: 0, lastUsed: 0 };
            newWordsLearned++;
        }
        wordFrequency[word].count++;
        wordFrequency[word].lastUsed = now;
    });

    console.log("[AutoCompletion] Mots traités:", words.length, "nouveaux:", newWordsLearned);
    saveData();
}

// Obtenir des suggestions pour un texte partiel
function getSuggestions(input: string): string[] {
    if (!settings.store.enabled || input.length < 2) return [];

    const suggestions: Array<{ text: string; score: number; type: 'word' | 'phrase'; }> = [];
    const inputLower = input.toLowerCase();
    const words = inputLower.split(" ");
    const lastWord = words[words.length - 1];

    // Suggestions de mots
    Object.entries(wordFrequency).forEach(([word, data]) => {
        if (data.count >= settings.store.minOccurrences && word.startsWith(lastWord)) {
            const recencyBonus = Math.max(0, 1 - (Date.now() - data.lastUsed) / (1000 * 60 * 60 * 24 * 30)); // 30 jours
            const score = data.count * (1 + recencyBonus);
            suggestions.push({ text: word, score, type: 'word' });
        }
    });

    // Suggestions de phrases si activé
    if (settings.store.suggestPhrases && input.length >= 5) {
        Object.entries(phraseFrequency).forEach(([phrase, data]) => {
            if (data.count >= SUGGESTION_THRESHOLD) {
                // Vérifier si la phrase commence par l'input ou contient les mots clés
                const phraseWords = phrase.split(" ");
                const matchesStart = phrase.startsWith(inputLower);
                const containsWords = words.every(word =>
                    word.length >= 3 && phraseWords.some(pw => pw.includes(word))
                );

                if (matchesStart || containsWords) {
                    const recencyBonus = Math.max(0, 1 - (Date.now() - data.lastUsed) / (1000 * 60 * 60 * 24 * 30));
                    const contextBonus = data.contexts.some(ctx => ctx.includes(inputLower)) ? 1.5 : 1;
                    const score = (data.count * 2) * (1 + recencyBonus) * contextBonus; // Les phrases ont plus de poids
                    suggestions.push({ text: phrase, score, type: 'phrase' });
                }
            }
        });
    }

    // Trier par score et retourner les meilleures suggestions
    return suggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, settings.store.maxSuggestions)
        .map(s => s.text);
}

// Créer l'interface de suggestions
function createSuggestionInterface() {
    const existingInterface = document.querySelector('.vc-autocompletion-interface');
    if (existingInterface) {
        existingInterface.remove();
    }

    const interface_ = document.createElement('div');
    interface_.className = 'vc-autocompletion-interface';
    interface_.innerHTML = `
        <div class="vc-autocompletion-suggestions"></div>
        <div class="vc-autocompletion-help">
            <span>Tab/Entrée pour compléter • Échap pour fermer • ↑↓ pour naviguer</span>
        </div>
    `;

    document.body.appendChild(interface_);
    return interface_;
}

// Afficher les suggestions
function showSuggestions(input: string, textArea: HTMLElement) {
    const suggestions = getSuggestions(input);
    currentSuggestions = suggestions;

    if (suggestions.length === 0) {
        hideSuggestions();
        return;
    }

    const interface_ = createSuggestionInterface();
    const suggestionsContainer = interface_.querySelector('.vc-autocompletion-suggestions');

    if (suggestionsContainer) {
        suggestionsContainer.innerHTML = '';

        suggestions.forEach((suggestion, index) => {
            const suggestionEl = document.createElement('div');
            suggestionEl.className = `vc-autocompletion-suggestion ${index === 0 ? 'selected' : ''}`;
            suggestionEl.textContent = suggestion;
            suggestionEl.addEventListener('click', () => applySuggestion(suggestion, input));
            suggestionsContainer.appendChild(suggestionEl);
        });

        // Positionner l'interface près de la zone de texte
        const rect = textArea.getBoundingClientRect();
        interface_.style.left = `${rect.left}px`;
        interface_.style.top = `${rect.top - interface_.offsetHeight - 10}px`;
        interface_.style.width = `${Math.max(300, rect.width)}px`;
    }

    isAutoCompleteVisible = true;
}

// Masquer les suggestions
function hideSuggestions() {
    const interface_ = document.querySelector('.vc-autocompletion-interface');
    if (interface_) {
        interface_.remove();
    }
    isAutoCompleteVisible = false;
    currentSuggestions = [];
}

// Appliquer une suggestion
function applySuggestion(suggestion: string, currentInput: string) {
    const words = currentInput.split(" ");

    if (suggestion.includes(" ")) {
        // C'est une phrase - remplacer tout l'input
        insertTextIntoChatInputBox(suggestion + " ");
    } else {
        // C'est un mot - remplacer le dernier mot
        words[words.length - 1] = suggestion;
        insertTextIntoChatInputBox(words.join(" ") + " ");
    }

    hideSuggestions();
}

// Gestion des événements clavier
function handleKeyDown(event: KeyboardEvent) {
    if (!isAutoCompleteVisible) return;

    const selectedSuggestion = document.querySelector('.vc-autocompletion-suggestion.selected');
    const allSuggestions = document.querySelectorAll('.vc-autocompletion-suggestion');

    switch (event.key) {
        case 'Escape':
            event.preventDefault();
            hideSuggestions();
            break;

        case 'Tab':
        case 'Enter':
            event.preventDefault();
            if (selectedSuggestion && currentSuggestions.length > 0) {
                const index = Array.from(allSuggestions).indexOf(selectedSuggestion);
                const textArea = document.querySelector('[data-slate-editor="true"]') as HTMLElement;
                const currentInput = textArea?.textContent || '';
                applySuggestion(currentSuggestions[index], currentInput);
            }
            break;

        case 'ArrowUp':
            event.preventDefault();
            if (selectedSuggestion && allSuggestions.length > 0) {
                selectedSuggestion.classList.remove('selected');
                const index = Array.from(allSuggestions).indexOf(selectedSuggestion);
                const newIndex = index > 0 ? index - 1 : allSuggestions.length - 1;
                allSuggestions[newIndex].classList.add('selected');
            }
            break;

        case 'ArrowDown':
            event.preventDefault();
            if (selectedSuggestion && allSuggestions.length > 0) {
                selectedSuggestion.classList.remove('selected');
                const index = Array.from(allSuggestions).indexOf(selectedSuggestion);
                const newIndex = index < allSuggestions.length - 1 ? index + 1 : 0;
                allSuggestions[newIndex].classList.add('selected');
            }
            break;
    }
}

// Surveiller les changements dans la zone de texte
function setupTextAreaMonitoring() {
    let debounceTimer: NodeJS.Timeout;

    const handleInput = (event: Event) => {
        const target = event.target as HTMLElement;
        if (!target.hasAttribute('data-slate-editor')) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const text = target.textContent || '';
            if (text.length >= 2 && text.endsWith(' ') === false) {
                showSuggestions(text, target);
            } else {
                hideSuggestions();
            }
        }, 150);
    };

    document.addEventListener('input', handleInput, true);
    document.addEventListener('keydown', handleKeyDown, true);

    // Masquer les suggestions si on clique ailleurs
    document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (isAutoCompleteVisible && !target?.closest?.('.vc-autocompletion-interface')) {
            hideSuggestions();
        }
    });
}

export default definePlugin({
    name: "AutoCompletion",
    description: "Autocomplétion intelligente qui apprend de vos messages fréquents",
    authors: [Devs.Ven],
    dependencies: ["MessageEventsAPI"],
    settings,

    async start() {
        console.log("[AutoCompletion] Démarrage du plugin...");

        try {
            await loadData();
            console.log("[AutoCompletion] ✅ Données chargées");

            messageSendListener = addMessagePreSendListener((channelId, message) => {
                console.log("[AutoCompletion] 🎯 Message intercepté:", message);
                if (message.content) {
                    console.log("[AutoCompletion] 📝 Contenu du message:", message.content);
                    learnFromMessage(message.content);
                } else {
                    console.log("[AutoCompletion] ⚠️ Message sans contenu détecté");
                }
            });
            console.log("[AutoCompletion] ✅ Écouteur de messages ajouté");

            console.log("[AutoCompletion] ✅ Plugin démarré avec succès!");
            console.log("[AutoCompletion] 📊 Statistiques:", Object.keys(wordFrequency).length, "mots appris");
            console.log("[AutoCompletion] ⚙️ Paramètres:", settings.store);
        } catch (error) {
            console.error("[AutoCompletion] ❌ Erreur au démarrage:", error);
        }
    },

    stop() {
        console.log("[AutoCompletion] Arrêt du plugin...");

        if (messageSendListener) {
            removeMessagePreSendListener(messageSendListener);
        }

        console.log("[AutoCompletion] ✅ Plugin arrêté");
    },

    // Méthodes utilitaires pour le débogage
    getStats() {
        const stats = {
            totalWords: Object.keys(wordFrequency).length,
            totalPhrases: Object.keys(phraseFrequency).length,
            topWords: Object.entries(wordFrequency)
                .sort(([, a], [, b]) => b.count - a.count)
                .slice(0, 10)
                .map(([word, data]) => ({ word, count: data.count, lastUsed: new Date(data.lastUsed).toLocaleString() })),
            topPhrases: Object.entries(phraseFrequency)
                .sort(([, a], [, b]) => b.count - a.count)
                .slice(0, 5)
                .map(([phrase, data]) => ({ phrase, count: data.count }))
        };
        console.log("[AutoCompletion] 📊 Statistiques complètes:", stats);
        return stats;
    },

    clearData() {
        wordFrequency = {};
        phraseFrequency = {};
        saveData();
        console.log("[AutoCompletion] 🗑️ Toutes les données ont été effacées");
    },

    // Fonction pour tester l'apprentissage manuellement
    testLearning(text: string) {
        console.log("[AutoCompletion] 🧪 Test d'apprentissage avec:", text);
        learnFromMessage(text);
        return this.getStats();
    }
}); 