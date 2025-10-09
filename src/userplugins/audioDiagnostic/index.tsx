/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { findByPropsLazy } from "@webpack";
import { React, Forms, Button } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

const configModule = findByPropsLazy("getOutputVolume");

const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher les notifications"
    }
});

// Fonction de diagnostic complet
async function runFullDiagnostic() {
    console.log("=== DIAGNOSTIC AUDIO COMPLET ===");

    try {
        // 1. Vérifier les capacités du navigateur
        console.log("1. Vérification des capacités du navigateur:");
        console.log("- User Agent:", navigator.userAgent);
        console.log("- navigator.mediaDevices:", !!navigator.mediaDevices);
        console.log("- getUserMedia support:", !!navigator.mediaDevices?.getUserMedia);
        console.log("- AudioContext support:", !!window.AudioContext || !!window.webkitAudioContext);
        console.log("- MediaStreamAudioDestinationNode support:", !!window.MediaStreamAudioDestinationNode);
        console.log("- setSinkId support (HTMLAudioElement):", 'setSinkId' in HTMLAudioElement.prototype);
        console.log("- setSinkId support (AudioContext):", 'setSinkId' in AudioContext.prototype);

        // 2. Vérifier les permissions
        console.log("2. Vérification des permissions:");
        if (navigator.permissions) {
            try {
                const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                console.log("- Permission microphone:", micPermission.state);
            } catch (error) {
                console.error("- Erreur permission microphone:", error);
            }
        } else {
            console.log("- API Permissions non supportée");
        }

        // 3. Lister les périphériques système
        console.log("3. Périphériques système:");
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                console.log("- Nombre total de périphériques:", devices.length);

                const audioInputs = devices.filter(d => d.kind === 'audioinput');
                const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

                console.log("- Périphériques d'entrée audio:", audioInputs.length);
                audioInputs.forEach((device, index) => {
                    console.log(`  ${index}: ${device.label || 'Sans nom'} (${device.deviceId})`);
                });

                console.log("- Périphériques de sortie audio:", audioOutputs.length);
                audioOutputs.forEach((device, index) => {
                    console.log(`  ${index}: ${device.label || 'Sans nom'} (${device.deviceId})`);
                });
            } catch (error) {
                console.error("- Erreur lors de l'énumération des périphériques:", error);
            }
        }

        // 4. Vérifier Discord configModule
        console.log("4. Module de configuration Discord:");
        console.log("- configModule:", configModule);
        console.log("- getInputDevices disponible:", typeof configModule.getInputDevices);
        console.log("- getOutputDevices disponible:", typeof configModule.getOutputDevices);
        console.log("- getInputDeviceId disponible:", typeof configModule.getInputDeviceId);
        console.log("- getOutputDeviceId disponible:", typeof configModule.getOutputDeviceId);

        if (typeof configModule.getInputDevices === 'function') {
            try {
                const discordInputDevices = Object.values(configModule.getInputDevices());
                console.log("- Périphériques d'entrée Discord:", discordInputDevices.length);
                discordInputDevices.forEach((device: any, index: number) => {
                    console.log(`  ${index}: ${device.name} (${device.id})`);
                });
            } catch (error) {
                console.error("- Erreur lors de l'obtention des périphériques Discord:", error);
            }
        }

        if (typeof configModule.getOutputDevices === 'function') {
            try {
                const discordOutputDevices = Object.values(configModule.getOutputDevices());
                console.log("- Périphériques de sortie Discord:", discordOutputDevices.length);
                discordOutputDevices.forEach((device: any, index: number) => {
                    console.log(`  ${index}: ${device.name} (${device.id})`);
                });
            } catch (error) {
                console.error("- Erreur lors de l'obtention des périphériques de sortie Discord:", error);
            }
        }

        // 5. Test de création d'un contexte audio
        console.log("5. Test de création d'un contexte audio:");
        try {
            const testContext = new AudioContext();
            console.log("- Contexte audio créé avec succès");
            console.log("- État:", testContext.state);
            console.log("- Sample rate:", testContext.sampleRate);
            console.log("- Base latency:", testContext.baseLatency);

            // Test de création d'une destination
            const testDestination = testContext.createMediaStreamDestination();
            console.log("- Destination créée avec succès");
            console.log("- Stream:", testDestination.stream);
            console.log("- Tracks:", testDestination.stream.getAudioTracks());

            // Test de création d'un nœud de gain
            const testGain = testContext.createGain();
            console.log("- Nœud de gain créé avec succès");
            console.log("- Valeur de gain:", testGain.gain.value);

            // Nettoyer
            testContext.close();
            console.log("- Contexte de test fermé");
        } catch (error) {
            console.error("- Erreur lors du test du contexte audio:", error);
        }

        // 6. Test d'accès aux périphériques
        console.log("6. Test d'accès aux périphériques:");
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                console.log("- Tentative d'accès au microphone par défaut...");
                const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log("- Accès au microphone réussi");
                console.log("- Stream:", testStream);
                console.log("- Tracks:", testStream.getAudioTracks());

                // Arrêter les tracks
                testStream.getTracks().forEach(track => track.stop());
                console.log("- Stream de test fermé");
            } catch (error) {
                console.error("- Erreur lors de l'accès au microphone:", error);
            }
        }

        console.log("=== FIN DU DIAGNOSTIC ===");

        if (settings.store.showNotifications) {
            showNotification({
                title: "Audio Diagnostic",
                body: "Diagnostic complet terminé - Vérifiez la console pour les détails"
            });
        }

    } catch (error) {
        console.error("Erreur lors du diagnostic:", error);
        if (settings.store.showNotifications) {
            showNotification({
                title: "Audio Diagnostic - Erreur",
                body: "Erreur lors du diagnostic - Vérifiez la console"
            });
        }
    }
}

