/*
 * Bashcord, a Discord client mod
 * Copyright (c) 2025 Bashcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { addMessageDecoration, removeMessageDecoration } from "@api/MessageDecorations";
import { addNicknameIcon, removeNicknameIcon } from "@api/NicknameIcons";
import { definePluginSettings, Settings } from "@api/Settings";
import { isEquicord } from "@api/index";
import { Devs } from "@utils/constants";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { User } from "@vencord/discord-types";
import { filters, findStoreLazy, mapMangledModuleLazy } from "@webpack";
import { AuthenticationStore, FluxDispatcher, GuildMemberStore, PresenceStore, Tooltip, UserStore, useStateFromStores } from "@webpack/common";
import { gitRemote } from "@shared/vencordUserAgent";

// Cache system for mod types
const CACHE_KEY = "BashcordModTypes";
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

// Server ID to scan for members
const TARGET_GUILD_ID = "1425622541703057463";

interface ModTypeCache {
    [userId: string]: {
        modType: ModType;
        timestamp: number;
    };
}

function getCachedModType(userId: string): ModType | null {
    try {
        if (typeof localStorage === "undefined") return null;
        const cacheStr = localStorage.getItem(CACHE_KEY);
        if (!cacheStr) return null;

        const cache: ModTypeCache = JSON.parse(cacheStr);
        const cached = cache[userId];
        if (!cached) return null;

        // Check if cache is expired
        if (Date.now() - cached.timestamp > CACHE_EXPIRY) {
            delete cache[userId];
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            return null;
        }

        return cached.modType;
    } catch (e) {
        return null;
    }
}

function setCachedModType(userId: string, modType: ModType): void {
    try {
        if (typeof localStorage === "undefined") return;
        const cacheStr = localStorage.getItem(CACHE_KEY);
        const cache: ModTypeCache = cacheStr ? JSON.parse(cacheStr) : {};

        cache[userId] = {
            modType,
            timestamp: Date.now()
        };

        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        // Ignore errors
    }
}

export interface Session {
    sessionId: string;
    status: string;
    active: boolean;
    clientInfo: {
        version: number;
        os: string;
        client: string;
    };
}

const SessionsStore = findStoreLazy("SessionsStore") as {
    getSessions(): Record<string, Session>;
};

const { useStatusFillColor } = mapMangledModuleLazy(".concat(.5625*", {
    useStatusFillColor: filters.byCode(".hex")
});

type ModType = "vencord" | "equicord" | "bashcord";

interface IconFactoryOpts {
    viewBox?: string;
    width?: number;
    height?: number;
}

interface IconProps {
    color: string;
    tooltip: string;
    small?: boolean;
}

function Icon(path: string, opts?: IconFactoryOpts) {
    return ({ color, tooltip, small }: IconProps) => (
        <Tooltip text={tooltip}>
            {tooltipProps => (
                <svg
                    {...tooltipProps}
                    height={(opts?.height ?? 20) - (small ? 3 : 0)}
                    width={(opts?.width ?? 20) - (small ? 3 : 0)}
                    viewBox={opts?.viewBox ?? "0 0 24 24"}
                    fill={color}
                >
                    <path d={path} />
                </svg>
            )}
        </Tooltip>
    );
}

const Icons: Record<ModType, ReturnType<typeof Icon>> = {
    vencord: Icon("M14.8 2.7 9 3.1V47h3.3c1.7 0 6.2.3 10 .7l6.7.6V2l-4.2.2c-2.4.1-6.9.3-10 .5zm1.8 6.4c1 1.7-1.3 3.6-2.7 2.2C12.7 10.1 13.5 8 15 8c.5 0 1.2.5 1.6 1.1zM16 33c0 6-.4 10-1 10s-1-4-1-10 .4-10 1-10 1 4 1 10zm15-8v23.3l3.8-.7c2-.3 4.7-.6 6-.6H43V3h-2.2c-1.3 0-4-.3-6-.6L31 1.7V25z", { viewBox: "0 0 50 50" }),
    equicord: Icon("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8 17 8.67 17 9.5 16.33 11 15.5 11zm-7 0c-.83 0-1.5-.67-1.5-1.5S7.67 8 8.5 8 10 8.67 10 9.5 9.33 11 8.5 11zm3.5 6.5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5z", { viewBox: "0 0 24 24" }),
    bashcord: Icon("M3 3h18c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm0 2v14h18V5H3zm2 2h14v2H5V7zm0 4h10v2H5v-2zm0 4h8v2H5v-2zm12 0h2v2h-2v-2z", { viewBox: "0 0 24 24" }),
};

interface ModIconProps {
    mod: ModType;
    status: string;
    small?: boolean;
}

const ModIcon = ({ mod, status, small }: ModIconProps) => {
    try {
        const tooltip = mod[0].toUpperCase() + mod.slice(1);
        const Icon = Icons[mod] ?? Icons.vencord;
        
        let color: string;
        try {
            color = useStatusFillColor?.(status) ?? "#80848e";
        } catch (e) {
            color = "#80848e"; // Default Discord gray
        }

        return <Icon color={color} tooltip={tooltip} small={small} />;
    } catch (e) {
        // Return a fallback icon on error
        return null;
    }
};

function getCurrentModType(): ModType {
    // Check if Bashcord (check gitRemote)
    if (gitRemote && gitRemote.includes("roothheo/Bashcord")) {
        return "bashcord";
    }
    // Check if Equicord
    if (isEquicord) {
        return "equicord";
    }
    // Default to Vencord
    return "vencord";
}

// Check if user is member of target guild
function isMemberOfTargetGuild(userId: string): boolean {
    try {
        if (!GuildMemberStore || !userId) return false;
        const member = GuildMemberStore.getMember(TARGET_GUILD_ID, userId);
        return member != null;
    } catch (e) {
        return false;
    }
}

function detectModType(userId?: string, forceGuildCheck: boolean = false): ModType | null {
    try {
        // For current user, use direct detection
        if (!userId || userId === AuthenticationStore.getId()) {
            return getCurrentModType();
        }

        // First, check cache
        const cached = getCachedModType(userId);
        if (cached) {
            return cached;
        }

        // Check if user is member of target guild - if so, try to detect or assign default
        if (forceGuildCheck || isMemberOfTargetGuild(userId)) {
            // Try to detect from presence/clientStatuses first
            try {
                const presence = PresenceStore?.getState?.();
                const userStatus = presence?.clientStatuses?.[userId];
                if (userStatus && typeof userStatus === "object") {
                    const modTypes: ModType[] = ["bashcord", "equicord", "vencord"];
                    for (const modType of modTypes) {
                        if (modType in userStatus) {
                            setCachedModType(userId, modType);
                            return modType;
                        }
                    }
                }
            } catch (e) {
                // Ignore errors
            }

            // If we can't detect, check if user has any presence data
            // If they're in the target guild, we can assume they might be using a mod
            // For now, we'll try to detect from other sources or return null
            // But we'll scan the guild members in start() to populate cache
        }

        // Then, check clientStatuses which Discord syncs automatically
        // The mod type is injected via modified sessions -> clientStatuses
        try {
            const presence = PresenceStore?.getState?.();
            const userStatus = presence?.clientStatuses?.[userId];
            if (userStatus && typeof userStatus === "object") {
                // Check if user has mod type in their clientStatuses
                // This will be populated by Discord's sync from modified sessions
                const modTypes: ModType[] = ["bashcord", "equicord", "vencord"];
                for (const modType of modTypes) {
                    if (modType in userStatus) {
                        // Cache the detected mod type
                        setCachedModType(userId, modType);
                        return modType;
                    }
                }
            }
        } catch (e) {
            // Ignore errors
        }

        return null;
    } catch (e) {
        // Return null on any error
        return null;
    }
}

// Non-hook version for use in intervals and callbacks
function ensureOwnModStatus(user: User) {
    try {
        if (!user || user.id !== AuthenticationStore.getId()) {
            return;
        }

        const modType = getCurrentModType();
        const sessions = SessionsStore?.getSessions?.();
        if (!sessions || typeof sessions !== "object") return;
        
        const sortedSessions = Object.values(sessions).sort(({ status: a }, { status: b }) => {
            if (a === b) return 0;
            if (a === "online") return 1;
            if (b === "online") return -1;
            if (a === "idle") return 1;
            if (b === "idle") return -1;
            return 0;
        });

        // Build clientStatuses from sessions, same as platformIndicators
        // Add mod type alongside existing client types
        const ownStatus = Object.values(sortedSessions).reduce((acc, curr) => {
            if (curr?.clientInfo?.client && curr.clientInfo.client !== "unknown") {
                acc[curr.clientInfo.client] = curr.status;
            }
            return acc;
        }, {} as Record<string, string>);

        // Add mod type with the most active status
        if (sortedSessions.length > 0) {
            const activeStatus = sortedSessions[0]?.status || "offline";
            ownStatus[modType] = activeStatus;
        }

        const presenceState = PresenceStore?.getState?.();
        const currentUser = UserStore?.getCurrentUser?.();
        if (presenceState?.clientStatuses && currentUser?.id) {
            presenceState.clientStatuses[currentUser.id] = ownStatus;
        }
        
        // Cache our own mod type
        setCachedModType(user.id, modType);
    } catch (e) {
        // Ignore errors to prevent console spam
    }
}

// Hook version for use in React components
function useEnsureOwnModStatus(user: User) {
    if (!user || user.id !== AuthenticationStore.getId()) {
        return;
    }

    const modType = getCurrentModType();
    const sessions = useStateFromStores([SessionsStore], () => SessionsStore?.getSessions?.());
    if (!sessions || typeof sessions !== "object") return null;
    
    const sortedSessions = Object.values(sessions).sort(({ status: a }, { status: b }) => {
        if (a === b) return 0;
        if (a === "online") return 1;
        if (b === "online") return -1;
        if (a === "idle") return 1;
        if (b === "idle") return -1;
        return 0;
    });

    // Build clientStatuses from sessions, same as platformIndicators
    // Add mod type alongside existing client types
    const ownStatus = Object.values(sortedSessions).reduce((acc, curr) => {
        if (curr?.clientInfo?.client && curr.clientInfo.client !== "unknown") {
            acc[curr.clientInfo.client] = curr.status;
        }
        return acc;
    }, {} as Record<string, string>);

    // Add mod type with the most active status
    if (sortedSessions.length > 0) {
        const activeStatus = sortedSessions[0]?.status || "offline";
        ownStatus[modType] = activeStatus;
    }

    try {
        const presenceState = PresenceStore?.getState?.();
        const currentUser = UserStore?.getCurrentUser?.();
        if (presenceState?.clientStatuses && currentUser?.id) {
            presenceState.clientStatuses[currentUser.id] = ownStatus;
        }
    } catch (e) {
        // Ignore errors
    }
    
    // Cache our own mod type
    setCachedModType(user.id, modType);
}

interface ModIndicatorProps {
    user: User;
    isProfile?: boolean;
    isMessage?: boolean;
    isMemberList?: boolean;
}

const ModIndicator = ({ user, isProfile, isMessage, isMemberList }: ModIndicatorProps) => {
    try {
        if (user == null || (user.bot && !Settings.plugins.ModIdentifier.showBots)) return null;
        
        // Ensure own mod status is injected (same as platformIndicators)
        useEnsureOwnModStatus(user);

        let modType: ModType | null = null;
        let statusToUse: string = "online";

        // First, check if user is member of target Bashcord guild
        // If yes, they automatically get the Bashcord badge
        if (isMemberOfTargetGuild(user.id)) {
            modType = "bashcord";
            // Try to get their actual status from presence
            const status: Record<string, string> | undefined = useStateFromStores([PresenceStore], () => {
                try {
                    return PresenceStore?.getState?.()?.clientStatuses?.[user.id];
                } catch (e) {
                    return undefined;
                }
            });
            if (status && typeof status === "object") {
                // Get the first available status, or use online as default
                const statuses = Object.values(status);
                if (statuses.length > 0) {
                    statusToUse = statuses[0] || "online";
                }
            }
        } else {
            // For users not in target guild, use normal detection
            modType = detectModType(user.id);
            if (!modType) return null;

            // Get user status from clientStatuses
            const status: Record<string, string> | undefined = useStateFromStores([PresenceStore], () => {
                try {
                    return PresenceStore?.getState?.()?.clientStatuses?.[user.id];
                } catch (e) {
                    return undefined;
                }
            });

            // If we have a mod type but no status in clientStatuses, use default status
            if (status && typeof status === "object" && modType in status && status[modType]) {
                statusToUse = status[modType];
            } else {
                // Fallback to online status if we can't get it from presence
                statusToUse = "online";
            }
        }

        if (!modType) return null;

        return (
            <div
                className={classes("vc-mod-indicator", isProfile && "vc-mod-indicator-profile", isMessage && "vc-mod-indicator-message")}
                style={{ marginLeft: isMemberList ? "4px" : undefined }}
            >
                <ModIcon mod={modType} status={statusToUse} small={isProfile || isMemberList} />
            </div>
        );
    } catch (e) {
        // Return null on error to prevent breaking the UI
        return null;
    }
};

function toggleMemberListDecorators(enabled: boolean) {
    if (enabled) {
        addMemberListDecorator("ModIdentifier", props => <ModIndicator user={props.user} isMemberList />);
    } else {
        removeMemberListDecorator("ModIdentifier");
    }
}

function toggleNicknameIcons(enabled: boolean) {
    if (enabled) {
        addNicknameIcon("ModIdentifier", props => <ModIndicator user={UserStore.getUser(props.userId)} isProfile />, 1);
    } else {
        removeNicknameIcon("ModIdentifier");
    }
}

function toggleMessageDecorators(enabled: boolean) {
    if (enabled) {
        addMessageDecoration("ModIdentifier", props => <ModIndicator user={props.message?.author} isMessage />);
    } else {
        removeMessageDecoration("ModIdentifier");
    }
}

const settings = definePluginSettings({
    list: {
        type: OptionType.BOOLEAN,
        description: "Show mod indicators in the member list",
        default: true,
        onChange: toggleMemberListDecorators
    },
    profiles: {
        type: OptionType.BOOLEAN,
        description: "Show mod indicators in user profiles",
        default: true,
        onChange: toggleNicknameIcons
    },
    messages: {
        type: OptionType.BOOLEAN,
        description: "Show mod indicators inside messages",
        default: true,
        onChange: toggleMessageDecorators
    },
    showBots: {
        type: OptionType.BOOLEAN,
        description: "Whether to show mod indicators on bots",
        default: false,
        restartNeeded: false
    }
});

export default definePlugin({
    name: "ModIdentifier",
    description: "Shows which Discord mod (Vencord/Equicord/Bashcord) users are using",
    authors: [Devs.BigDuck],
    dependencies: ["MemberListDecoratorsAPI", "NicknameIconsAPI", "MessageDecorationsAPI"],
    required: true,
    settings,

    patches: [
        {
            find: "_doIdentify(){",
            replacement: {
                match: /(\[IDENTIFY\].*let.{0,5}=\{.*properties:)(.*),presence/,
                replace: "$1{...$2,...$self.getModInfo()},presence"
            }
        }
    ],

    getModInfo() {
        const modType = getCurrentModType();
        // Inject mod type into properties so it's sent to Discord
        // This allows other users with the plugin to detect it
        return {
            $mod: modType // Custom property that won't break Discord
        };
    },


    start() {
        if (settings.store.list) toggleMemberListDecorators(true);
        if (settings.store.profiles) toggleNicknameIcons(true);
        if (settings.store.messages) toggleMessageDecorators(true);

        // No need to scan guild members anymore - we check membership directly in ModIndicator

        // Listen for presence updates to detect mod types from other users (for non-guild members)
        const presenceListener = (event: any) => {
            try {
                if (event?.user?.id && event?.user?.id !== AuthenticationStore.getId()) {
                    // Only cache if user is NOT in target guild (guild members get bashcord badge automatically)
                    if (!isMemberOfTargetGuild(event.user.id)) {
                        const modType = detectModType(event.user.id);
                        if (modType) {
                            setCachedModType(event.user.id, modType);
                        }
                    }
                }
            } catch (e) {
                // Ignore errors in presence listener
            }
        };

        FluxDispatcher.subscribe("PRESENCE_UPDATE", presenceListener);
        FluxDispatcher.subscribe("CONNECTION_OPEN", presenceListener);

        // Store listener for cleanup
        (this as any)._presenceListener = presenceListener;

        // Maintain mod type in clientStatuses periodically
        // Discord may overwrite it, so we need to re-inject it
        const maintainInterval = setInterval(() => {
            try {
                const currentUser = UserStore?.getCurrentUser?.();
                if (currentUser) {
                    ensureOwnModStatus(currentUser);
                }
            } catch (e) {
                // Ignore errors in interval
            }
        }, 5000); // Every 5 seconds

        (this as any)._maintainInterval = maintainInterval;
    },

    stop() {
        if (settings.store.list) toggleMemberListDecorators(false);
        if (settings.store.profiles) toggleNicknameIcons(false);
        if (settings.store.messages) toggleMessageDecorators(false);

        // Remove presence listener
        const listener = (this as any)._presenceListener;
        if (listener) {
            FluxDispatcher.unsubscribe("PRESENCE_UPDATE", listener);
            FluxDispatcher.unsubscribe("CONNECTION_OPEN", listener);
        }

        // Clear maintain interval
        const interval = (this as any)._maintainInterval;
        if (interval) {
            clearInterval(interval);
        }
    }
});

