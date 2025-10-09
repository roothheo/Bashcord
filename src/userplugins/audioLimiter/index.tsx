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
    // Paramètres de limitation de volume
    maxVolume: {
        type: OptionType.SLIDER,
        default: 80,
        description: "Volume maximum autorisé (%)",
        markers: [50, 60, 70, 80, 90, 100],
        stickToMarkers: false
    },
    enableVolumeLimiting: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Activer la limitation de volume système"
    },

    // Paramètres de limitation de décibels
    maxDecibels: {
        type: OptionType.SLIDER,
        default: -3,
        description: "Décibels maximum autorisés (dB)",
        markers: [-20, -15, -10, -6, -3, 0],
        stickToMarkers: false
    },
    enableDbLimiting: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Activer la limitation des pics audio (dB)"
    },

    // Paramètres d'affichage
    showNotifications: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher les notifications de limitation"
    },
    showVisualIndicator: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher l'indicateur visuel"
    },
    showVolumeIndicator: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher l'indicateur de volume système"
    },
    showDbIndicator: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher l'indicateur de niveau audio (dB)"
    }
});

// État global du limiteur
let limiterState = {
    isActive: false,

    // Volume system
    originalVolume: 0,
    volumeLimitingCount: 0,
    lastVolumeNotification: 0,

    // DB limiting
    audioContext: null as AudioContext | null,
    gainNode: null as GainNode | null,
    analyser: null as AnalyserNode | null,
    compressor: null as DynamicsCompressorNode | null,
    currentLevel: 0,
    peakLevel: 0,
    dbLimitingCount: 0,
    lastDbNotification: 0
};

// Fonction pour obtenir le volume actuel
function getCurrentVolume(): number {
    try {
        return configModule.getOutputVolume();
    } catch (error) {
        console.error("Audio Limiter: Erreur lors de l'obtention du volume:", error);
        return 0;
    }
}

// Fonction pour définir le volume
function setVolume(volume: number) {
    try {
        FluxDispatcher.dispatch({
            type: "AUDIO_SET_OUTPUT_VOLUME",
            volume: Math.max(0, Math.min(200, volume))
        });
    } catch (error) {
        console.error("Audio Limiter: Erreur lors de la définition du volume:", error);
    }
}

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

// Fonction pour vérifier et limiter le volume système
function checkAndLimitVolume() {
    if (!settings.store.enableVolumeLimiting) return;

    const currentVolume = getCurrentVolume();
    const maxVolume = settings.store.maxVolume;

    if (currentVolume > maxVolume) {
        setVolume(maxVolume);
        limiterState.volumeLimitingCount++;

        // Notification avec throttling (max 1 par seconde)
        const now = Date.now();
        if (settings.store.showNotifications && now - limiterState.lastVolumeNotification > 1000) {
            showNotification({
                title: "Audio Limiter - Volume",
                body: `Volume limité de ${currentVolume}% à ${maxVolume}%`
            });
            limiterState.lastVolumeNotification = now;
        }
    }
}

// Fonction pour créer le limiteur audio (DB)
async function createAudioLimiter() {
    if (!settings.store.enableDbLimiting) return;

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
        limiterState.audioContext = audioContext;
        limiterState.gainNode = gainNode;
        limiterState.analyser = analyser;
        limiterState.compressor = compressor;

        // Démarrer la surveillance des niveaux
        startDbLevelMonitoring();

        if (settings.store.showNotifications) {
            showNotification({
                title: "Audio Limiter - DB",
                body: `Limitation audio activée à ${settings.store.maxDecibels} dB`
            });
        }

        return { audioContext, gainNode, analyser, compressor };
    } catch (error) {
        console.error("Audio Limiter: Erreur lors de la création du limiteur DB:", error);
        throw error;
    }
}

// Fonction pour surveiller les niveaux audio (DB)
function startDbLevelMonitoring() {
    if (!settings.store.enableDbLimiting || !limiterState.analyser) return;

    function monitorLevels() {
        if (!limiterState.isActive || !settings.store.enableDbLimiting) return;

        const currentLevel = analyzeAudioLevel();
        limiterState.currentLevel = currentLevel;

        // Mettre à jour le pic
        if (currentLevel > limiterState.peakLevel) {
            limiterState.peakLevel = currentLevel;
        }

        // Vérifier si la limitation est active
        if (currentLevel > settings.store.maxDecibels) {
            limiterState.dbLimitingCount++;

            const now = Date.now();
            if (settings.store.showNotifications && now - limiterState.lastDbNotification > 2000) {
                showNotification({
                    title: "Audio Limiter - DB Limitation",
                    body: `Niveau: ${currentLevel.toFixed(1)} dB (limite: ${settings.store.maxDecibels} dB)`
                });
                limiterState.lastDbNotification = now;
            }
        }

        // Continuer la surveillance
        requestAnimationFrame(monitorLevels);
    }

    monitorLevels();
}