// Composant de diagnostic
function DiagnosticPanel() {
    return (
        <div style={{ padding: "20px" }}>
            <h2 style={{ marginBottom: "20px" }}>Audio Diagnostic</h2>
            <p style={{ marginBottom: "20px", color: "#b9bbbe" }}>
                Cet outil de diagnostic vous aide à identifier les problèmes avec les plugins audio.
                Cliquez sur le bouton ci-dessous pour lancer un diagnostic complet.
            </p>

            <Button
                onClick={runFullDiagnostic}
                style={{
                    padding: "10px 20px",
                    backgroundColor: "#5865f2",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px"
                }}
            >
                Lancer le diagnostic complet
            </Button>

            <div style={{
                marginTop: "20px",
                padding: "15px",
                backgroundColor: "#2f3136",
                borderRadius: "4px",
                border: "1px solid #40444b"
            }}>
                <h3 style={{ marginBottom: "10px", color: "#ffffff" }}>Instructions:</h3>
                <ol style={{ color: "#b9bbbe", paddingLeft: "20px" }}>
                    <li>Ouvrez la console de développement (F12)</li>
                    <li>Cliquez sur "Lancer le diagnostic complet"</li>
                    <li>Vérifiez les logs dans la console</li>
                    <li>Partagez les résultats si vous avez des problèmes</li>
                </ol>
            </div>

            <div style={{
                marginTop: "15px",
                padding: "15px",
                backgroundColor: "#2f3136",
                borderRadius: "4px",
                border: "1px solid #40444b"
            }}>
                <h3 style={{ marginBottom: "10px", color: "#ffffff" }}>Problèmes courants:</h3>
                <ul style={{ color: "#b9bbbe", paddingLeft: "20px" }}>
                    <li><strong>Permissions refusées:</strong> Autorisez l'accès au microphone</li>
                    <li><strong>Périphériques non détectés:</strong> Vérifiez les pilotes audio</li>
                    <li><strong>setSinkId non supporté:</strong> Votre navigateur ne supporte pas cette fonctionnalité</li>
                    <li><strong>Contexte audio suspendu:</strong> Cliquez quelque part pour activer l'audio</li>
                </ul>
            </div>
        </div>
    );
}

export default definePlugin({
    name: "Audio Diagnostic",
    description: "Outil de diagnostic pour les plugins audio",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    settingsAboutComponent: () => (
        <div>
            <h3>Audio Diagnostic</h3>
            <p>Cet outil de diagnostic vous aide à identifier les problèmes avec les plugins audio AudioMixer et Virtual Output.</p>
            <p><strong>Fonctionnalités:</strong></p>
            <ul>
                <li>Vérification des capacités du navigateur</li>
                <li>Test des permissions audio</li>
                <li>Énumération des périphériques système</li>
                <li>Test de création de contexte audio</li>
                <li>Diagnostic des modules Discord</li>
            </ul>
            <p><strong>Utilisation:</strong> Lancez le diagnostic et vérifiez la console pour les détails.</p>
        </div>
    ),

    settingsPanel: () => <DiagnosticPanel />,

    start() {
        console.log("Audio Diagnostic: Plugin démarré");
    },

    stop() {
        console.log("Audio Diagnostic: Plugin arrêté");
    }
});
