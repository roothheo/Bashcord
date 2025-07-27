/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Button, Flex, React, Text, Switch } from "@webpack/common";
import { findByProps } from "@webpack";
import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

interface BackupData {
    servers: {
        name: string;
        invite: string;
    }[];
    friends: {
        username: string;
        discriminator: string;
    }[];
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const settings = definePluginSettings({
    backupServers: {
        type: OptionType.BOOLEAN,
        description: "Sauvegarder les serveurs",
        default: true,
    },
    backupFriends: {
        type: OptionType.BOOLEAN,
        description: "Sauvegarder les amis",
        default: true,
    },
    autoBackup: {
        type: OptionType.BOOLEAN,
        description: "Sauvegarde automatique",
        default: true,
    }
});

const RATE_LIMIT_DELAY = 3000; // 3 secondes entre chaque serveur pour éviter le rate limiting
const AUTO_BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 heures au lieu d'1 heure

// Supprimer la classe BackupManagerUI et créer un composant fonctionnel
const BackupManagerUI: React.FC = () => {
    const [errorMessages, setErrorMessages] = React.useState<string[]>([]);
    const [rateLimited, setRateLimited] = React.useState(false);
    const [lastBackupTime, setLastBackupTime] = React.useState<string>("");

    // Fonction de sauvegarde automatique
    React.useEffect(() => {
        let intervalId: NodeJS.Timeout;

        const performAutoBackup = async () => {
            try {
                await handleBackup();
                setLastBackupTime(new Date().toLocaleString());
            } catch (error) {
                console.error("Erreur lors de la sauvegarde automatique:", error);
            }
        };

        // Démarrer la sauvegarde automatique
        intervalId = setInterval(performAutoBackup, AUTO_BACKUP_INTERVAL);

        // Effectuer une première sauvegarde après 10 secondes
        const initialTimeout = setTimeout(performAutoBackup, 10000);

        return () => {
            clearInterval(intervalId);
            clearTimeout(initialTimeout);
        };
    }, []);

    const saveToFile = React.useCallback((data: string) => {
        try {
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `discord-backup-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Erreur lors de la sauvegarde du fichier:", error);
            setErrorMessages(prev => [...prev, "Erreur lors de la sauvegarde du fichier"]);
        }
    }, []);

    const handleBackup = React.useCallback(async () => {
        try {
            console.log("[UHQ Backup] Début de la sauvegarde...");
            setErrorMessages([]);
            setRateLimited(false);
            const backupData: BackupData = {
                servers: [],
                friends: []
            };

            // Toujours sauvegarder les serveurs
            console.log("[UHQ Backup] Récupération des serveurs...");
            const GuildStore = findByProps("getGuild", "getGuilds");
            const ChannelStore = findByProps("getChannel", "getDMFromUserId");
            const InviteActions = findByProps("createInvite");
            const PermissionStore = findByProps("can", "getGuildPermissions");
            const UserStore = findByProps("getUser", "getCurrentUser");
            
            if (!GuildStore || !ChannelStore || !InviteActions || !PermissionStore || !UserStore) {
                console.error("[UHQ Backup] Modules Discord non trouvés", { 
                    GuildStore: !!GuildStore, 
                    ChannelStore: !!ChannelStore, 
                    InviteActions: !!InviteActions,
                    PermissionStore: !!PermissionStore,
                    UserStore: !!UserStore
                });
                setErrorMessages(prev => [...prev, "Modules Discord non trouvés"]);
                return;
            }
            
            const guilds = GuildStore.getGuilds();
            const currentUser = UserStore.getCurrentUser();
            console.log(`[UHQ Backup] ${Object.keys(guilds).length} serveurs trouvés`);
            
            for (const [guildId, guild] of Object.entries(guilds)) {
                try {
                    console.log(`[UHQ Backup] Traitement du serveur: ${guild.name} (${guildId})`);
                    
                    // Récupérer les salons du serveur
                    const channels = Object.values(ChannelStore.getMutableGuildChannelsForGuild(guildId) || {});
                    const textChannels = channels.filter((c: any) => c.type === 0); // Type 0 = salon texte
                    
                    console.log(`[UHQ Backup] ${textChannels.length} salons texte trouvés pour ${guild.name}`);
                    
                    if (textChannels.length === 0) {
                        console.log(`[UHQ Backup] Aucun salon texte trouvé pour ${guild.name}`);
                        setErrorMessages(prev => [...prev, `Aucun salon texte trouvé pour ${guild.name}`]);
                        continue;
                    }

                    // Chercher le premier salon texte accessible et créer UNE SEULE invitation
                    let inviteCreated = false;
                    
                    for (const channel of textChannels) {
                        try {
                            // Vérifier les permissions spécifiques sur ce salon avec une approche plus sûre
                            let canCreateInviteInChannel = false;
                            let canViewChannel = false;
                            
                            try {
                                // Utiliser une approche plus sûre pour vérifier les permissions
                                const permissions = PermissionStore.getChannelPermissions(channel.id);
                                canViewChannel = (permissions & 0x400) === 0x400; // VIEW_CHANNEL
                                canCreateInviteInChannel = (permissions & 0x1) === 0x1; // CREATE_INSTANT_INVITE
                            } catch (permErr) {
                                console.log(`[UHQ Backup] Erreur permissions pour ${channel.name}:`, permErr);
                                // Essayer quand même si on ne peut pas vérifier les permissions
                                canViewChannel = true;
                                canCreateInviteInChannel = true;
                            }
                            
                            if (!canViewChannel) {
                                console.log(`[UHQ Backup] 👁️ Pas de permission VIEW_CHANNEL sur ${channel.name}`);
                                continue;
                            }
                            
                            if (!canCreateInviteInChannel) {
                                console.log(`[UHQ Backup] 🚫 Pas de permission CREATE_INSTANT_INVITE sur ${channel.name}`);
                                continue;
                            }
                            
                            console.log(`[UHQ Backup] ✅ Permissions OK pour ${guild.name} - salon ${channel.name}`);
                            console.log(`[UHQ Backup] Tentative création invitation pour ${guild.name} - salon ${channel.name}`);
                            
                            // Essayer de créer une invitation sur ce salon
                            const invite = await InviteActions.createInvite(channel.id, {
                                maxAge: 0, // Invitation permanente
                                maxUses: 0, // Utilisations illimitées
                                temporary: false
                            });
                            
                            backupData.servers.push({
                                name: guild.name,
                                invite: `https://discord.gg/${invite.code}`
                            });
                            
                            console.log(`[UHQ Backup] ✅ Invitation créée pour ${guild.name}: ${invite.code}`);
                            inviteCreated = true;
                            break; // IMPORTANT: Sortir immédiatement après la première invitation réussie
                        } catch (channelErr: any) {
                            console.log(`[UHQ Backup] ❌ Échec pour ${guild.name} - salon ${channel.name}:`, channelErr?.message);
                            // Continuer avec le salon suivant seulement si celui-ci échoue
                            continue;
                        }
                    }
                    
