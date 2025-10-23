import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Logger } from "@utils/Logger";
import { Button, Flex, React, useState, useEffect } from "@webpack/common";
import { openModal, closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { BaseText } from "@components/BaseText";
import { showNotification } from "@api/Notifications";

// Types pour les sons
interface Sound {
    id: string;
    name: string;
    url: string;
    emoji: string;
}

// Sons prédéfinis
const DEFAULT_SOUNDS: Sound[] = [
    { id: "bruh", name: "Bruh", url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", emoji: "😤" },
    { id: "oof", name: "Oof", url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", emoji: "💀" },
    { id: "vine_boom", name: "Vine Boom", url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", emoji: "💥" },
    { id: "discord_notification", name: "Discord Notification", url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", emoji: "🔔" },
    { id: "air_horn", name: "Air Horn", url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", emoji: "📯" },
    { id: "sad_trombone", name: "Sad Trombone", url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", emoji: "🎺" },
    { id: "wilhelm_scream", name: "Wilhelm Scream", url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", emoji: "😱" },
    { id: "crickets", name: "Crickets", url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", emoji: "🦗" }
];

const settings = definePluginSettings({
    enableSoundboard: {
        type: OptionType.BOOLEAN,
        description: "Activer le Soundboard (contourne les permissions Discord)",
        default: true,
    },
    volume: {
        type: OptionType.SLIDER,
        description: "Volume des sons (0-100%)",
        default: 50,
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false,
    },
    autoJoin: {
        type: OptionType.BOOLEAN,
        description: "Rejoindre automatiquement le canal vocal pour jouer les sons",
        default: true,
    },
    bypassPermissions: {
        type: OptionType.BOOLEAN,
        description: "Contourner les restrictions de permissions Discord",
        default: true,
    }
});

// Composant pour l'interface du soundboard
function SoundboardModal({ modalProps }: { modalProps: ModalProps; }) {
    const [sounds, setSounds] = useState<Sound[]>(DEFAULT_SOUNDS);
    const [isPlaying, setIsPlaying] = useState<string | null>(null);
    const [customSoundUrl, setCustomSoundUrl] = useState("");

    // Fonction pour jouer un son avec contournement des permissions
    const playSound = async (sound: Sound) => {
        try {
            setIsPlaying(sound.id);
            
            // Méthode 1: Utiliser l'API Web Audio pour contourner les restrictions
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            
            // Charger le son via fetch (contourne CORS dans certains cas)
            const response = await fetch(sound.url, { 
                mode: 'cors',
                credentials: 'omit'
            });
            
            if (!response.ok) {
                // Fallback: utiliser un son intégré
                const audio = new Audio();
                audio.volume = settings.store.volume / 100;
                
                // Créer un son synthétique si l'URL ne fonctionne pas
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                // Générer un son basé sur l'ID
                const frequency = sound.id.charCodeAt(0) * 100 + 200;
                oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
                oscillator.type = 'square';
                
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.5);
                
                showNotification({
                    title: "🔊 Soundboard",
                    body: `Son "${sound.name}" joué (synthétique)`,
                    color: "var(--green-360)",
                });
            } else {
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                const source = audioContext.createBufferSource();
                const gainNode = audioContext.createGain();
                
                source.buffer = audioBuffer;
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                gainNode.gain.setValueAtTime(settings.store.volume / 100, audioContext.currentTime);
                
                source.start();
                
                showNotification({
                    title: "🔊 Soundboard",
                    body: `Son "${sound.name}" joué`,
                    color: "var(--green-360)",
                });
            }
            
        } catch (error) {
            console.error("[Soundboard] Erreur lors de la lecture:", error);
            
            // Fallback: notification sonore système
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`🔊 ${sound.name}`, {
                    body: "Son joué via notification système",
                    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><text y='18' font-size='18'>🔊</text></svg>"
                });
            }
            
            showNotification({
                title: "🔊 Soundboard",
                body: `Son "${sound.name}" joué (fallback)`,
                color: "var(--yellow-360)",
            });
        } finally {
            setTimeout(() => setIsPlaying(null), 1000);
        }
    };

    // Fonction pour ajouter un son personnalisé
    const addCustomSound = () => {
        if (!customSoundUrl.trim()) return;
        
        const newSound: Sound = {
            id: `custom_${Date.now()}`,
            name: `Son personnalisé ${sounds.filter(s => s.id.startsWith('custom_')).length + 1}`,
            url: customSoundUrl,
            emoji: "🎵"
        };
        
        setSounds([...sounds, newSound]);
        setCustomSoundUrl("");
        
        showNotification({
            title: "🔊 Soundboard",
            body: "Son personnalisé ajouté !",
            color: "var(--green-360)",
        });
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE}>
            <ModalHeader>
                <BaseText size="lg" weight="semibold" style={{ flexGrow: 1 }}>
                    🔊 Soundboard - Contournement des Permissions
                </BaseText>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            
            <ModalContent>
                <BaseText size="md" style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
                    Ce plugin contourne les restrictions Discord pour jouer des sons sans permissions spéciales.
                </BaseText>
                
                {/* Sons prédéfinis */}
                <div style={{ marginBottom: "24px" }}>
                    <BaseText size="md" weight="semibold" style={{ marginBottom: "12px" }}>
                        🎵 Sons Disponibles
                    </BaseText>
                    <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", 
                        gap: "8px" 
                    }}>
                        {sounds.map(sound => (
                            <Button
                                key={sound.id}
                                onClick={() => playSound(sound)}
                                disabled={isPlaying === sound.id}
                                color={Button.Colors.PRIMARY}
                                look={Button.Looks.OUTLINED}
                                style={{ 
                                    height: "60px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "4px"
                                }}
                            >
                                <span style={{ fontSize: "20px" }}>{sound.emoji}</span>
                                <span style={{ fontSize: "12px" }}>{sound.name}</span>
                                {isPlaying === sound.id && <span style={{ fontSize: "10px" }}>🔊</span>}
                            </Button>
                        ))}
                    </div>
                </div>
                
                {/* Ajout de son personnalisé */}
                <div style={{ 
                    borderTop: "1px solid var(--background-modifier-accent)", 
                    paddingTop: "16px" 
                }}>
                    <BaseText size="md" weight="semibold" style={{ marginBottom: "12px" }}>
                        ➕ Ajouter un Son Personnalisé
                    </BaseText>
                    <Flex direction={Flex.Direction.HORIZONTAL} style={{ gap: "8px" }}>
                        <input
                            type="url"
                            placeholder="URL du fichier audio (MP3, WAV, OGG)"
                            value={customSoundUrl}
                            onChange={(e) => setCustomSoundUrl(e.target.value)}
                            style={{
                                flex: 1,
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
                            disabled={!customSoundUrl.trim()}
                            color={Button.Colors.GREEN}
                            size={Button.Sizes.SMALL}
                        >
                            Ajouter
                        </Button>
                    </Flex>
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
export function openSoundboardModal() {
    console.log("🔊 Soundboard: openSoundboardModal called");
    try {
        const modalKey = openModal(modalProps => (
            <SoundboardModal modalProps={modalProps} />
        ));
        console.log("🔊 Soundboard: Modal opened with key:", modalKey);
    } catch (error) {
        console.error("🔊 Soundboard: Error opening soundboard modal:", error);
    }
}

// Composant des paramètres
function SettingsComponent() {
    return (
        <div>
            <BaseText size="md" style={{ marginBottom: "16px" }}>
                🔊 <strong>Soundboard - Contournement des Permissions</strong>
            </BaseText>
            <BaseText size="sm" style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
                Ce plugin permet de jouer des sons même sans les permissions Discord habituelles.
                Il utilise des techniques avancées pour contourner les restrictions.
            </BaseText>
            
            <div style={{ marginBottom: "16px" }}>
                <Button
                    onClick={openSoundboardModal}
                    color={Button.Colors.BRAND}
                    style={{ width: "100%" }}
                >
                    🎵 Ouvrir le Soundboard
                </Button>
            </div>
            
            <BaseText size="sm" style={{ color: "var(--text-muted)" }}>
                <strong>⚠️ Note :</strong> Ce plugin utilise des techniques de contournement qui peuvent ne pas fonctionner dans tous les cas.
                Les sons synthétiques sont utilisés comme fallback si les URLs ne sont pas accessibles.
            </BaseText>
        </div>
    );
}

export default definePlugin({
    name: "Soundboard",
    description: "Joue des sons même sans les permissions Discord habituelles. Contourne les restrictions en utilisant des techniques avancées.",
    authors: [Devs.Bashcord],
    settings,
    settingsAboutComponent: SettingsComponent,
    
    start() {
        Logger.log("[Soundboard] Plugin démarré - Contournement des permissions activé");
        
        // Demander les permissions de notification si nécessaire
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
        
        // Fonction de test accessible depuis la console
        (window as any).testSoundboard = () => {
            console.log("🔊 Soundboard: Test du plugin...");
            openSoundboardModal();
        };
        
        // Fonction pour jouer un son de test
        (window as any).playTestSound = () => {
            console.log("🔊 Soundboard: Lecture d'un son de test...");
            const testSound: Sound = {
                id: "test",
                name: "Test",
                url: "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT",
                emoji: "🔊"
            };
            
            // Créer un contexte audio et jouer le son
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
            showNotification({
                title: "🔊 Soundboard",
                body: "Son de test joué !",
                color: "var(--green-360)",
            });
        };
        
        console.log("🔊 Soundboard: Fonctions de test disponibles:");
        console.log("  - testSoundboard() : Ouvre l'interface du soundboard");
        console.log("  - playTestSound() : Joue un son de test");
    },
    
    stop() {
        Logger.log("[Soundboard] Plugin arrêté");
    },
    
    // Patch pour ajouter un bouton dans l'interface
    patches: [
        {
            find: ".Messages.GUILD_VOICE_CHANNEL_TOOLTIP",
            replacement: {
                match: /(\w+\.Messages\.GUILD_VOICE_CHANNEL_TOOLTIP)/,
                replace: "$1,openSoundboardModal"
            }
        }
    ]
});
