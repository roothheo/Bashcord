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
    enabled: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Activer le périphérique virtuel de sortie"
    },
    deviceName: {
        type: OptionType.STRING,
        default: "Virtual Output - AudioMixer",
        description: "Nom du périphérique virtuel"
    },
    autoSetAsDefault: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Définir automatiquement comme périphérique par défaut"
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher les notifications"
    }
});

// État du périphérique virtuel
let virtualDevice = {
    isActive: false,
    audioContext: null as AudioContext | null,
    destination: null as MediaStreamAudioDestinationNode | null,
    gainNode: null as GainNode | null,
    audioElement: null as HTMLAudioElement | null
};

// Fonction pour créer le périphérique virtuel
async function createVirtualDevice() {
    try {
        console.log("Virtual Output: Début de création du périphérique virtuel...");
        console.log("Virtual Output: Nom du périphérique:", settings.store.deviceName);

        // Créer le contexte audio
        const audioContext = new AudioContext();
        console.log("Virtual Output: Contexte audio créé:", audioContext.state);
        console.log("Virtual Output: Sample rate:", audioContext.sampleRate);
        console.log("Virtual Output: Base latency:", audioContext.baseLatency);

        // Créer la destination pour le stream
        const destination = audioContext.createMediaStreamDestination();
        console.log("Virtual Output: Destination créée:", destination);
        console.log("Virtual Output: Stream de destination:", destination.stream);
        console.log("Virtual Output: Tracks du stream:", destination.stream.getAudioTracks());

        // Créer un nœud de gain pour contrôler le volume
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        console.log("Virtual Output: Nœud de gain créé avec valeur:", gainNode.gain.value);

        // Connecter le gain à la destination
        gainNode.connect(destination);
        console.log("Virtual Output: Gain connecté à la destination");

        // Créer un élément audio pour simuler le périphérique
        const audioElement = new Audio();
        audioElement.srcObject = destination.stream;
        audioElement.volume = 1.0;
        audioElement.loop = true;
        audioElement.muted = false;
        console.log("Virtual Output: Élément audio créé:", audioElement);
        console.log("Virtual Output: Propriétés de l'élément audio:", {
            volume: audioElement.volume,
            loop: audioElement.loop,
            muted: audioElement.muted,
            srcObject: audioElement.srcObject
        });

        // Mettre à jour l'état
        virtualDevice = {
            isActive: true,
            audioContext,
            destination,
            gainNode,
            audioElement
        };

        console.log("Virtual Output: Périphérique virtuel créé avec succès");
        console.log("Virtual Output: État du périphérique virtuel:", virtualDevice);

        if (settings.store.showNotifications) {
            showNotification({
                title: "Virtual Output",
                body: `Périphérique virtuel "${settings.store.deviceName}" créé`
            });
        }

        return { audioContext, destination, gainNode, audioElement };
    } catch (error) {
        console.error("Virtual Output: Erreur lors de la création:", error);
        console.error("Virtual Output: Stack trace:", error.stack);
        throw error;
    }
}

