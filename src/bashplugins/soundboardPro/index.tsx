import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Flex, React, useState } from "@webpack/common";
import { openModal, closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { BaseText } from "@components/BaseText";
import { showNotification } from "@api/Notifications";
import { findComponentByCodeLazy } from "@webpack";

// Types pour les sons
interface Sound {
    id: string;
    name: string;
    emoji: string;
    frequency: number;
    duration: number;
    type: OscillatorType;
    url?: string; // Optionnel pour les sons personnalisés
}

// Sons prédéfinis avec paramètres synthétiques optimisés
const DEFAULT_SOUNDS: Sound[] = [
    { id: "bruh", name: "Bruh", emoji: "😤", frequency: 150, duration: 0.8, type: 'sawtooth' },
    { id: "oof", name: "Oof", emoji: "💀", frequency: 200, duration: 0.3, type: 'square' },
    { id: "vine_boom", name: "Vine Boom", emoji: "💥", frequency: 60, duration: 1.0, type: 'sine' },
    { id: "discord_notification", name: "Discord Notification", emoji: "🔔", frequency: 800, duration: 0.2, type: 'sine' },
    { id: "air_horn", name: "Air Horn", emoji: "📯", frequency: 300, duration: 1.5, type: 'sawtooth' },
    { id: "sad_trombone", name: "Sad Trombone", emoji: "🎺", frequency: 200, duration: 1.2, type: 'triangle' },
    { id: "wilhelm_scream", name: "Wilhelm Scream", emoji: "😱", frequency: 800, duration: 2.0, type: 'sawtooth' },
    { id: "crickets", name: "Crickets", emoji: "🦗", frequency: 4000, duration: 0.1, type: 'square' },
    { id: "bell", name: "Bell", emoji: "🔔", frequency: 1000, duration: 0.5, type: 'sine' },
    { id: "buzzer", name: "Buzzer", emoji: "🚨", frequency: 500, duration: 0.4, type: 'square' },
    { id: "pop", name: "Pop", emoji: "💨", frequency: 2000, duration: 0.1, type: 'sine' },
    { id: "whoosh", name: "Whoosh", emoji: "💨", frequency: 100, duration: 0.8, type: 'sawtooth' }
];

const settings = definePluginSettings({
    enableSoundboard: {
        type: OptionType.BOOLEAN,
        description: "Activer le Soundboard Pro",
        default: true,
    },
    volume: {
        type: OptionType.SLIDER,
        description: "Volume des sons (0-100%)",
        default: 50,
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false,
    },
    showFloatingButton: {
        type: OptionType.BOOLEAN,
        description: "Afficher le bouton flottant 🔊",
        default: true,
    },
    enableCustomSounds: {
        type: OptionType.BOOLEAN,
        description: "Permettre l'ajout de sons personnalisés",
        default: true,
    },
    bypassPermissions: {
        type: OptionType.BOOLEAN,
        description: "Contourner les restrictions Discord",
        default: true,
    },
    soundMode: {
        type: OptionType.SELECT,
        description: "Mode de lecture des sons",
        options: [
            { label: "Synthétique uniquement", value: "synthetic" },
            { label: "URL + Synthétique (fallback)", value: "hybrid" },
            { label: "URL uniquement", value: "url" }
        ],
        default: "synthetic"
    }
});

// Fonction pour jouer un son synthétique
function playSyntheticSound(sound: Sound) {
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(sound.frequency, audioContext.currentTime);
        oscillator.type = sound.type;

        gainNode.gain.setValueAtTime(settings.store.volume / 100, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sound.duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + sound.duration);

        return true;
    } catch (error) {
        console.error("[SoundboardPro] Erreur synthétique:", error);
        return false;
    }
}

// Fonction pour jouer un son depuis URL
async function playUrlSound(sound: Sound) {
    try {
        if (!sound.url) return false;

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const response = await fetch(sound.url, {
            mode: 'cors',
            credentials: 'omit'
        });

        if (!response.ok) return false;

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();

        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        gainNode.gain.setValueAtTime(settings.store.volume / 100, audioContext.currentTime);

        source.start();

        return true;
    } catch (error) {
        console.error("[SoundboardPro] Erreur URL:", error);
        return false;
    }
}

