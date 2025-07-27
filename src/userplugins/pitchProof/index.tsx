/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { ApplicationCommandInputType } from "@api/Commands/types";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Forms, React, Select, Slider, Switch, Text, showToast, Toasts } from "@webpack/common";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer PitchProof",
        default: false
    },
    pitchShift: {
        type: OptionType.SLIDER,
        description: "Modification du pitch (-12 à +12 demi-tons)",
        default: 0,
        markers: [-12, -6, 0, 6, 12],
        minValue: -12,
        maxValue: 12
    },
    voiceEffect: {
        type: OptionType.SELECT,
        description: "Effet vocal",
        options: [
            { label: "Aucun", value: "none", default: true },
            { label: "Robot", value: "robot" },
            { label: "Écho", value: "echo" },
            { label: "Réverbération", value: "reverb" },
            { label: "Distortion", value: "distortion" },
            { label: "Chorus", value: "chorus" },
            { label: "Helium", value: "helium" },
            { label: "Deep Voice", value: "deep" }
        ]
    },
    realTimeProcessing: {
        type: OptionType.BOOLEAN,
        description: "Traitement en temps réel",
        default: true
    },
    autoActivate: {
        type: OptionType.BOOLEAN,
        description: "Activation automatique en vocal",
        default: false
    },
    quality: {
        type: OptionType.SELECT,
        description: "Qualité audio",
        options: [
            { label: "Faible (moins de latence)", value: "low" },
            { label: "Moyenne", value: "medium", default: true },
            { label: "Élevée (plus de latence)", value: "high" }
        ]
    },
    // Paramètres avancés pour les effets
    robotFrequency: {
        type: OptionType.SLIDER,
        description: "Fréquence de l'effet Robot (Hz)",
        default: 800,
        markers: [400, 600, 800, 1000, 1200],
        minValue: 200,
        maxValue: 2000
    },
    echoDelay: {
        type: OptionType.SLIDER,
        description: "Délai de l'écho (ms)",
        default: 200,
        markers: [100, 200, 300, 400, 500],
        minValue: 50,
        maxValue: 1000
    },
    reverbDuration: {
        type: OptionType.SLIDER,
        description: "Durée de la réverbération (ms)",
        default: 500,
        markers: [200, 500, 800, 1000, 1500],
        minValue: 100,
        maxValue: 2000
    },
    distortionAmount: {
        type: OptionType.SLIDER,
        description: "Intensité de la distortion",
        default: 20,
        markers: [5, 10, 20, 30, 40],
        minValue: 1,
        maxValue: 50
    },
    chorusSpeed: {
        type: OptionType.SLIDER,
        description: "Vitesse du chorus (Hz)",
        default: 1.5,
        markers: [0.5, 1.0, 1.5, 2.0, 3.0],
        minValue: 0.1,
        maxValue: 5.0
    },
    heliumFrequency: {
        type: OptionType.SLIDER,
        description: "Fréquence de l'effet Helium (Hz)",
        default: 2000,
        markers: [1500, 2000, 2500, 3000, 3500],
        minValue: 1000,
        maxValue: 5000
    },
    deepFrequency: {
        type: OptionType.SLIDER,
        description: "Fréquence de l'effet Deep Voice (Hz)",
        default: 400,
        markers: [200, 400, 600, 800, 1000],
        minValue: 100,
        maxValue: 1500
    }
});

// Classe pour le traitement audio simplifiée
class AudioProcessor {
    private audioContext: AudioContext | null = null;
    private isInitialized = false;

    constructor() {
        this.initializeAudioContext();
    }

    private initializeAudioContext() {
        try {
            this.audioContext = new AudioContext();
            this.isInitialized = true;
            console.log("[PitchProof] AudioContext initialisé avec succès");
        } catch (error) {
            console.error("[PitchProof] Erreur lors de l'initialisation de l'audio context:", error);
        }
    }

    public async processStream(stream: MediaStream): Promise<MediaStream> {
        if (!this.audioContext || !this.isInitialized) {
            console.warn("[PitchProof] AudioContext non initialisé, retour du stream original");
            return stream;
        }

        try {
            // Créer la source audio
            const sourceNode = this.audioContext.createMediaStreamSource(stream);
            const destinationNode = this.audioContext.createMediaStreamDestination();

            // Appliquer les effets selon les paramètres
            let currentNode: AudioNode = sourceNode;

            // Effet de pitch
            if (settings.store.pitchShift !== 0) {
                const pitchNode = this.createPitchNode();
                currentNode.connect(pitchNode);
                currentNode = pitchNode;
            }

            // Effet vocal
            if (settings.store.voiceEffect !== 'none') {
                const effectNode = this.createEffectNode(settings.store.voiceEffect);
                if (effectNode) {
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                }
            }

            // Connecter à la destination
            currentNode.connect(destinationNode);

            return destinationNode.stream;
        } catch (error) {
            console.error("[PitchProof] Erreur lors du traitement du stream:", error);
            return stream;
        }
    }