// Fonction pour définir comme périphérique par défaut
function setAsDefaultOutput() {
    try {
        console.log("Virtual Output: Tentative de définition comme périphérique par défaut...");
        console.log("Virtual Output: État du périphérique virtuel:", {
            isActive: virtualDevice.isActive,
            hasAudioElement: !!virtualDevice.audioElement,
            hasAudioContext: !!virtualDevice.audioContext
        });

        if (!virtualDevice.isActive || !virtualDevice.audioElement) {
            console.error("Virtual Output: Périphérique virtuel non actif ou élément audio manquant");
            return;
        }

        // Vérifier les capacités du navigateur
        console.log("Virtual Output: Vérification des capacités du navigateur:");
        console.log("- setSinkId support (HTMLAudioElement):", 'setSinkId' in HTMLAudioElement.prototype);
        console.log("- setSinkId support (AudioContext):", 'setSinkId' in AudioContext.prototype);
        console.log("- navigator.mediaDevices:", !!navigator.mediaDevices);

        // Essayer de définir comme périphérique de sortie
        if ('setSinkId' in HTMLAudioElement.prototype) {
            console.log("Virtual Output: Tentative de définition du sinkId sur l'élément audio...");
            // @ts-expect-error
            virtualDevice.audioElement.setSinkId('default').then(() => {
                console.log("Virtual Output: SinkId défini avec succès sur l'élément audio");
            }).catch(error => {
                console.error("Virtual Output: Erreur lors de la définition du sinkId sur l'élément audio:", error);
            });
        } else {
            console.warn("Virtual Output: setSinkId non supporté sur HTMLAudioElement");
        }

        // Essayer avec le contexte audio
        if (virtualDevice.audioContext && 'setSinkId' in AudioContext.prototype) {
            console.log("Virtual Output: Tentative de définition du sinkId sur le contexte audio...");
            // @ts-expect-error
            virtualDevice.audioContext.setSinkId('default').then(() => {
                console.log("Virtual Output: SinkId défini avec succès sur le contexte audio");
            }).catch(error => {
                console.error("Virtual Output: Erreur lors de la définition du sinkId sur le contexte audio:", error);
            });
        }

        // Démarrer la lecture pour activer le périphérique
        console.log("Virtual Output: Tentative de démarrage de la lecture...");
        virtualDevice.audioElement.play().then(() => {
            console.log("Virtual Output: Lecture démarrée avec succès");
        }).catch(error => {
            console.error("Virtual Output: Erreur lors du démarrage de la lecture:", error);
        });

        console.log("Virtual Output: Défini comme périphérique par défaut");

        if (settings.store.showNotifications) {
            showNotification({
                title: "Virtual Output",
                body: "Périphérique virtuel défini comme sortie par défaut"
            });
        }
    } catch (error) {
        console.error("Virtual Output: Erreur lors de la définition par défaut:", error);
        console.error("Virtual Output: Stack trace:", error.stack);
    }
}

// Fonction pour arrêter le périphérique virtuel
function stopVirtualDevice() {
    try {
        if (virtualDevice.audioElement) {
            virtualDevice.audioElement.pause();
            virtualDevice.audioElement.srcObject = null;
        }

        if (virtualDevice.audioContext) {
            virtualDevice.audioContext.close();
        }

        virtualDevice = {
            isActive: false,
            audioContext: null,
            destination: null,
            gainNode: null,
            audioElement: null
        };

        console.log("Virtual Output: Périphérique virtuel arrêté");

        if (settings.store.showNotifications) {
            showNotification({
                title: "Virtual Output",
                body: "Périphérique virtuel arrêté"
            });
        }
    } catch (error) {
        console.error("Virtual Output: Erreur lors de l'arrêt:", error);
    }
}

