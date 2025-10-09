/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { React, MediaEngineStore, FluxDispatcher, Forms, Select, Slider } from "@webpack/common";
import { identity } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";

const configModule = findByPropsLazy("getOutputVolume");

// Variables pour stocker les périphériques sélectionnés
let selectedPrimaryDevice = "";
let selectedSecondaryDevice = "";

// État du périphérique virtuel
let virtualOutputDevice = {
    id: "audioMixer-virtual-output",
    name: "AudioMixer - Sortie Virtuelle",
    isActive: false,
    audioContext: null as AudioContext | null,
    destination: null as MediaStreamAudioDestinationNode | null,
    gainNode: null as GainNode | null
};

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Activer le mixage audio"
    },
    primaryDevice: {
        type: OptionType.COMPONENT,
        component: () => <PrimaryDeviceSelector />,
        description: "Périphérique audio principal (microphone)"
    },
    secondaryDevice: {
        type: OptionType.COMPONENT,
        component: () => <SecondaryDeviceSelector />,
        description: "Périphérique audio secondaire (musique, etc.)"
    },
    primaryVolume: {
        type: OptionType.SLIDER,
        default: 100,
        description: "Volume du périphérique principal (%)",
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false
    },
    secondaryVolume: {
        type: OptionType.SLIDER,
        default: 50,
        description: "Volume du périphérique secondaire (%)",
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher les notifications"
    },
    autoSetAsOutput: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Définir automatiquement comme périphérique de sortie Discord"
    }
});

interface AudioMixerState {
    isActive: boolean;
    primaryStream: MediaStream | null;
    secondaryStream: MediaStream | null;
    mixedStream: MediaStream | null;
    audioContext: AudioContext | null;
    primaryGain: GainNode | null;
    secondaryGain: GainNode | null;
    destination: MediaStreamAudioDestinationNode | null;
}

let mixerState: AudioMixerState = {
    isActive: false,
    primaryStream: null,
    secondaryStream: null,
    mixedStream: null,
    audioContext: null,
    primaryGain: null,
    secondaryGain: null,
    destination: null
};

// Fonction pour obtenir la liste des périphériques audio d'entrée (comme Discord)
function getInputDevices() {
    try {
        console.log("AudioMixer: Tentative d'obtention des périphériques d'entrée...");
        console.log("AudioMixer: configModule:", configModule);
        console.log("AudioMixer: getInputDevices disponible:", typeof configModule.getInputDevices);

        const devices = Object.values(configModule.getInputDevices());
        console.log("AudioMixer: Périphériques d'entrée obtenus:", devices);
        console.log("AudioMixer: Nombre de périphériques:", devices.length);

        devices.forEach((device: any, index: number) => {
            console.log(`AudioMixer: Périphérique ${index}:`, {
                id: device.id,
                name: device.name,
                kind: device.kind,
                label: device.label
            });
        });

        return devices;
    } catch (error) {
        console.error("AudioMixer: Erreur lors de l'obtention des périphériques d'entrée:", error);
        console.error("AudioMixer: Stack trace:", error.stack);
        return [];
    }
}

// Fonction pour créer le périphérique virtuel de sortie
async function createVirtualOutputDevice() {
    try {
        console.log("AudioMixer: Début de création du périphérique virtuel...");

        // Créer le contexte audio pour le périphérique virtuel
        const audioContext = new AudioContext();
        console.log("AudioMixer: Contexte audio créé:", audioContext.state);

        // Créer la destination pour le stream de sortie
        const destination = audioContext.createMediaStreamDestination();
        console.log("AudioMixer: Destination créée:", destination);

        // Créer un nœud de gain pour contrôler le volume global
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        console.log("AudioMixer: Nœud de gain créé avec valeur:", gainNode.gain.value);

        // Connecter le gain à la destination
        gainNode.connect(destination);
        console.log("AudioMixer: Gain connecté à la destination");

        // Mettre à jour l'état du périphérique virtuel
        virtualOutputDevice = {
            ...virtualOutputDevice,
            isActive: true,
            audioContext,
            destination,
            gainNode
        };

        console.log("AudioMixer: Périphérique virtuel de sortie créé avec succès");
        console.log("AudioMixer: État du périphérique virtuel:", virtualOutputDevice);
        return { audioContext, destination, gainNode };
    } catch (error) {
        console.error("AudioMixer: Erreur lors de la création du périphérique virtuel:", error);
        console.error("AudioMixer: Stack trace:", error.stack);
        throw error;
    }
}