// Fonction pour démarrer la surveillance du volume
function startVolumeMonitoring() {
    if (!settings.store.enableVolumeLimiting) return;

    limiterState.originalVolume = getCurrentVolume();

    // Vérifier immédiatement
    checkAndLimitVolume();

    // Surveiller les changements de volume
    const checkInterval = setInterval(() => {
        if (!limiterState.isActive || !settings.store.enableVolumeLimiting) {
            clearInterval(checkInterval);
            return;
        }
        checkAndLimitVolume();
    }, 100); // Vérifier toutes les 100ms
}

// Fonction pour mettre à jour les paramètres du limiteur DB
function updateDbLimiterSettings() {
    if (!limiterState.compressor) return;

    limiterState.compressor.threshold.value = settings.store.maxDecibels;
}

// Fonction pour démarrer la surveillance globale
function startMonitoring() {
    if (limiterState.isActive) return;

    limiterState.isActive = true;

    // Démarrer la surveillance du volume
    if (settings.store.enableVolumeLimiting) {
        startVolumeMonitoring();
    }

    // Démarrer la limitation DB
    if (settings.store.enableDbLimiting) {
        createAudioLimiter();
    }

    if (settings.store.showNotifications) {
        const activeFeatures = [];
        if (settings.store.enableVolumeLimiting) activeFeatures.push(`Volume: ${settings.store.maxVolume}%`);
        if (settings.store.enableDbLimiting) activeFeatures.push(`DB: ${settings.store.maxDecibels} dB`);

        showNotification({
            title: "Audio Limiter",
            body: `Limitation activée - ${activeFeatures.join(", ")}`
        });
    }
}

// Fonction pour arrêter la surveillance
function stopMonitoring() {
    if (!limiterState.isActive) return;

    limiterState.isActive = false;
    limiterState.volumeLimitingCount = 0;
    limiterState.dbLimitingCount = 0;

    // Arrêter le limiteur DB
    if (limiterState.audioContext) {
        try {
            limiterState.audioContext.close();
        } catch (error) {
            console.error("Audio Limiter: Erreur lors de la fermeture du contexte audio:", error);
        }
    }

    // Réinitialiser l'état DB
    limiterState.audioContext = null;
    limiterState.gainNode = null;
    limiterState.analyser = null;
    limiterState.compressor = null;
    limiterState.currentLevel = 0;
    limiterState.peakLevel = 0;

    if (settings.store.showNotifications) {
        showNotification({
            title: "Audio Limiter",
            body: "Limitation audio désactivée"
        });
    }
}

// Composant d'indicateur de volume
function VolumeIndicator() {
    const [currentVolume, setCurrentVolume] = React.useState(0);
    const [isLimited, setIsLimited] = React.useState(false);

    React.useEffect(() => {
        if (!settings.store.showVolumeIndicator || !settings.store.enableVolumeLimiting) return;

        const interval = setInterval(() => {
            const volume = getCurrentVolume();
            setCurrentVolume(volume);
            setIsLimited(volume > settings.store.maxVolume);
        }, 50);

        return () => clearInterval(interval);
    }, [settings.store.showVolumeIndicator, settings.store.enableVolumeLimiting, settings.store.maxVolume]);

    if (!settings.store.showVolumeIndicator || !settings.store.enableVolumeLimiting) {
        return null;
    }

    const maxVolume = settings.store.maxVolume;
    const currentPercent = Math.min(100, (currentVolume / 200) * 100);
    const maxPercent = (maxVolume / 200) * 100;

    const getBarColor = () => {
        if (isLimited) return "#ed4245"; // Rouge si limité
        if (currentVolume > maxVolume * 0.9) return "#faa61a"; // Orange si proche de la limite
        return "#43b581"; // Vert si normal
    };

    return (
        <div style={{
            marginBottom: "15px",
            padding: "10px",
            backgroundColor: "#2f3136",
            borderRadius: "4px",
            border: "1px solid #40444b"
        }}>
            <Forms.FormTitle>Volume système</Forms.FormTitle>
            <div style={{ marginBottom: "10px" }}>
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: "#b9bbbe",
                    marginBottom: "5px"
                }}>
                    <span>Actuel: {currentVolume}%</span>
                    <span>Limite: {maxVolume}%</span>
                    <span style={{ color: isLimited ? "#ed4245" : "#43b581" }}>
                        {isLimited ? "LIMITÉ" : "NORMAL"}
                    </span>
                </div>

                {/* Barre de volume */}
                <div style={{
                    height: "12px",
                    backgroundColor: "#40444b",
                    borderRadius: "6px",
                    marginBottom: "3px",
                    overflow: "hidden",
                    position: "relative"
                }}>
                    <div style={{
                        height: "100%",
                        width: `${currentPercent}%`,
                        backgroundColor: getBarColor(),
                        transition: "width 0.1s ease, background-color 0.1s ease"
                    }} />

                    {/* Marqueur de limite */}
                    <div style={{
                        position: "absolute",
                        top: "0",
                        left: `${maxPercent}%`,
                        height: "100%",
                        width: "2px",
                        backgroundColor: "#ffffff",
                        opacity: 0.7
                    }} />
                </div>
            </div>

            {limiterState.volumeLimitingCount > 0 && (
                <div style={{
                    fontSize: "11px",
                    color: "#ed4245",
                    textAlign: "center"
                }}>
                    Limitation appliquée: {limiterState.volumeLimitingCount} fois
                </div>
            )}
        </div>
    );
}

