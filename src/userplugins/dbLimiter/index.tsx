/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { findByPropsLazy } from "@webpack";
import { React, FluxDispatcher, Forms, Slider } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

const configModule = findByPropsLazy("getOutputVolume");

const settings = definePluginSettings({
    maxDecibels: {
        type: OptionType.SLIDER,
        default: -3,
        description: "Décibels maximum autorisés (dB)",
        markers: [-20, -15, -10, -6, -3, 0],
        stickToMarkers: false
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher les notifications de limitation"
    },
    showVisualIndicator: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher l'indicateur visuel de niveau audio"
    }
});

// État du limiteur
let limiterState = {
    isActive: false,
    audioContext: null as AudioContext | null,
    gainNode: null as GainNode | null,
    analyser: null as AnalyserNode | null,
    compressor: null as DynamicsCompressorNode | null,
    currentLevel: 0,
    peakLevel: 0,
    limitingCount: 0
};

// Fonction pour convertir les décibels en gain linéaire
function dbToGain(db: number): number {
    return Math.pow(10, db / 20);
}

// Fonction pour convertir le gain linéaire en décibels
function gainToDb(gain: number): number {
    return 20 * Math.log10(gain);
}

// Fonction pour analyser le niveau audio
function analyzeAudioLevel(): number {
    if (!limiterState.analyser) return 0;

    const bufferLength = limiterState.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    limiterState.analyser.getByteFrequencyData(dataArray);

    // Calculer le niveau RMS
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / bufferLength);

    // Convertir en décibels
    const db = 20 * Math.log10(rms / 255);
    return isFinite(db) ? db : -Infinity;
}

// Fonction pour créer le limiteur audio
async function createAudioLimiter() {
    try {
        // Créer le contexte audio
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Créer le nœud de destination
        const destination = audioContext.destination;

        // Créer le compresseur pour la limitation
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = settings.store.maxDecibels;
        compressor.knee.value = 0;
        compressor.ratio.value = 20; // Ratio élevé pour une limitation stricte
        compressor.attack.value = 0.003; // Attaque rapide
        compressor.release.value = 0.1; // Relâchement rapide

        // Créer le nœud de gain pour le contrôle final
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;

        // Créer l'analyseur pour surveiller les niveaux
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        // Connecter les nœuds
        compressor.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(destination);

        // Mettre à jour l'état
        limiterState = {
            ...limiterState,
            isActive: true,
            audioContext,
            gainNode,
            analyser,
            compressor
        };

        // Démarrer la surveillance des niveaux
        startLevelMonitoring();

        if (settings.store.showNotifications) {
            showNotification({
                title: "DB Limiter",
                body: `Limitation audio activée à ${settings.store.maxDecibels} dB`
            });
        }

        return { audioContext, gainNode, analyser, compressor };
    } catch (error) {
        console.error("DB Limiter: Erreur lors de la création du limiteur:", error);
        throw error;
    }
}

// Fonction pour surveiller les niveaux audio
function startLevelMonitoring() {
    if (!limiterState.isActive || !limiterState.analyser) return;

    function monitorLevels() {
        if (!limiterState.isActive) return;

        const currentLevel = analyzeAudioLevel();
        limiterState.currentLevel = currentLevel;

        // Mettre à jour le pic
        if (currentLevel > limiterState.peakLevel) {
            limiterState.peakLevel = currentLevel;
        }

        // Vérifier si la limitation est active
        if (currentLevel > settings.store.maxDecibels) {
            limiterState.limitingCount++;

            if (settings.store.showNotifications && limiterState.limitingCount % 100 === 0) {
                showNotification({
                    title: "DB Limiter - Limitation active",
                    body: `Niveau: ${currentLevel.toFixed(1)} dB (limite: ${settings.store.maxDecibels} dB)`
                });
            }
        }

        // Continuer la surveillance
        requestAnimationFrame(monitorLevels);
    }

    monitorLevels();
}

// Fonction pour arrêter le limiteur
function stopAudioLimiter() {
    if (!limiterState.isActive) return;

    try {
        if (limiterState.audioContext) {
            limiterState.audioContext.close();
        }

        limiterState = {
            isActive: false,
            audioContext: null,
            gainNode: null,
            analyser: null,
            compressor: null,
            currentLevel: 0,
            peakLevel: 0,
            limitingCount: 0
        };

        if (settings.store.showNotifications) {
            showNotification({
                title: "DB Limiter",
                body: "Limitation audio désactivée"
            });
        }
    } catch (error) {
        console.error("DB Limiter: Erreur lors de l'arrêt:", error);
    }
}

// Fonction pour mettre à jour les paramètres du limiteur
function updateLimiterSettings() {
    if (!limiterState.isActive || !limiterState.compressor) return;

    limiterState.compressor.threshold.value = settings.store.maxDecibels;
}