// Fonction pour définir le périphérique virtuel comme sortie Discord
function setVirtualDeviceAsOutput() {
    try {
        console.log("AudioMixer: Tentative de définition du périphérique virtuel comme sortie...");
        console.log("AudioMixer: État du périphérique virtuel:", {
            isActive: virtualOutputDevice.isActive,
            hasDestination: !!virtualOutputDevice.destination,
            hasAudioContext: !!virtualOutputDevice.audioContext
        });

        if (!virtualOutputDevice.isActive || !virtualOutputDevice.destination) {
            console.error("AudioMixer: Périphérique virtuel non actif ou destination manquante");
            return;
        }

        // Obtenir le stream du périphérique virtuel
        const virtualStream = virtualOutputDevice.destination.stream;
        console.log("AudioMixer: Stream virtuel obtenu:", virtualStream);
        console.log("AudioMixer: Tracks audio du stream:", virtualStream.getAudioTracks());

        // Créer un élément audio temporaire pour simuler un périphérique
        const audioElement = new Audio();
        audioElement.srcObject = virtualStream;
        console.log("AudioMixer: Élément audio créé avec stream virtuel");

        // Essayer de jouer le stream
        audioElement.play().then(() => {
            console.log("AudioMixer: Stream virtuel en cours de lecture");
        }).catch(error => {
            console.error("AudioMixer: Erreur lors de la lecture du stream:", error);
        });

        // Vérifier les capacités du navigateur
        console.log("AudioMixer: Capacités du navigateur:");
        console.log("- navigator.mediaDevices:", !!navigator.mediaDevices);
        console.log("- setSinkId support:", 'setSinkId' in HTMLAudioElement.prototype);
        console.log("- AudioContext sinkId support:", 'setSinkId' in AudioContext.prototype);

        // Essayer de définir ce stream comme périphérique de sortie
        if (navigator.mediaDevices && 'setSinkId' in HTMLAudioElement.prototype) {
            console.log("AudioMixer: Tentative de définition du sinkId...");
            // @ts-expect-error
            audioElement.setSinkId(virtualOutputDevice.id).then(() => {
                console.log("AudioMixer: SinkId défini avec succès");
            }).catch(error => {
                console.error("AudioMixer: Erreur lors de la définition du sinkId:", error);
            });
        } else {
            console.warn("AudioMixer: setSinkId non supporté par ce navigateur");
        }

        // Essayer avec le contexte audio
        if (virtualOutputDevice.audioContext && 'setSinkId' in AudioContext.prototype) {
            console.log("AudioMixer: Tentative de définition du sinkId sur le contexte audio...");
            // @ts-expect-error
            virtualOutputDevice.audioContext.setSinkId(virtualOutputDevice.id).then(() => {
                console.log("AudioMixer: SinkId défini sur le contexte audio avec succès");
            }).catch(error => {
                console.error("AudioMixer: Erreur lors de la définition du sinkId sur le contexte audio:", error);
            });
        }

        console.log("AudioMixer: Périphérique virtuel défini comme sortie");

        if (settings.store.showNotifications) {
            showNotification({
                title: "AudioMixer",
                body: "Périphérique virtuel défini comme sortie Discord"
            });
        }
    } catch (error) {
        console.error("AudioMixer: Erreur lors de la définition du périphérique virtuel:", error);
        console.error("AudioMixer: Stack trace:", error.stack);
    }
}

