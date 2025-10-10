/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { findByPropsLazy } from "@webpack";
import { React, FluxDispatcher, Forms, Slider } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

// Composant de fallback pour FormSection si le composant natif n'est pas trouvé
const FormSectionFallback = ({ children, title, ...props }: any) => (
    <div
        className="form-section"
        style={{
            marginBottom: "20px",
            padding: "16px",
            backgroundColor: "var(--background-secondary)",
            borderRadius: "8px",
            border: "1px solid var(--background-tertiary)"
        }}
        {...props}
    >
        {title && <h3 style={{ margin: "0 0 12px 0", color: "var(--header-primary)" }}>{title}</h3>}
        {children}
    </div>
);

// Wrapper pour FormSection avec fallback automatique
const SafeFormSection = ({ children, ...props }: any) => {
    // Vérifier si FormSection est disponible
    if (Forms.FormSection && typeof Forms.FormSection === 'function') {
        try {
            return <Forms.FormSection {...props}>{children}</Forms.FormSection>;
        } catch (error) {
            console.warn("FormSection error, using fallback:", error);
        }
    }

    // Utiliser le fallback si FormSection n'est pas disponible
    console.warn("FormSection not available, using fallback component");
    return <FormSectionFallback {...props}>{children}</FormSectionFallback>;
};

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
    showVisualIndicator: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher l'indicateur visuel"
    }
});

// État global du limiteur
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
        limiterState.limitingCount++;

    }
}

// Fonction pour créer le limiteur audio
async function createAudioLimiter() {
    if (!settings.store.enableDbLimiting) return;

    try {
        // Créer le contexte audio
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

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
        analyser.connect(audioContext.destination);

        // Mettre à jour l'état
        limiterState.audioContext = audioContext;
        limiterState.gainNode = gainNode;
        limiterState.analyser = analyser;
        limiterState.compressor = compressor;

        // Démarrer la surveillance des niveaux
        startLevelMonitoring();


        return { audioContext, gainNode, analyser, compressor };
    } catch (error) {
        console.error("Audio Limiter: Erreur lors de la création du limiteur audio:", error);
        throw error;
    }
}

// Fonction pour surveiller les niveaux audio
function startLevelMonitoring() {
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
            limiterState.limitingCount++;

        }

        // Continuer la surveillance
        requestAnimationFrame(monitorLevels);
    }

    monitorLevels();
}

// Fonction pour démarrer la surveillance du volume
function startVolumeMonitoring() {
    if (!settings.store.enableVolumeLimiting) return;

    function monitorVolume() {
        if (!limiterState.isActive || !settings.store.enableVolumeLimiting) return;

        checkAndLimitVolume();

        // Continuer la surveillance
        setTimeout(monitorVolume, 100); // Vérifier toutes les 100ms
    }

    monitorVolume();
}

// Fonction pour démarrer le limiteur
async function startLimiter() {
    if (limiterState.isActive) return;

    try {
        limiterState.isActive = true;

        // Démarrer la surveillance du volume
        startVolumeMonitoring();

        // Créer le limiteur audio si activé
        if (settings.store.enableDbLimiting) {
            await createAudioLimiter();
        }

        console.log("Audio Limiter: Limiteur démarré avec succès");
    } catch (error) {
        console.error("Audio Limiter: Erreur lors du démarrage du limiteur:", error);
        limiterState.isActive = false;
    }
}