    private createPitchNode(): AudioNode {
        if (!this.audioContext) throw new Error("AudioContext non initialisé");

        // Créer un nœud de pitch simple
        const pitchNode = this.audioContext.createGain();
        const pitchShift = settings.store.pitchShift;

        // Ajuster le gain selon le pitch (approximation simple)
        if (pitchShift > 0) {
            pitchNode.gain.value = 1 + (pitchShift * 0.1);
        } else if (pitchShift < 0) {
            pitchNode.gain.value = 1 + (pitchShift * 0.05);
        } else {
            pitchNode.gain.value = 1;
        }

        return pitchNode;
    }

    private createEffectNode(effectType: string): AudioNode | null {
        if (!this.audioContext) return null;

        switch (effectType) {
            case 'robot':
                const robotFilter = this.audioContext.createBiquadFilter();
                robotFilter.type = 'highpass';
                robotFilter.frequency.value = settings.store.robotFrequency;
                return robotFilter;

            case 'helium':
                const heliumFilter = this.audioContext.createBiquadFilter();
                heliumFilter.type = 'highpass';
                heliumFilter.frequency.value = settings.store.heliumFrequency;
                return heliumFilter;

            case 'deep':
                const deepFilter = this.audioContext.createBiquadFilter();
                deepFilter.type = 'lowpass';
                deepFilter.frequency.value = settings.store.deepFrequency;
                return deepFilter;

            case 'distortion':
                const distortion = this.audioContext.createWaveShaper();
                const curve = new Float32Array(44100);
                const amount = settings.store.distortionAmount;

                for (let i = 0; i < 44100; i++) {
                    const x = (i * 2) / 44100 - 1;
                    curve[i] = Math.tanh(x * amount);
                }

                distortion.curve = curve;
                return distortion;

            default:
                return null;
        }
    }

    public updateSettings() {
        console.log("[PitchProof] Paramètres mis à jour");
    }

    public cleanup() {
        if (this.audioContext) {
            this.audioContext.close();
        }
        this.isInitialized = false;
    }
}

// Instance globale du processeur audio
let audioProcessor: AudioProcessor | null = null;

// Composant de paramètres amélioré
function SettingsComponent() {
    const [pitchShift, setPitchShift] = React.useState(settings.store.pitchShift);
    const [voiceEffect, setVoiceEffect] = React.useState(settings.store.voiceEffect);
    const [quality, setQuality] = React.useState(settings.store.quality);
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    React.useEffect(() => {
        settings.store.pitchShift = pitchShift;
        settings.store.voiceEffect = voiceEffect;
        settings.store.quality = quality;

        if (audioProcessor) {
            audioProcessor.updateSettings();
        }
    }, [pitchShift, voiceEffect, quality]);

    const updateAdvancedSetting = (key: string, value: any) => {
        (settings.store as any)[key] = value;
        if (audioProcessor) {
            audioProcessor.updateSettings();
        }
    };

    return (
        <div style={{ padding: "16px" }}>
            <Forms.FormTitle>🎤 PitchProof - Modificateur de Voix</Forms.FormTitle>

            <Text style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
                ⚠️ Note: Ce plugin est en version bêta. Le traitement audio en temps réel nécessite des améliorations.
            </Text>

            <Forms.FormTitle>Pitch Shift</Forms.FormTitle>
            <Slider
                initialValue={pitchShift}
                onValueChange={setPitchShift}
                minValue={-12}
                maxValue={12}
                markers={[-12, -6, 0, 6, 12]}
                stickToMarkers={false}
            />
            <Text>Niveau: {pitchShift} demi-tons</Text>

            <Forms.FormTitle>Effet Vocal</Forms.FormTitle>
            <Select
                options={[
                    { label: "Aucun", value: "none" },
                    { label: "Robot", value: "robot" },
                    { label: "Helium", value: "helium" },
                    { label: "Deep Voice", value: "deep" },
                    { label: "Distortion", value: "distortion" }
                ]}
                isSelected={(value) => value === voiceEffect}
                select={(value) => setVoiceEffect(value)}
                serialize={(value) => value}
            />

            <Forms.FormTitle>Qualité Audio</Forms.FormTitle>
            <Select
                options={[
                    { label: "Faible (moins de latence)", value: "low" },
                    { label: "Moyenne", value: "medium" },
                    { label: "Élevée (plus de latence)", value: "high" }
                ]}
                isSelected={(value) => value === quality}
                select={(value) => setQuality(value)}
                serialize={(value) => value}
            />

            <Button
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ marginTop: "16px", marginBottom: "8px" }}
            >
                {showAdvanced ? "Masquer" : "Afficher"} les paramètres avancés
            </Button>

            {showAdvanced && (
                <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "var(--background-secondary)", borderRadius: "4px" }}>
                    <Forms.FormTitle>Paramètres Avancés</Forms.FormTitle>

                    <Forms.FormTitle>Robot - Fréquence (Hz)</Forms.FormTitle>
                    <Slider
                        initialValue={settings.store.robotFrequency}
                        onValueChange={(value) => updateAdvancedSetting('robotFrequency', value)}
                        minValue={200}
                        maxValue={2000}
                        markers={[400, 600, 800, 1000, 1200]}
                        stickToMarkers={false}
                    />
                    <Text>Fréquence: {settings.store.robotFrequency} Hz</Text>

                    <Forms.FormTitle>Helium - Fréquence (Hz)</Forms.FormTitle>
                    <Slider
                        initialValue={settings.store.heliumFrequency}
                        onValueChange={(value) => updateAdvancedSetting('heliumFrequency', value)}
                        minValue={1000}
                        maxValue={5000}
                        markers={[1500, 2000, 2500, 3000, 3500]}
                        stickToMarkers={false}
                    />
                    <Text>Fréquence: {settings.store.heliumFrequency} Hz</Text>

                    <Forms.FormTitle>Deep Voice - Fréquence (Hz)</Forms.FormTitle>
                    <Slider
                        initialValue={settings.store.deepFrequency}
                        onValueChange={(value) => updateAdvancedSetting('deepFrequency', value)}
                        minValue={100}
                        maxValue={1500}
                        markers={[200, 400, 600, 800, 1000]}
                        stickToMarkers={false}
                    />
                    <Text>Fréquence: {settings.store.deepFrequency} Hz</Text>

                    <Forms.FormTitle>Distortion - Intensité</Forms.FormTitle>
                    <Slider
                        initialValue={settings.store.distortionAmount}
                        onValueChange={(value) => updateAdvancedSetting('distortionAmount', value)}
                        minValue={1}
                        maxValue={50}
                        markers={[5, 10, 20, 30, 40]}
                        stickToMarkers={false}
                    />
                    <Text>Intensité: {settings.store.distortionAmount}</Text>
                </div>
            )}

            <div style={{ marginTop: "16px" }}>
                <Button
                    onClick={() => {
                        if (audioProcessor) {
                            audioProcessor.updateSettings();
                            showToast(Toasts.Type.SUCCESS, "Paramètres mis à jour !");
                        }
                    }}
                >
                    Appliquer les changements
                </Button>
            </div>
        </div>
    );
}