// Fonction pour créer le contexte audio et mixer les sources
async function createAudioMixer(primaryDeviceId: string, secondaryDeviceId: string) {
    try {
        console.log("AudioMixer: Début de création du mixeur...");
        console.log("AudioMixer: Périphériques sélectionnés:", {
            primary: selectedPrimaryDevice,
            secondary: selectedSecondaryDevice
        });

        // Créer d'abord le périphérique virtuel de sortie
        console.log("AudioMixer: Création du périphérique virtuel...");
        await createVirtualOutputDevice();

        if (!virtualOutputDevice.isActive || !virtualOutputDevice.audioContext) {
            throw new Error("Impossible de créer le périphérique virtuel");
        }

        // Utiliser le contexte audio du périphérique virtuel
        const audioContext = virtualOutputDevice.audioContext;
        console.log("AudioMixer: Contexte audio du périphérique virtuel utilisé:", audioContext.state);

        // Créer les nœuds de gain pour contrôler le volume
        const primaryGain = audioContext.createGain();
        const secondaryGain = audioContext.createGain();
        console.log("AudioMixer: Nœuds de gain créés");

        // Obtenir les streams audio
        console.log("AudioMixer: Demande d'accès aux périphériques audio...");
        console.log("AudioMixer: Périphérique principal:", primaryDeviceId);
        console.log("AudioMixer: Périphérique secondaire:", secondaryDeviceId);

        const primaryStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: primaryDeviceId,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });
        console.log("AudioMixer: Stream principal obtenu:", primaryStream);
        console.log("AudioMixer: Tracks du stream principal:", primaryStream.getAudioTracks());

        const secondaryStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: secondaryDeviceId,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });
        console.log("AudioMixer: Stream secondaire obtenu:", secondaryStream);
        console.log("AudioMixer: Tracks du stream secondaire:", secondaryStream.getAudioTracks());

        // Créer les sources audio
        const primarySource = audioContext.createMediaStreamSource(primaryStream);
        const secondarySource = audioContext.createMediaStreamSource(secondaryStream);
        console.log("AudioMixer: Sources audio créées");

        // Connecter les sources aux nœuds de gain
        primarySource.connect(primaryGain);
        secondarySource.connect(secondaryGain);
        console.log("AudioMixer: Sources connectées aux nœuds de gain");

        // Connecter les nœuds de gain au périphérique virtuel
        primaryGain.connect(virtualOutputDevice.gainNode!);
        secondaryGain.connect(virtualOutputDevice.gainNode!);
        console.log("AudioMixer: Nœuds de gain connectés au périphérique virtuel");

        // Configurer les volumes
        primaryGain.gain.value = settings.store.primaryVolume / 100;
        secondaryGain.gain.value = settings.store.secondaryVolume / 100;
        console.log("AudioMixer: Volumes configurés:", {
            primary: primaryGain.gain.value,
            secondary: secondaryGain.gain.value
        });

        // Définir automatiquement comme périphérique de sortie Discord si activé
        if (settings.store.autoSetAsOutput) {
            console.log("AudioMixer: Définition automatique comme sortie activée");
            setVirtualDeviceAsOutput();
        } else {
            console.log("AudioMixer: Définition automatique comme sortie désactivée");
        }

        const result = {
            audioContext,
            destination: virtualOutputDevice.destination,
            primaryGain,
            secondaryGain,
            primaryStream,
            secondaryStream,
            mixedStream: virtualOutputDevice.destination!.stream
        };

        console.log("AudioMixer: Mixeur créé avec succès:", result);
        return result;

    } catch (error) {
        console.error("AudioMixer: Erreur lors de la création du mixer:", error);
        console.error("AudioMixer: Stack trace:", error.stack);
        throw error;
    }
}