// Fonction pour arrêter le limiteur
function stopLimiter() {
    if (!limiterState.isActive) return;

    try {
        limiterState.isActive = false;

        // Nettoyer le contexte audio
        if (limiterState.audioContext) {
            limiterState.audioContext.close();
        }

        // Réinitialiser l'état
        limiterState.audioContext = null;
        limiterState.gainNode = null;
        limiterState.analyser = null;
        limiterState.compressor = null;
        limiterState.currentLevel = 0;
        limiterState.peakLevel = 0;
        limiterState.limitingCount = 0;

        console.log("Audio Limiter: Limiteur arrêté");
    } catch (error) {
        console.error("Audio Limiter: Erreur lors de l'arrêt du limiteur:", error);
    }
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
    }, [limiterState.isActive]);

    if (!settings.store.showVisualIndicator || !limiterState.isActive) return null;

    const maxDb = settings.store.maxDecibels;
    const currentPercent = Math.max(0, Math.min(100, ((currentLevel - maxDb + 20) / 20) * 100));
    const peakPercent = Math.max(0, Math.min(100, ((peakLevel - maxDb + 20) / 20) * 100));

    return (
        <div style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            background: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "10px",
            borderRadius: "5px",
            fontSize: "12px",
            zIndex: 10000,
            minWidth: "200px"
        }}>
            <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Audio Limiter</div>
            <div style={{ marginBottom: "3px" }}>
                Niveau: {currentLevel.toFixed(1)} dB
            </div>
            <div style={{ marginBottom: "3px" }}>
                Pic: {peakLevel.toFixed(1)} dB
            </div>
            <div style={{ marginBottom: "3px" }}>
                Limite: {maxDb} dB
            </div>
            <div style={{ marginBottom: "3px" }}>
                Limitations: {limiterState.limitingCount}
            </div>
            <div style={{
                width: "100%",
                height: "10px",
                background: "#333",
                borderRadius: "5px",
                overflow: "hidden"
            }}>
                <div style={{
                    width: `${currentPercent}%`,
                    height: "100%",
                    background: currentLevel > maxDb ? "#ff4444" : "#44ff44",
                    transition: "width 0.1s ease"
                }} />
            </div>
        </div>
    );
}

// Composant de paramètres
function SettingsPanel() {
    return (
        <SafeFormSection>
            <Forms.FormTitle>Paramètres de Limitation</Forms.FormTitle>

            <Forms.FormDivider />

            <Forms.FormText>
                Ce plugin limite automatiquement le volume de sortie pour éviter les sons trop forts.
            </Forms.FormText>

            <Forms.FormDivider />

            <Forms.FormItem>
                <Forms.FormLabel>Volume Maximum (%)</Forms.FormLabel>
                <Slider
                    initialValue={settings.store.maxVolume}
                    asValueChanges={(value) => settings.store.maxVolume = value}
                    minValue={10}
                    maxValue={100}
                    markers={[50, 60, 70, 80, 90, 100]}
                    stickToMarkers={false}
                />
                <Forms.FormText>
                    Volume maximum autorisé: {settings.store.maxVolume}%
                </Forms.FormText>
            </Forms.FormItem>

            <Forms.FormItem>
                <Forms.FormLabel>Décibels Maximum (dB)</Forms.FormLabel>
                <Slider
                    initialValue={settings.store.maxDecibels}
                    asValueChanges={(value) => settings.store.maxDecibels = value}
                    minValue={-20}
                    maxValue={0}
                    markers={[-20, -15, -10, -6, -3, 0]}
                    stickToMarkers={false}
                />
                <Forms.FormText>
                    Niveau audio maximum: {settings.store.maxDecibels} dB
                </Forms.FormText>
            </Forms.FormItem>

            <Forms.FormDivider />

            <Forms.FormItem>
                <Forms.FormSwitch
                    title="Activer la limitation de volume"
                    value={settings.store.enableVolumeLimiting}
                    onChange={(value) => settings.store.enableVolumeLimiting = value}
                />
            </Forms.FormItem>

            <Forms.FormItem>
                <Forms.FormSwitch
                    title="Activer la limitation des décibels"
                    value={settings.store.enableDbLimiting}
                    onChange={(value) => settings.store.enableDbLimiting = value}
                />
            </Forms.FormItem>


            <Forms.FormItem>
                <Forms.FormSwitch
                    title="Afficher l'indicateur visuel"
                    value={settings.store.showVisualIndicator}
                    onChange={(value) => settings.store.showVisualIndicator = value}
                />
            </Forms.FormItem>

            <Forms.FormDivider />

            <Forms.FormText>
                <strong>Statut:</strong> {limiterState.isActive ? "Actif" : "Inactif"}
            </Forms.FormText>
            <Forms.FormText>
                <strong>Limitations appliquées:</strong> {limiterState.limitingCount}
            </Forms.FormText>
        </SafeFormSection>
    );
}

export default definePlugin({
    name: "Audio Limiter",
    description: "Limite automatiquement le volume de sortie pour éviter les sons trop forts",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,
    settingsAboutComponent: SettingsPanel,

    start() {
        console.log("Audio Limiter: Plugin démarré");
        startLimiter();
    },

    stop() {
        console.log("Audio Limiter: Plugin arrêté");
        stopLimiter();
    },

    patches: [
        {
            find: "AUDIO_SET_OUTPUT_VOLUME",
            replacement: {
                match: /AUDIO_SET_OUTPUT_VOLUME/,
                replace: "AUDIO_SET_OUTPUT_VOLUME_LIMITED"
            }
        }
    ]
});