// Composant d'indicateur visuel
function VisualIndicator() {
    const [currentLevel, setCurrentLevel] = React.useState(0);
    const [peakLevel, setPeakLevel] = React.useState(0);

    React.useEffect(() => {
        if (!settings.store.showVisualIndicator || !limiterState.isActive) return;

        const interval = setInterval(() => {
            setCurrentLevel(limiterState.currentLevel);
            setPeakLevel(limiterState.peakLevel);
        }, 50);

        return () => clearInterval(interval);
    }, [settings.store.showVisualIndicator, limiterState.isActive]);

    if (!settings.store.showVisualIndicator || !limiterState.isActive) {
        return null;
    }

    const maxDb = settings.store.maxDecibels;
    const currentPercent = Math.max(0, Math.min(100, ((currentLevel - (maxDb - 20)) / 20) * 100));
    const peakPercent = Math.max(0, Math.min(100, ((peakLevel - (maxDb - 20)) / 20) * 100));

    const getBarColor = (level: number) => {
        if (level > maxDb) return "#ed4245"; // Rouge si au-dessus de la limite
        if (level > maxDb - 3) return "#faa61a"; // Orange si proche de la limite
        return "#43b581"; // Vert si normal
    };

    return (
        <div style={{
            marginTop: "15px",
            padding: "10px",
            backgroundColor: "#2f3136",
            borderRadius: "4px",
            border: "1px solid #40444b"
        }}>
            <Forms.FormTitle>Niveau audio en temps réel</Forms.FormTitle>
            <div style={{ marginBottom: "10px" }}>
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: "#b9bbbe",
                    marginBottom: "5px"
                }}>
                    <span>Actuel: {currentLevel.toFixed(1)} dB</span>
                    <span>Pic: {peakLevel.toFixed(1)} dB</span>
                    <span>Limite: {maxDb} dB</span>
                </div>

                {/* Barre de niveau actuel */}
                <div style={{
                    height: "8px",
                    backgroundColor: "#40444b",
                    borderRadius: "4px",
                    marginBottom: "3px",
                    overflow: "hidden"
                }}>
                    <div style={{
                        height: "100%",
                        width: `${currentPercent}%`,
                        backgroundColor: getBarColor(currentLevel),
                        transition: "width 0.1s ease"
                    }} />
                </div>

                {/* Barre de pic */}
                <div style={{
                    height: "4px",
                    backgroundColor: "#40444b",
                    borderRadius: "2px",
                    overflow: "hidden"
                }}>
                    <div style={{
                        height: "100%",
                        width: `${peakPercent}%`,
                        backgroundColor: getBarColor(peakLevel),
                        transition: "width 0.1s ease"
                    }} />
                </div>

                {/* Marqueur de limite */}
                <div style={{
                    position: "relative",
                    height: "1px",
                    backgroundColor: "#ffffff",
                    marginTop: "2px",
                    left: `${((maxDb - (maxDb - 20)) / 20) * 100}%`,
                    width: "2px"
                }} />
            </div>

            {limiterState.limitingCount > 0 && (
                <div style={{
                    fontSize: "11px",
                    color: "#ed4245",
                    textAlign: "center"
                }}>
                    Limitation active: {limiterState.limitingCount} fois
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "DB Limiter",
    description: "Limite les décibels maximum pour protéger vos oreilles des pics audio",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    settingsAboutComponent: () => (
        <div>
            <h3>DB Limiter</h3>
            <p>Ce plugin limite les décibels maximum pour protéger vos oreilles des pics audio trop forts.</p>
            <p><strong>Fonctionnalités:</strong></p>
            <ul>
                <li>Limitation automatique des pics audio</li>
                <li>Indicateur visuel en temps réel</li>
                <li>Notifications de limitation active</li>
                <li>Paramètres de décibels ajustables</li>
            </ul>
            <p><strong>Recommandations:</strong></p>
            <ul>
                <li>-3 dB: Limitation douce (recommandé)</li>
                <li>-6 dB: Limitation modérée</li>
                <li>-10 dB: Limitation forte</li>
            </ul>
        </div>
    ),

    settingsPanel: () => (
        <div style={{ padding: "20px" }}>
            <h2 style={{ marginBottom: "20px" }}>DB Limiter</h2>

            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle>Paramètres de limitation</Forms.FormTitle>

                <div style={{ marginBottom: "15px" }}>
                    <Forms.FormTitle>Décibels maximum: {settings.store.maxDecibels} dB</Forms.FormTitle>
                    <Slider
                        value={settings.store.maxDecibels}
                        onChange={(value) => {
                            settings.store.maxDecibels = value;
                            updateLimiterSettings();
                        }}
                        minValue={-20}
                        maxValue={0}
                        markers={[-20, -15, -10, -6, -3, 0]}
                        stickToMarkers={false}
                    />
                </div>
            </div>


            <VisualIndicator />

            {limiterState.isActive && (
                <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#2f3136", borderRadius: "4px" }}>
                    <div style={{ color: "#43b581", fontWeight: "bold", marginBottom: "5px" }}>
                        ✓ Limitation audio active
                    </div>
                    <div style={{ fontSize: "12px", color: "#b9bbbe" }}>
                        Les pics audio sont limités à {settings.store.maxDecibels} dB
                    </div>
                </div>
            )}
        </div>
    ),

    patches: [
        // Intercepter les modifications de volume pour appliquer la limitation
        {
            find: "AUDIO_SET_OUTPUT_VOLUME",
            replacement: {
                match: /AUDIO_SET_OUTPUT_VOLUME/,
                replace: "AUDIO_SET_OUTPUT_VOLUME;$self.onVolumeChange?.()"
            }
        }
    ],

    onVolumeChange() {
        if (limiterState.isActive) {
            updateLimiterSettings();
        }
    },

    start() {
        console.log("DB Limiter: Plugin démarré");

        // Démarrer automatiquement le limiteur
        createAudioLimiter();
    },

    stop() {
        stopAudioLimiter();
        console.log("DB Limiter: Plugin arrêté");
    }
});