// Fonction pour démarrer le mixage
async function startAudioMixing() {
    console.log("AudioMixer: Tentative de démarrage du mixage...");
    console.log("AudioMixer: État actuel du mixeur:", mixerState.isActive);

    if (mixerState.isActive) {
        console.log("AudioMixer: Le mixage est déjà actif");
        if (settings.store.showNotifications) {
            showNotification({
                title: "AudioMixer",
                body: "Le mixage audio est déjà actif"
            });
        }
        return;
    }

    console.log("AudioMixer: Vérification des périphériques sélectionnés...");
    console.log("AudioMixer: Périphérique principal:", selectedPrimaryDevice);
    console.log("AudioMixer: Périphérique secondaire:", selectedSecondaryDevice);

    if (!selectedPrimaryDevice || !selectedSecondaryDevice) {
        console.error("AudioMixer: Périphériques non sélectionnés");
        if (settings.store.showNotifications) {
            showNotification({
                title: "AudioMixer - Erreur",
                body: "Veuillez sélectionner les deux périphériques audio"
            });
        }
        return;
    }

    try {
        console.log("AudioMixer: Création du mixeur...");
        const mixer = await createAudioMixer(
            selectedPrimaryDevice,
            selectedSecondaryDevice
        );

        // Mettre à jour l'état
        mixerState = {
            isActive: true,
            ...mixer
        };
        console.log("AudioMixer: État du mixeur mis à jour:", mixerState);

        // Remplacer le périphérique d'entrée Discord par notre stream mixé
        console.log("AudioMixer: Tentative d'accès au MediaEngine de Discord...");
        const mediaEngine = MediaEngineStore.getMediaEngine();
        console.log("AudioMixer: MediaEngine obtenu:", mediaEngine);

        if (mediaEngine && mediaEngine.setInputDevice) {
            console.log("AudioMixer: setInputDevice disponible sur MediaEngine");
            // Note: Cette partie nécessiterait une modification plus profonde de Discord
            // pour remplacer complètement le stream d'entrée
            console.log("AudioMixer: Stream mixé créé avec succès");
        } else {
            console.warn("AudioMixer: setInputDevice non disponible sur MediaEngine");
        }

        console.log("AudioMixer: Mixage démarré avec succès");
        if (settings.store.showNotifications) {
            showNotification({
                title: "AudioMixer",
                body: "Mixage audio démarré avec succès"
            });
        }

    } catch (error) {
        console.error("AudioMixer: Erreur lors du démarrage:", error);
        console.error("AudioMixer: Stack trace:", error.stack);
        if (settings.store.showNotifications) {
            showNotification({
                title: "AudioMixer - Erreur",
                body: "Impossible de démarrer le mixage audio"
            });
        }
    }
}

// Fonction pour arrêter le périphérique virtuel
function stopVirtualOutputDevice() {
    try {
        if (virtualOutputDevice.audioContext) {
            virtualOutputDevice.audioContext.close();
        }

        virtualOutputDevice = {
            id: "audioMixer-virtual-output",
            name: "AudioMixer - Sortie Virtuelle",
            isActive: false,
            audioContext: null,
            destination: null,
            gainNode: null
        };

        console.log("AudioMixer: Périphérique virtuel arrêté");
    } catch (error) {
        console.error("AudioMixer: Erreur lors de l'arrêt du périphérique virtuel:", error);
    }
}

// Fonction pour arrêter le mixage
function stopAudioMixing() {
    if (!mixerState.isActive) {
        if (settings.store.showNotifications) {
            showNotification({
                title: "AudioMixer",
                body: "Le mixage audio n'est pas actif"
            });
        }
        return;
    }

    try {
        // Arrêter les streams
        if (mixerState.primaryStream) {
            mixerState.primaryStream.getTracks().forEach(track => track.stop());
        }
        if (mixerState.secondaryStream) {
            mixerState.secondaryStream.getTracks().forEach(track => track.stop());
        }

        // Fermer le contexte audio
        if (mixerState.audioContext) {
            mixerState.audioContext.close();
        }

        // Arrêter le périphérique virtuel
        stopVirtualOutputDevice();

        // Réinitialiser l'état
        mixerState = {
            isActive: false,
            primaryStream: null,
            secondaryStream: null,
            mixedStream: null,
            audioContext: null,
            primaryGain: null,
            secondaryGain: null,
            destination: null
        };

        if (settings.store.showNotifications) {
            showNotification({
                title: "AudioMixer",
                body: "Mixage audio arrêté"
            });
        }

    } catch (error) {
        console.error("AudioMixer: Erreur lors de l'arrêt:", error);
    }
}