export default definePlugin({
    name: "PitchProof",
    description: "Modificateur de voix en temps réel pour Discord Desktop (Bêta)",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    settings,
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "pitch",
            description: "Modifier le pitch de votre voix",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    type: ApplicationCommandOptionType.INTEGER,
                    name: "niveau",
                    description: "Niveau de pitch (-12 à +12)",
                    required: true
                }
            ],
            execute: async (args, ctx) => {
                const level = parseInt(args[0].value);
                settings.store.pitchShift = level;

                if (audioProcessor) {
                    audioProcessor.updateSettings();
                }

                sendBotMessage(ctx.channel.id, {
                    content: `🎤 Pitch modifié à ${level} demi-tons`
                });
            }
        },
        {
            name: "voiceeffect",
            description: "Appliquer un effet vocal",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    type: ApplicationCommandOptionType.STRING,
                    name: "effet",
                    description: "Type d'effet",
                    required: true,
                    choices: [
                        { name: "Aucun", label: "Aucun", value: "none" },
                        { name: "Robot", label: "Robot", value: "robot" },
                        { name: "Helium", label: "Helium", value: "helium" },
                        { name: "Deep Voice", label: "Deep Voice", value: "deep" },
                        { name: "Distortion", label: "Distortion", value: "distortion" }
                    ]
                }
            ],
            execute: async (args, ctx) => {
                const effect = args[0].value;
                settings.store.voiceEffect = effect;

                if (audioProcessor) {
                    audioProcessor.updateSettings();
                }

                sendBotMessage(ctx.channel.id, {
                    content: `🎭 Effet vocal appliqué: ${effect}`
                });
            }
        },
        {
            name: "pitchproof",
            description: "Activer/désactiver PitchProof",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute: async (args, ctx) => {
                const newState = !settings.store.enabled;
                settings.store.enabled = newState;

                if (audioProcessor) {
                    audioProcessor.updateSettings();
                }

                sendBotMessage(ctx.channel.id, {
                    content: `🎤 PitchProof ${newState ? 'activé' : 'désactivé'}`
                });
            }
        }
    ],

    start() {
        this.log("PitchProof démarré (version bêta)");

        // Initialiser le processeur audio
        audioProcessor = new AudioProcessor();
    },

    stop() {
        this.log("PitchProof arrêté");

        if (audioProcessor) {
            audioProcessor.cleanup();
            audioProcessor = null;
        }
    },

    // Méthodes de logging
    log(message: string, ...args: any[]) {
        console.log(`[PitchProof] ${message}`, ...args);
    },

    error(message: string, ...args: any[]) {
        console.error(`[PitchProof ERROR] ${message}`, ...args);
    },

    // Composant de paramètres
    settingsAboutComponent: SettingsComponent
});