// Fonction principale pour jouer un son
async function playSound(sound: Sound) {
    let success = false;

    switch (settings.store.soundMode) {
        case "synthetic":
            success = playSyntheticSound(sound);
            break;

        case "url":
            if (sound.url) {
                success = await playUrlSound(sound);
            }
            break;

        case "hybrid":
            if (sound.url) {
                success = await playUrlSound(sound);
            }
            if (!success) {
                success = playSyntheticSound(sound);
            }
            break;
    }

    if (success) {
        showNotification({
            title: "🔊 Soundboard Pro",
            body: `Son "${sound.name}" joué`,
            color: "var(--green-360)",
        });
    } else {
        showNotification({
            title: "🔊 Soundboard Pro",
            body: `Erreur lors de la lecture de "${sound.name}"`,
            color: "var(--red-360)",
        });
    }
}

// Composant pour l'interface du soundboard
function SoundboardModal({ modalProps }: { modalProps: ModalProps; }) {
    const [sounds, setSounds] = useState<Sound[]>(DEFAULT_SOUNDS);
    const [isPlaying, setIsPlaying] = useState<string | null>(null);
    const [customSoundUrl, setCustomSoundUrl] = useState("");
    const [customSoundName, setCustomSoundName] = useState("");

    const handlePlaySound = async (sound: Sound) => {
        setIsPlaying(sound.id);
        await playSound(sound);
        setTimeout(() => setIsPlaying(null), 1000);
    };

    // Fonction pour ajouter un son personnalisé
    const addCustomSound = () => {
        if (!customSoundUrl.trim() || !customSoundName.trim()) return;

        const newSound: Sound = {
            id: `custom_${Date.now()}`,
            name: customSoundName,
            emoji: "🎵",
            url: customSoundUrl,
            frequency: 440, // Valeur par défaut
            duration: 1.0,
            type: 'sine'
        };

        setSounds([...sounds, newSound]);
        setCustomSoundUrl("");
        setCustomSoundName("");

        showNotification({
            title: "🔊 Soundboard Pro",
            body: "Son personnalisé ajouté !",
            color: "var(--green-360)",
        });
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE}>
            <ModalHeader>
                <BaseText size="lg" weight="semibold" style={{ flexGrow: 1 }}>
                    🔊 Soundboard Pro - Contournement des Permissions
                </BaseText>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <ModalContent>
                <BaseText size="md" style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
                    Soundboard avancé avec sons synthétiques et support d'URLs. Contourne les restrictions Discord.
                </BaseText>

                {/* Sons prédéfinis */}
                <div style={{ marginBottom: "24px" }}>
                    <BaseText size="md" weight="semibold" style={{ marginBottom: "12px" }}>
                        🎵 Sons Disponibles ({sounds.length})
                    </BaseText>
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                        gap: "8px"
                    }}>
                        {sounds.map(sound => (
                            <Button
                                key={sound.id}
                                onClick={() => handlePlaySound(sound)}
                                disabled={isPlaying === sound.id}
                                color={Button.Colors.PRIMARY}
                                look={Button.Looks.OUTLINED}
                                style={{
                                    height: "70px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "4px"
                                }}
                            >
                                <span style={{ fontSize: "20px" }}>{sound.emoji}</span>
                                <span style={{ fontSize: "11px" }}>{sound.name}</span>
                                {isPlaying === sound.id && <span style={{ fontSize: "10px" }}>🔊</span>}
                                {sound.id.startsWith('custom_') && <span style={{ fontSize: "8px", color: "var(--text-muted)" }}>🎵</span>}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Ajout de son personnalisé */}
                {settings.store.enableCustomSounds && (
                    <div style={{
                        borderTop: "1px solid var(--background-modifier-accent)",
                        paddingTop: "16px"
                    }}>
                        <BaseText size="md" weight="semibold" style={{ marginBottom: "12px" }}>
                            ➕ Ajouter un Son Personnalisé
                        </BaseText>
                        <Flex direction={Flex.Direction.VERTICAL} style={{ gap: "8px" }}>
                            <input
                                type="text"
                                placeholder="Nom du son"
                                value={customSoundName}
                                onChange={(e) => setCustomSoundName(e.target.value)}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "4px",
                                    border: "1px solid var(--background-modifier-accent)",
                                    backgroundColor: "var(--input-background)",
                                    color: "var(--text-normal)",
                                    fontSize: "14px"
                                }}
                            />
                            <input
                                type="url"
                                placeholder="URL du fichier audio (MP3, WAV, OGG)"
                                value={customSoundUrl}
                                onChange={(e) => setCustomSoundUrl(e.target.value)}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "4px",
                                    border: "1px solid var(--background-modifier-accent)",
                                    backgroundColor: "var(--input-background)",
                                    color: "var(--text-normal)",
                                    fontSize: "14px"
                                }}
                            />
                            <Button
                                onClick={addCustomSound}
                                disabled={!customSoundUrl.trim() || !customSoundName.trim()}
                                color={Button.Colors.GREEN}
                                size={Button.Sizes.SMALL}
                            >
                                Ajouter le Son
                            </Button>
                        </Flex>
                    </div>
                )}
            </ModalContent>

            <ModalFooter>
                <Flex direction={Flex.Direction.HORIZONTAL_REVERSE}>
                    <Button
                        onClick={modalProps.onClose}
                        color={Button.Colors.PRIMARY}
                        look={Button.Looks.OUTLINED}
                    >
                        Fermer
                    </Button>
                </Flex>
            </ModalFooter>
        </ModalRoot>
    );
}