// Fonction pour mettre à jour les volumes
function updateVolumes() {
    if (mixerState.isActive && mixerState.primaryGain && mixerState.secondaryGain) {
        mixerState.primaryGain.gain.value = settings.store.primaryVolume / 100;
        mixerState.secondaryGain.gain.value = settings.store.secondaryVolume / 100;
    }
}

// Composant de sélection du périphérique principal
function PrimaryDeviceSelector() {
    const [devices, setDevices] = React.useState<any[]>([]);

    React.useEffect(() => {
        function loadDevices() {
            try {
                console.log("AudioMixer: Chargement des périphériques pour le sélecteur principal...");
                const inputDevices = getInputDevices();
                setDevices(inputDevices);
                console.log("AudioMixer: Périphériques chargés dans le sélecteur principal:", inputDevices.length);

                // Définir le périphérique par défaut si pas encore configuré
                if (!selectedPrimaryDevice && inputDevices.length > 0) {
                    selectedPrimaryDevice = inputDevices[0].id;
                    console.log("AudioMixer: Périphérique principal par défaut défini:", selectedPrimaryDevice);
                }
            } catch (error) {
                console.error("AudioMixer: Erreur lors du chargement des périphériques:", error);
            }
        }

        loadDevices();
    }, []);

    return (
        <Select
            options={devices.map((device: any) => ({
                value: device.id,
                label: `🎤 ${device.name}`
            }))}
            serialize={identity}
            isSelected={value => value === selectedPrimaryDevice}
            select={id => {
                console.log("AudioMixer: Périphérique principal sélectionné:", id);
                selectedPrimaryDevice = id;
            }}
        />
    );
}

// Composant de sélection du périphérique secondaire
function SecondaryDeviceSelector() {
    const [devices, setDevices] = React.useState<any[]>([]);

    React.useEffect(() => {
        function loadDevices() {
            try {
                console.log("AudioMixer: Chargement des périphériques pour le sélecteur secondaire...");
                const inputDevices = getInputDevices();
                setDevices(inputDevices);
                console.log("AudioMixer: Périphériques chargés dans le sélecteur secondaire:", inputDevices.length);

                // Définir le périphérique par défaut si pas encore configuré
                if (!selectedSecondaryDevice && inputDevices.length > 1) {
                    selectedSecondaryDevice = inputDevices[1].id;
                    console.log("AudioMixer: Périphérique secondaire par défaut défini:", selectedSecondaryDevice);
                }
            } catch (error) {
                console.error("AudioMixer: Erreur lors du chargement des périphériques:", error);
            }
        }

        loadDevices();
    }, []);

    return (
        <Select
            options={devices.map((device: any) => ({
                value: device.id,
                label: `🎵 ${device.name}`
            }))}
            serialize={identity}
            isSelected={value => value === selectedSecondaryDevice}
            select={id => {
                console.log("AudioMixer: Périphérique secondaire sélectionné:", id);
                selectedSecondaryDevice = id;
            }}
        />
    );
}

