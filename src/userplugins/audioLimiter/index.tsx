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
    maxVolume: {
        type: OptionType.SLIDER,
        default: 80,
        description: "Volume maximum autorisé (%)",
        markers: [50, 60, 70, 80, 90, 100],
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
        description: "Afficher l'indicateur visuel de volume"
    },
    autoLimit: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Limitation automatique du volume système"
    }
});

// État du limiteur
let limiterState = {
    isActive: false,
    originalVolume: 0,
    limitingCount: 0,
    lastNotification: 0
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

// Fonction pour vérifier et limiter le volume
function checkAndLimitVolume() {
    if (!settings.store.autoLimit) return;

    const currentVolume = getCurrentVolume();
    const maxVolume = settings.store.maxVolume;

    if (currentVolume > maxVolume) {
        setVolume(maxVolume);
        limiterState.limitingCount++;

        // Notification avec throttling (max 1 par seconde)
        const now = Date.now();
        if (settings.store.showNotifications && now - limiterState.lastNotification > 1000) {
            showNotification({
                title: "Audio Limiter",
                body: `Volume limité de ${currentVolume}% à ${maxVolume}%`
            });
            limiterState.lastNotification = now;
        }
    }
}

// Fonction pour démarrer la surveillance
function startVolumeMonitoring() {
    if (limiterState.isActive) return;

    limiterState.isActive = true;
    limiterState.originalVolume = getCurrentVolume();

    // Vérifier immédiatement
    checkAndLimitVolume();

    // Surveiller les changements de volume
    const checkInterval = setInterval(() => {
        if (!limiterState.isActive) {
            clearInterval(checkInterval);
            return;
        }
        checkAndLimitVolume();
    }, 100); // Vérifier toutes les 100ms

    if (settings.store.showNotifications) {
        showNotification({
            title: "Audio Limiter",
            body: `Limitation activée à ${settings.store.maxVolume}%`
        });
    }
}

// Fonction pour arrêter la surveillance
function stopVolumeMonitoring() {
    if (!limiterState.isActive) return;

    limiterState.isActive = false;
    limiterState.limitingCount = 0;

    if (settings.store.showNotifications) {
        showNotification({
            title: "Audio Limiter",
            body: "Limitation audio désactivée"
        });
    }
}

// Composant d'indicateur visuel
function VisualIndicator() {
    const [currentVolume, setCurrentVolume] = React.useState(0);
    const [isLimited, setIsLimited] = React.useState(false);

    React.useEffect(() => {
        if (!settings.store.showVisualIndicator) return;

        const interval = setInterval(() => {
            const volume = getCurrentVolume();
            setCurrentVolume(volume);
            setIsLimited(volume > settings.store.maxVolume);
        }, 50);

        return () => clearInterval(interval);
    }, [settings.store.showVisualIndicator, settings.store.maxVolume]);

    if (!settings.store.showVisualIndicator) {
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
            marginTop: "15px",
            padding: "10px",
            backgroundColor: "#2f3136",
            borderRadius: "4px",
            border: "1px solid #40444b"
        }}>
            <Forms.FormTitle>Volume en temps réel</Forms.FormTitle>
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

            {limiterState.limitingCount > 0 && (
                <div style={{
                    fontSize: "11px",
                    color: "#ed4245",
                    textAlign: "center"
                }}>
                    Limitation appliquée: {limiterState.limitingCount} fois
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "Audio Limiter",
    description: "Limite automatiquement le volume maximum pour protéger vos oreilles",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    settingsAboutComponent: () => (
        <div>
            <h3>Audio Limiter</h3>
            <p>Ce plugin limite automatiquement le volume maximum pour protéger vos oreilles des niveaux audio trop élevés.</p>
            <p><strong>Fonctionnalités:</strong></p>
            <ul>
                <li>Limitation automatique du volume système</li>
                <li>Indicateur visuel en temps réel</li>
                <li>Notifications de limitation active</li>
                <li>Paramètres de volume ajustables</li>
            </ul>
            <p><strong>Recommandations:</strong></p>
            <ul>
                <li>80%: Limitation douce (recommandé)</li>
                <li>70%: Limitation modérée</li>
                <li>60%: Limitation forte</li>
            </ul>
        </div>
    ),

    settingsPanel: () => (
        <div style={{ padding: "20px" }}>
            <h2 style={{ marginBottom: "20px" }}>Audio Limiter</h2>

            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle>Paramètres de limitation</Forms.FormTitle>

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
            </div>


            <VisualIndicator />

            {limiterState.isActive && (
                <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#2f3136", borderRadius: "4px" }}>
                    <div style={{ color: "#43b581", fontWeight: "bold", marginBottom: "5px" }}>
                        ✓ Limitation audio active
                    </div>
                    <div style={{ fontSize: "12px", color: "#b9bbbe" }}>
                        Le volume est limité à {settings.store.maxVolume}%
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
        if (settings.store.autoLimit) {
            // Petit délai pour laisser le volume se mettre à jour
            setTimeout(checkAndLimitVolume, 10);
        }
    },

    start() {
        console.log("Audio Limiter: Plugin démarré");

        // Démarrer automatiquement la surveillance
        startVolumeMonitoring();
    },

    stop() {
        stopVolumeMonitoring();
        console.log("Audio Limiter: Plugin arrêté");
    }
});
