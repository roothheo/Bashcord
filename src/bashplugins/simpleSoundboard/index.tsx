import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Logger } from "@utils/Logger";
import { Button, Flex, React, useState } from "@webpack/common";
import { openModal, closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { BaseText } from "@components/BaseText";
import { showNotification } from "@api/Notifications";
import { addButton, removeButton } from "@api/MessagePopover";

// Sons prédéfinis avec paramètres synthétiques
const SOUNDS = [
    { id: "bruh", name: "Bruh", emoji: "😤", frequency: 150, duration: 0.8, type: 'sawtooth' as OscillatorType },
    { id: "oof", name: "Oof", emoji: "💀", frequency: 200, duration: 0.3, type: 'square' as OscillatorType },
    { id: "vine_boom", name: "Vine Boom", emoji: "💥", frequency: 60, duration: 1.0, type: 'sine' as OscillatorType },
    { id: "discord_notification", name: "Discord Notification", emoji: "🔔", frequency: 800, duration: 0.2, type: 'sine' as OscillatorType },
    { id: "air_horn", name: "Air Horn", emoji: "📯", frequency: 300, duration: 1.5, type: 'sawtooth' as OscillatorType },
    { id: "sad_trombone", name: "Sad Trombone", emoji: "🎺", frequency: 200, duration: 1.2, type: 'triangle' as OscillatorType },
    { id: "wilhelm_scream", name: "Wilhelm Scream", emoji: "😱", frequency: 800, duration: 2.0, type: 'sawtooth' as OscillatorType },
    { id: "crickets", name: "Crickets", emoji: "🦗", frequency: 4000, duration: 0.1, type: 'square' as OscillatorType }
];

const settings = definePluginSettings({
    enableSoundboard: {
        type: OptionType.BOOLEAN,
        description: "Activer le Soundboard simple",
        default: true,
    },
    volume: {
        type: OptionType.SLIDER,
        description: "Volume des sons (0-100%)",
        default: 50,
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false,
    },
    showButton: {
        type: OptionType.BOOLEAN,
        description: "Afficher le bouton Soundboard dans l'interface",
        default: true,
    }
});

// Fonction pour jouer un son synthétique
function playSound(sound: typeof SOUNDS[0]) {
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
        
        showNotification({
            title: "🔊 Soundboard",
            body: `Son "${sound.name}" joué`,
            color: "var(--green-360)",
        });
        
    } catch (error) {
        console.error("[SimpleSoundboard] Erreur:", error);
        showNotification({
            title: "🔊 Soundboard",
            body: `Erreur lors de la lecture de "${sound.name}"`,
            color: "var(--red-360)",
        });
    }
}

// Composant pour l'interface du soundboard
function SoundboardModal({ modalProps }: { modalProps: ModalProps; }) {
    const [isPlaying, setIsPlaying] = useState<string | null>(null);

    const handlePlaySound = (sound: typeof SOUNDS[0]) => {
        setIsPlaying(sound.id);
        playSound(sound);
        setTimeout(() => setIsPlaying(null), sound.duration * 1000 + 100);
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <BaseText size="lg" weight="semibold" style={{ flexGrow: 1 }}>
                    🔊 Soundboard Simple
                </BaseText>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            
            <ModalContent>
                <BaseText size="md" style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
                    Cliquez sur un son pour le jouer instantanément.
                </BaseText>
                
                <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", 
                    gap: "8px" 
                }}>
                    {SOUNDS.map(sound => (
                        <Button
                            key={sound.id}
                            onClick={() => handlePlaySound(sound)}
                            disabled={isPlaying === sound.id}
                            color={Button.Colors.PRIMARY}
                            look={Button.Looks.OUTLINED}
                            style={{ 
                                height: "80px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px"
                            }}
                        >
                            <span style={{ fontSize: "24px" }}>{sound.emoji}</span>
                            <span style={{ fontSize: "12px" }}>{sound.name}</span>
                            {isPlaying === sound.id && <span style={{ fontSize: "10px" }}>🔊</span>}
                        </Button>
                    ))}
                </div>
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
export function openSimpleSoundboard() {
    console.log("🔊 SimpleSoundboard: openSimpleSoundboard called");
    try {
        const modalKey = openModal(modalProps => (
            <SoundboardModal modalProps={modalProps} />
        ));
        console.log("🔊 SimpleSoundboard: Modal opened with key:", modalKey);
    } catch (error) {
        console.error("🔊 SimpleSoundboard: Error opening modal:", error);
    }
}

// Composant des paramètres
function SettingsComponent() {
    return (
        <div>
            <BaseText size="md" style={{ marginBottom: "16px" }}>
                🔊 <strong>Soundboard Simple</strong>
            </BaseText>
            <BaseText size="sm" style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
                Soundboard ultra-simple avec sons synthétiques. Aucune permission Discord requise.
            </BaseText>
            
            <div style={{ marginBottom: "16px" }}>
                <Button
                    onClick={openSimpleSoundboard}
                    color={Button.Colors.BRAND}
                    style={{ width: "100%" }}
                >
                    🎵 Ouvrir le Soundboard
                </Button>
            </div>
            
            <BaseText size="sm" style={{ color: "var(--text-muted)" }}>
                <strong>✨ Fonctionnalités :</strong><br/>
                • Sons synthétiques instantanés<br/>
                • Aucune permission Discord requise<br/>
                • Interface simple et rapide<br/>
                • Bouton accessible partout
            </BaseText>
        </div>
    );
}

// Bouton flottant pour l'interface
function SoundboardButton() {
    return (
        <Button
            onClick={openSimpleSoundboard}
            color={Button.Colors.BRAND}
            size={Button.Sizes.SMALL}
            style={{
                position: "fixed",
                bottom: "20px",
                right: "20px",
                zIndex: 9999,
                borderRadius: "50%",
                width: "60px",
                height: "60px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
            }}
        >
            🔊
        </Button>
    );
}

export default definePlugin({
    name: "SimpleSoundboard",
    description: "Soundboard ultra-simple avec sons synthétiques. Aucune permission Discord requise.",
    authors: [Devs.Bashcord],
    settings,
    settingsAboutComponent: SettingsComponent,
    
    start() {
        Logger.log("[SimpleSoundboard] Plugin démarré");
        
        // Ajouter le bouton flottant si activé
        if (settings.store.showButton) {
            // Ajouter le bouton dans l'interface
            const buttonElement = document.createElement('div');
            buttonElement.id = 'bashcord-soundboard-button';
            document.body.appendChild(buttonElement);
            
            // Rendre le composant React
            const { createRoot } = require('react-dom/client');
            const root = createRoot(buttonElement);
            root.render(React.createElement(SoundboardButton));
        }
        
        // Fonction de test accessible depuis la console
        (window as any).testSimpleSoundboard = () => {
            console.log("🔊 SimpleSoundboard: Test du plugin...");
            openSimpleSoundboard();
        };
        
        // Fonction pour jouer un son de test
        (window as any).playTestSound = () => {
            console.log("🔊 SimpleSoundboard: Lecture d'un son de test...");
            playSound(SOUNDS[0]); // Bruh
        };
        
        console.log("🔊 SimpleSoundboard: Fonctions de test disponibles:");
        console.log("  - testSimpleSoundboard() : Ouvre l'interface du soundboard");
        console.log("  - playTestSound() : Joue le son 'Bruh'");
    },
    
    stop() {
        Logger.log("[SimpleSoundboard] Plugin arrêté");
        
        // Supprimer le bouton flottant
        const buttonElement = document.getElementById('bashcord-soundboard-button');
        if (buttonElement) {
            buttonElement.remove();
        }
    }
});