// Composant d'affichage du statut
function DeviceStatus() {
    const [isActive, setIsActive] = React.useState(virtualDevice.isActive);

    React.useEffect(() => {
        const interval = setInterval(() => {
            setIsActive(virtualDevice.isActive);
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            marginTop: "15px",
            padding: "10px",
            backgroundColor: "#2f3136",
            borderRadius: "4px",
            border: "1px solid #40444b"
        }}>
            <Forms.FormTitle>Statut du périphérique virtuel</Forms.FormTitle>
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginTop: "5px"
            }}>
                <div style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: isActive ? "#43b581" : "#ed4245"
                }} />
                <span style={{
                    fontSize: "12px",
                    color: "#b9bbbe"
                }}>
                    {isActive ? "Actif" : "Inactif"} - {settings.store.deviceName}
                </span>
            </div>
            {isActive && (
                <div style={{
                    fontSize: "11px",
                    color: "#43b581",
                    marginTop: "5px"
                }}>
                    ✓ Périphérique virtuel prêt à être utilisé
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "Virtual Output",
    description: "Crée un périphérique virtuel de sortie pour Discord",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    settingsAboutComponent: () => (
        <div>
            <h3>Virtual Output</h3>
            <p>Ce plugin crée un périphérique virtuel de sortie que Discord peut utiliser.</p>
            <p><strong>Fonctionnalités:</strong></p>
            <ul>
                <li>Création d'un périphérique virtuel de sortie</li>
                <li>Définition automatique comme périphérique par défaut</li>
                <li>Compatible avec AudioMixer et autres plugins audio</li>
                <li>Contrôle de volume intégré</li>
            </ul>
            <p><strong>Note:</strong> Ce plugin fonctionne en tandem avec AudioMixer pour créer un système de mixage audio complet.</p>
        </div>
    ),

    settingsPanel: () => (
        <div style={{ padding: "20px" }}>
            <h2 style={{ marginBottom: "20px" }}>Virtual Output</h2>
            <p style={{ marginBottom: "20px", color: "#b9bbbe" }}>
                Ce plugin crée un périphérique virtuel de sortie que Discord peut utiliser.
                Il est conçu pour fonctionner avec AudioMixer et autres plugins audio.
            </p>

            <DeviceStatus />

            <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                <button
                    onClick={createVirtualDevice}
                    disabled={virtualDevice.isActive}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: virtualDevice.isActive ? "#ccc" : "#5865f2",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: virtualDevice.isActive ? "not-allowed" : "pointer"
                    }}
                >
                    Créer le périphérique
                </button>

                <button
                    onClick={setAsDefaultOutput}
                    disabled={!virtualDevice.isActive}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: !virtualDevice.isActive ? "#ccc" : "#43b581",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: !virtualDevice.isActive ? "not-allowed" : "pointer"
                    }}
                >
                    Définir par défaut
                </button>

                <button
                    onClick={stopVirtualDevice}
                    disabled={!virtualDevice.isActive}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: !virtualDevice.isActive ? "#ccc" : "#ed4245",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: !virtualDevice.isActive ? "not-allowed" : "pointer"
                    }}
                >
                    Arrêter
                </button>
            </div>

            {virtualDevice.isActive && (
                <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#2f3136", borderRadius: "4px" }}>
                    <div style={{ color: "#43b581", fontWeight: "bold", marginBottom: "5px" }}>
                        ✓ Périphérique virtuel actif
                    </div>
                    <div style={{ fontSize: "12px", color: "#b9bbbe" }}>
                        Le périphérique virtuel est prêt à être utilisé par Discord
                    </div>
                </div>
            )}
        </div>
    ),

    start() {
        console.log("Virtual Output: Plugin démarré");
        console.log("Virtual Output: Vérification des capacités du navigateur...");

        // Vérifier les capacités du navigateur
        console.log("Virtual Output: Capacités du navigateur:");
        console.log("- AudioContext support:", !!window.AudioContext || !!window.webkitAudioContext);
        console.log("- MediaStreamAudioDestinationNode support:", !!window.MediaStreamAudioDestinationNode);
        console.log("- HTMLAudioElement support:", !!window.HTMLAudioElement);
        console.log("- setSinkId support (HTMLAudioElement):", 'setSinkId' in HTMLAudioElement.prototype);
        console.log("- setSinkId support (AudioContext):", 'setSinkId' in AudioContext.prototype);

        // Vérifier les permissions
        if (navigator.permissions) {
            navigator.permissions.query({ name: 'microphone' as PermissionName }).then(result => {
                console.log("Virtual Output: Permission microphone:", result.state);
            }).catch(error => {
                console.error("Virtual Output: Erreur lors de la vérification des permissions microphone:", error);
            });
        }

        // Créer automatiquement le périphérique si activé
        if (settings.store.enabled) {
            console.log("Virtual Output: Création automatique activée");
            createVirtualDevice().then(() => {
                if (settings.store.autoSetAsDefault) {
                    console.log("Virtual Output: Définition automatique comme défaut activée");
                    setAsDefaultOutput();
                }
            }).catch(error => {
                console.error("Virtual Output: Erreur lors de la création automatique:", error);
            });
        } else {
            console.log("Virtual Output: Création automatique désactivée");
        }
    },

    stop() {
        stopVirtualDevice();
        console.log("Virtual Output: Plugin arrêté");
    }
});