// Composant d'indicateur de niveau audio (DB)
function DbIndicator() {
    const [currentLevel, setCurrentLevel] = React.useState(0);
    const [peakLevel, setPeakLevel] = React.useState(0);

    React.useEffect(() => {
        if (!settings.store.showDbIndicator || !settings.store.enableDbLimiting || !limiterState.isActive) return;

        const interval = setInterval(() => {
            setCurrentLevel(limiterState.currentLevel);
            setPeakLevel(limiterState.peakLevel);
        }, 50);

        return () => clearInterval(interval);
    }, [settings.store.showDbIndicator, settings.store.enableDbLimiting, limiterState.isActive]);

    if (!settings.store.showDbIndicator || !settings.store.enableDbLimiting || !limiterState.isActive) {
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
            marginBottom: "15px",
            padding: "10px",
            backgroundColor: "#2f3136",
            borderRadius: "4px",
            border: "1px solid #40444b"
        }}>
            <Forms.FormTitle>Niveau audio (dB)</Forms.FormTitle>
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

            {limiterState.dbLimitingCount > 0 && (
                <div style={{
                    fontSize: "11px",
                    color: "#ed4245",
                    textAlign: "center"
                }}>
                    Limitation active: {limiterState.dbLimitingCount} fois
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "Audio Limiter",
    description: "Limite automatiquement le volume et les pics audio pour protéger vos oreilles",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    settingsAboutComponent: () => (
        <div>
            <h3>Audio Limiter</h3>
            <p>Ce plugin combine deux types de limitation audio pour une protection complète de vos oreilles :</p>
            <p><strong>1. Limitation de volume système :</strong></p>
            <ul>
                <li>Contrôle le volume global de Discord</li>
                <li>Empêche d'augmenter le volume au-delà du seuil</li>
                <li>Protection contre les volumes accidentellement élevés</li>
            </ul>
            <p><strong>2. Limitation des pics audio (dB) :</strong></p>
            <ul>
                <li>Analyse les niveaux audio en temps réel</li>
                <li>Compresse automatiquement les pics trop forts</li>
                <li>Protection contre la distorsion et le clipping</li>
            </ul>
            <p><strong>Recommandations :</strong></p>
            <ul>
                <li>Volume: 80% (limitation douce)</li>
                <li>DB: -3 dB (limitation douce)</li>
                <li>Les deux peuvent être utilisés ensemble</li>
            </ul>
        </div>
    ),

    settingsPanel: () => (
        <div style={{ padding: "20px" }}>
            <h2 style={{ marginBottom: "20px" }}>Audio Limiter</h2>

            {/* Paramètres de limitation de volume */}
            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle>Limitation de volume système</Forms.FormTitle>

                <div style={{ marginBottom: "10px" }}>
                    <Forms.FormSwitch
                        value={settings.store.enableVolumeLimiting}
                        onChange={(value) => {
                            settings.store.enableVolumeLimiting = value;
                            if (value && limiterState.isActive) {
                                startVolumeMonitoring();
                            }
                        }}
                        note="Limite le volume maximum de Discord"
                    >
                        Activer la limitation de volume
                    </Forms.FormSwitch>
                </div>

                {settings.store.enableVolumeLimiting && (
                    <div style={{ marginBottom: "15px" }}>
                        <Forms.FormTitle>Volume maximum: {settings.store.maxVolume}%</Forms.FormTitle>
                        <Slider
                            value={settings.store.maxVolume}
                            onChange={(value) => {
                                settings.store.maxVolume = value;
                            }}
                            minValue={50}
                            maxValue={100}
                            markers={[50, 60, 70, 80, 90, 100]}
                            stickToMarkers={false}
                        />
                    </div>
                )}
            </div>

            {/* Paramètres de limitation DB */}
            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle>Limitation des pics audio (dB)</Forms.FormTitle>

                <div style={{ marginBottom: "10px" }}>
                    <Forms.FormSwitch
                        value={settings.store.enableDbLimiting}
                        onChange={(value) => {
                            settings.store.enableDbLimiting = value;
                            if (value && limiterState.isActive) {
                                createAudioLimiter();
                            } else if (!value && limiterState.audioContext) {
                                limiterState.audioContext.close();
                                limiterState.audioContext = null;
                                limiterState.gainNode = null;
                                limiterState.analyser = null;
                                limiterState.compressor = null;
                            }
                        }}
                        note="Limite les pics audio en temps réel"
                    >
                        Activer la limitation des décibels
                    </Forms.FormSwitch>
                </div>

                {settings.store.enableDbLimiting && (
                    <div style={{ marginBottom: "15px" }}>
                        <Forms.FormTitle>Décibels maximum: {settings.store.maxDecibels} dB</Forms.FormTitle>
                        <Slider
                            value={settings.store.maxDecibels}
                            onChange={(value) => {
                                settings.store.maxDecibels = value;
                                updateDbLimiterSettings();
                            }}
                            minValue={-20}
                            maxValue={0}
                            markers={[-20, -15, -10, -6, -3, 0]}
                            stickToMarkers={false}
                        />
                    </div>
                )}
            </div>

            {/* Paramètres d'affichage */}
            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle>Paramètres d'affichage</Forms.FormTitle>

                <div style={{ marginBottom: "10px" }}>
                    <Forms.FormSwitch
                        value={settings.store.showNotifications}
                        onChange={(value) => settings.store.showNotifications = value}
                        note="Afficher les notifications de limitation"
                    >
                        Notifications
                    </Forms.FormSwitch>
                </div>

                <div style={{ marginBottom: "10px" }}>
                    <Forms.FormSwitch
                        value={settings.store.showVolumeIndicator}
                        onChange={(value) => settings.store.showVolumeIndicator = value}
                        note="Afficher l'indicateur de volume système"
                    >
                        Indicateur de volume
                    </Forms.FormSwitch>
                </div>

                <div style={{ marginBottom: "10px" }}>
                    <Forms.FormSwitch
                        value={settings.store.showDbIndicator}
                        onChange={(value) => settings.store.showDbIndicator = value}
                        note="Afficher l'indicateur de niveau audio (dB)"
                    >
                        Indicateur de niveau audio
                    </Forms.FormSwitch>
                </div>
            </div>

            {/* Indicateurs visuels */}
            {settings.store.showVisualIndicator && (
                <div>
                    <VolumeIndicator />
                    <DbIndicator />
                </div>
            )}

            {/* Statut global */}
            {limiterState.isActive && (
                <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#2f3136", borderRadius: "4px" }}>
                    <div style={{ color: "#43b581", fontWeight: "bold", marginBottom: "5px" }}>
                        ✓ Limitation audio active
                    </div>
                    <div style={{ fontSize: "12px", color: "#b9bbbe" }}>
                        {settings.store.enableVolumeLimiting && `Volume limité à ${settings.store.maxVolume}%`}
                        {settings.store.enableVolumeLimiting && settings.store.enableDbLimiting && " • "}
                        {settings.store.enableDbLimiting && `Pics audio limités à ${settings.store.maxDecibels} dB`}
                    </div>
                </div>
            )}
        </div>
    ),

    patches: [
        // Intercepter les modifications de volume
        {
            find: "AUDIO_SET_OUTPUT_VOLUME",
            replacement: {
                match: /AUDIO_SET_OUTPUT_VOLUME/,
                replace: "AUDIO_SET_OUTPUT_VOLUME;$self.onVolumeChange?.()"
            }
        }
    ],

    onVolumeChange() {
        if (settings.store.enableVolumeLimiting) {
            // Petit délai pour laisser le volume se mettre à jour
            setTimeout(checkAndLimitVolume, 10);
        }
        if (settings.store.enableDbLimiting) {
            updateDbLimiterSettings();
        }
    },

    start() {
        console.log("Audio Limiter: Plugin démarré");
        startMonitoring();
    },

    stop() {
        stopMonitoring();
        console.log("Audio Limiter: Plugin arrêté");
    }
});