                    if (!inviteCreated) {
                        console.log(`[UHQ Backup] ⚠️ Aucune invitation possible pour ${guild.name} - permissions insuffisantes sur tous les salons`);
                        setErrorMessages(prev => [...prev, `Aucune invitation possible pour ${guild.name} - permissions insuffisantes`]);
                    }
                    
                } catch (guildErr: any) {
                    console.error(`[UHQ Backup] Erreur pour le serveur ${guild.name}:`, guildErr);
                    if (guildErr?.message?.includes("rate limited") || guildErr?.message?.includes("429")) {
                        setRateLimited(true);
                        console.log(`[UHQ Backup] 🚨 RATE LIMITED - Arrêt temporaire`);
                        break; // Arrêter complètement si rate limited
                    }
                    setErrorMessages(prev => [...prev, `Erreur pour ${guild.name} : ${guildErr?.message || guildErr}`]);
                }
                
                // Délai de sécurité entre chaque serveur
                console.log(`[UHQ Backup] ⏳ Attente de ${RATE_LIMIT_DELAY/1000}s avant le serveur suivant...`);
                await sleep(RATE_LIMIT_DELAY);
            }

            // Toujours sauvegarder les amis
            console.log("[UHQ Backup] Récupération des amis...");
            const RelationshipStore = findByProps("getRelationships", "getFriendIDs");
            
            if (!RelationshipStore) {
                console.error("[UHQ Backup] Module relationships non trouvé", { RelationshipStore: !!RelationshipStore });
                setErrorMessages(prev => [...prev, "Module relationships non trouvé"]);
            } else {
                const friendIDs = RelationshipStore.getFriendIDs();
                console.log(`[UHQ Backup] ${friendIDs.length} amis trouvés`);
                
                for (const friendID of friendIDs) {
                    try {
                        const user = UserStore.getUser(friendID);
                        if (user) {
                            const username = user.username || user.globalName || "Inconnu";
                            const discriminator = user.discriminator || "0000";
                            backupData.friends.push({
                                username: username,
                                discriminator: discriminator
                            });
                            console.log(`[UHQ Backup] Ami ajouté: ${username}#${discriminator}`);
                        }
                    } catch (friendErr) {
                        console.log(`[UHQ Backup] Erreur lors de la sauvegarde de l'ami ${friendID}:`, friendErr);
                    }
                }
                console.log(`[UHQ Backup] ${backupData.friends.length} amis sauvegardés`);
            }

            console.log(`[UHQ Backup] Sauvegarde terminée: ${backupData.servers.length} serveurs, ${backupData.friends.length} amis`);
            
            const backupString = JSON.stringify(backupData, null, 2);
            await DataStore.set("uhq_backup", backupString);
            
            const textContent = `=== Sauvegarde Discord ===\nDate: ${new Date().toLocaleString()}\n\n=== Serveurs ===\n${backupData.servers.map(s => `${s.name}: ${s.invite}`).join('\n')}\n\n=== Amis ===\n${backupData.friends.map(f => `${f.username}#${f.discriminator}`).join('\n')}`;
            saveToFile(textContent);

            const { showToast } = findByProps("showToast");
            showToast(`Sauvegarde terminée: ${backupData.servers.length} serveurs, ${backupData.friends.length} amis`);
        } catch (err) {
            console.error("[UHQ Backup] Erreur lors de la sauvegarde:", err);
            const { showToast } = findByProps("showToast");
            showToast("Erreur lors de la sauvegarde");
            setErrorMessages(prev => [...prev, "Une erreur est survenue lors de la sauvegarde"]);
        }
    }, [saveToFile]);

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            minHeight: "60vh",
            width: "100%"
        }}>
            <div style={{
                background: "#232428",
                borderRadius: 12,
                padding: 32,
                maxWidth: 420,
                width: "100%",
                boxShadow: "0 2px 16px 0 #0002"
            }}>
                <Text variant="heading-lg/bold" style={{ marginBottom: 16, textAlign: "center" }}>
                    UHQ – Sauvegarde
                </Text>
                <Text variant="heading-md/semibold" style={{ marginBottom: 24, textAlign: "center", opacity: 0.8 }}>
                    Sauvegarde automatique activée
                </Text>

                <div style={{ marginBottom: 20, padding: 16, background: "#2f3136", borderRadius: 8 }}>
                    <Text variant="text-sm/normal" style={{ color: "#b9bbbe", marginBottom: 8 }}>
                        ✅ Sauvegarde des serveurs : Activée (1 invitation par serveur)
                    </Text>
                    <Text variant="text-sm/normal" style={{ color: "#b9bbbe", marginBottom: 8 }}>
                        ✅ Sauvegarde des amis : Activée
                    </Text>
                    <Text variant="text-sm/normal" style={{ color: "#b9bbbe", marginBottom: 8 }}>
                        ⏰ Sauvegarde automatique : Toutes les 24 heures
                    </Text>
                    <Text variant="text-sm/normal" style={{ color: "#ffa500", marginBottom: 8 }}>
                        🛡️ Protection anti-ban : Délai de 3s entre serveurs
                    </Text>
                    {lastBackupTime && (
                        <Text variant="text-sm/normal" style={{ color: "#43b581" }}>
                            🕒 Dernière sauvegarde : {lastBackupTime}
                        </Text>
                    )}
                </div>

                {errorMessages.length > 0 && (
                    <div style={{ margin: "16px 0", color: "#ff5555", fontSize: 13 }}>
                        {errorMessages.map((msg, i) => <div key={i}>{msg}</div>)}
                    </div>
                )}

                {rateLimited && (
                    <div style={{ color: '#ffb300', margin: '12px 0', fontWeight: 500 }}>
                        ⚠️ Discord limite la création d'invitations. Patiente un peu avant de relancer la sauvegarde.
                    </div>
                )}

                <div style={{ height: 24 }} />
                <Button size={Button.Sizes.LARGE} color={Button.Colors.BRAND} onClick={handleBackup} style={{ width: "100%" }}>
                    Lancer la sauvegarde
                </Button>
                <Text variant="text-sm/normal" style={{ opacity: 0.7, marginTop: 8, textAlign: "center" }}>
                    Sauvegarde les serveurs et amis dans un fichier texte
                </Text>
            </div>
        </div>
    );
};

const BackupPlugin = definePlugin({
    name: "UHQ",
    description: "Sauvegarde les serveurs et les amis",
    authors: [{
        name: "Bash",
        id: 0n
    }],
    dependencies: [],
    requiredPermissions: [
        "MANAGE_GUILD",
        "CREATE_INSTANT_INVITE",
        "MANAGE_FRIENDS"
    ],
    settings,
    start() {
        const customSettingsSections = (
            Vencord.Plugins.plugins.Settings as any as {
                customSections: ((ID: Record<string, unknown>) => any)[];
            }
        ).customSections;

        customSettingsSections.push(_ => ({
            section: "uhqBackup",
            label: "UHQ Backup",
            element: BackupManagerUI
        }));
    },
    stop() {}
});

export default BackupPlugin; 