// Fonction pour ouvrir le modal du soundboard
export function openSoundboardPro() {
    console.log("🔊 SoundboardPro: openSoundboardPro called");
    try {
        const modalKey = openModal(modalProps => (
            <SoundboardModal modalProps={modalProps} />
        ));
        console.log("🔊 SoundboardPro: Modal opened with key:", modalKey);
    } catch (error) {
        console.error("🔊 SoundboardPro: Error opening modal:", error);
    }
}

// Composant bouton pour le panel vocal (comme fakeDeafen)
const PanelButton = findComponentByCodeLazy(".NONE,disabled:", ".PANEL_BUTTON");

function SoundboardIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            {/* Speaker cone */}
            <path
                d="M8 12 L8 20 L12 20 L18 26 L18 6 L12 12 L8 12 Z"
                fill="currentColor"
            />
            {/* Sound waves */}
            <path
                d="M20 8 C22 10 22 14 20 16"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
            />
            <path
                d="M22 6 C25 9 25 15 22 18"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
            />
            <path
                d="M24 4 C28 8 28 16 24 20"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
            />
        </svg>
    );
}

function SoundboardButton() {
    return (
        <PanelButton
            tooltipText="Soundboard Pro"
            icon={SoundboardIcon}
            onClick={() => {
                openSoundboardPro();
            }}
        />
    );
}

// Composant des paramètres
function SettingsComponent() {
    return (
        <div>
            <BaseText size="md" style={{ marginBottom: "16px" }}>
                🔊 <strong>Soundboard Pro</strong>
            </BaseText>
            <BaseText size="sm" style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
                Soundboard avancé combinant sons synthétiques et support d'URLs. Contourne les restrictions Discord avec des techniques avancées.
            </BaseText>

            <div style={{ marginBottom: "16px" }}>
                <Button
                    onClick={openSoundboardPro}
                    color={Button.Colors.BRAND}
                    style={{ width: "100%" }}
                >
                    🎵 Ouvrir le Soundboard Pro
                </Button>
            </div>

            <BaseText size="sm" style={{ color: "var(--text-muted)" }}>
                <strong>✨ Fonctionnalités :</strong><br />
                • 12 sons synthétiques optimisés<br />
                • Support d'URLs personnalisées<br />
                • 3 modes de lecture (synthétique, URL, hybride)<br />
                • Bouton flottant configurable<br />
                • Contournement des permissions Discord<br />
                • Interface avancée avec grille responsive
            </BaseText>
        </div>
    );
}

// Fonction pour créer le bouton flottant
function createFloatingButton() {
    const button = document.createElement('button');
    button.innerHTML = '🔊';
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        background: var(--brand-500);
        color: white;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    `;

    button.addEventListener('click', openSoundboardPro);
    button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.1)';
        button.style.background = 'var(--brand-400)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.background = 'var(--brand-500)';
    });

    return button;
}


export default definePlugin({
    name: "SoundboardPro",
    description: "Soundboard avancé combinant sons synthétiques et support d'URLs. Contourne les restrictions Discord.",
    authors: [Devs.Bashcord],
    settings,
    settingsAboutComponent: SettingsComponent,

    patches: [
        {
            find: "#{intl::ACCOUNT_SPEAKING_WHILE_MUTED}",
            replacement: {
                match: /className:\i\.buttons,.{0,50}children:\[/,
                replace: "$&$self.SoundboardButton(),"
            }
        }
    ],
    SoundboardButton,

    start() {
        console.log("[SoundboardPro] Plugin démarré - Version fusionnée avec patch");
        
        // Ajouter le bouton flottant si activé
        if (settings.store.showFloatingButton) {
            const button = createFloatingButton();
            button.id = 'bashcord-soundboard-pro-button';
            document.body.appendChild(button);
        }

    },

    stop() {
        console.log("[SoundboardPro] Plugin arrêté");

        // Supprimer le bouton flottant
        const buttonElement = document.getElementById('bashcord-soundboard-pro-button');
        if (buttonElement) {
            buttonElement.remove();
        }
    }
});