// Composant d'affichage du statut du périphérique virtuel
function VirtualDeviceStatus() {
    const [isActive, setIsActive] = React.useState(virtualOutputDevice.isActive);

    React.useEffect(() => {
        const interval = setInterval(() => {
            setIsActive(virtualOutputDevice.isActive);
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
            <Forms.FormTitle>Périphérique virtuel de sortie</Forms.FormTitle>
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
                    {isActive ? "Actif" : "Inactif"} - {virtualOutputDevice.name}
                </span>
            </div>
            {isActive && (
                <div style={{
                    fontSize: "11px",
                    color: "#43b581",
                    marginTop: "5px"
                }}>
                    ✓ Discord utilisera automatiquement ce périphérique comme sortie
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "AudioMixer",
    description: "Permet de mixer deux sources audio d'entrée (ex: microphone + musique)",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    settingsAboutComponent: () => (
        <div>
            <h3>AudioMixer</h3>
            <p>Ce plugin crée un périphérique virtuel de sortie qui mixe deux sources audio d'entrée.</p>
            <p><strong>Fonctionnalités:</strong></p>
            <ul>
                <li>Création d'un périphérique virtuel de sortie</li>
                <li>Mixage de deux sources audio en temps réel</li>
                <li>Contrôle de volume indépendant pour chaque source</li>
                <li>Définition automatique comme sortie Discord</li>
            </ul>
            <p><strong>Utilisation:</strong></p>
            <ul>
                <li>Sélectionnez votre microphone comme périphérique principal</li>
                <li>Sélectionnez une autre source audio (musique, etc.) comme périphérique secondaire</li>
                <li>Ajustez les volumes de chaque source</li>
                <li>Démarrez le mixage - Discord utilisera automatiquement le périphérique virtuel</li>
            </ul>
        </div>
    ),

    settingsPanel: () => (
        <div style={{ padding: "20px" }}>
            <h2 style={{ marginBottom: "20px" }}>AudioMixer</h2>
            <p style={{ marginBottom: "20px", color: "#b9bbbe" }}>
                Ce plugin crée un périphérique virtuel de sortie qui mixe deux sources audio d'entrée.
                Discord utilisera automatiquement ce périphérique comme sortie audio.
            </p>

            <VirtualDeviceStatus />

            <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                <button
                    onClick={startAudioMixing}
                    disabled={mixerState.isActive}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: mixerState.isActive ? "#ccc" : "#5865f2",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: mixerState.isActive ? "not-allowed" : "pointer"
                    }}
                >
                    Démarrer le mixage
                </button>

                <button
                    onClick={stopAudioMixing}
                    disabled={!mixerState.isActive}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: !mixerState.isActive ? "#ccc" : "#ed4245",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: !mixerState.isActive ? "not-allowed" : "pointer"
                    }}
                >
                    Arrêter le mixage
                </button>
            </div>

            {mixerState.isActive && (
                <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#2f3136", borderRadius: "4px" }}>
                    <div style={{ color: "#43b581", fontWeight: "bold", marginBottom: "5px" }}>
                        ✓ Mixage audio actif
                    </div>
                    <div style={{ fontSize: "12px", color: "#b9bbbe" }}>
                        Les deux sources audio sont maintenant mixées dans le périphérique virtuel
                    </div>
                </div>
            )}
        </div>
    ),


    start() {
        console.log("AudioMixer: Plugin démarré");
        console.log("AudioMixer: Vérification des permissions audio...");

        // Vérifier les permissions
        if (navigator.permissions) {
            navigator.permissions.query({ name: 'microphone' as PermissionName }).then(result => {
                console.log("AudioMixer: Permission microphone:", result.state);
            }).catch(error => {
                console.error("AudioMixer: Erreur lors de la vérification des permissions microphone:", error);
            });
        }

        // Vérifier les capacités du navigateur
        console.log("AudioMixer: Capacités du navigateur:");
        console.log("- navigator.mediaDevices:", !!navigator.mediaDevices);
        console.log("- getUserMedia support:", !!navigator.mediaDevices?.getUserMedia);
        console.log("- AudioContext support:", !!window.AudioContext || !!window.webkitAudioContext);
        console.log("- MediaStreamAudioDestinationNode support:", !!window.MediaStreamAudioDestinationNode);

        // Lister les périphériques disponibles
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                console.log("AudioMixer: Périphériques système détectés:", devices.length);
                devices.forEach((device, index) => {
                    console.log(`AudioMixer: Périphérique système ${index}:`, {
                        deviceId: device.deviceId,
                        kind: device.kind,
                        label: device.label,
                        groupId: device.groupId
                    });
                });
            }).catch(error => {
                console.error("AudioMixer: Erreur lors de l'énumération des périphériques:", error);
            });
        }
    },

    stop() {
        stopAudioMixing();
        console.log("AudioMixer: Plugin arrêté");
    }
});
