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
import { AuthenticationStore, PresenceStore, Tooltip, UserStore, useStateFromStores } from "@webpack/common";
import { gitRemote } from "@shared/vencordUserAgent";

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
    bashcord: Icon("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z", { viewBox: "0 0 24 24" }),
};

interface ModIconProps {
    mod: ModType;
    status: string;
    small?: boolean;
}

const ModIcon = ({ mod, status, small }: ModIconProps) => {
    const tooltip = mod[0].toUpperCase() + mod.slice(1);
    const Icon = Icons[mod] ?? Icons.vencord;

    return <Icon color={useStatusFillColor(status)} tooltip={tooltip} small={small} />;
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

function detectModType(userId?: string): ModType | null {
    // For current user, use direct detection
    if (!userId || userId === AuthenticationStore.getId()) {
        return getCurrentModType();
    }

    // For other users, try multiple detection methods
    try {
        // Method 1: Check clientStatuses (if they have the plugin and injected their mod)
        const presence = PresenceStore.getState();
        const userStatus = presence?.clientStatuses?.[userId];
        if (userStatus) {
            // Check if user has mod type in their clientStatuses
            const modTypes: ModType[] = ["bashcord", "equicord", "vencord"];
            for (const modType of modTypes) {
                if (modType in userStatus) {
                    return modType;
                }
            }
        }

        // Method 2: Check all sessions for mod identifiers
        // Note: SessionsStore contains current user's sessions, but we can check
        // if any session has mod info that might have been broadcast
        const sessions = SessionsStore.getSessions();
        if (typeof sessions === "object") {
            const allSessions = Object.values(sessions);
            for (const session of allSessions) {
                const client = session.clientInfo?.client?.toLowerCase() || "";
                if (client === "bashcord" || client.includes("bashcord")) return "bashcord";
                if (client === "equicord" || client.includes("equicord")) return "equicord";
                if (client === "vencord" || client.includes("vencord")) return "vencord";
            }
        }

        // Method 3: Try to detect from user's presence data
        // Some mods might leave traces in presence information
        const user = UserStore.getUser(userId);
        if (user) {
            // Check if there are any hints in the user object
            // This is a fallback method
        }
    } catch (e) {
        // Ignore errors
    }

    return null;
}

function useEnsureOwnModStatus(user: User) {
    if (user.id !== AuthenticationStore.getId()) {
        return;
    }

    const modType = getCurrentModType();
    if (!modType) return;

    const sessions = useStateFromStores([SessionsStore], () => SessionsStore.getSessions());
    if (typeof sessions !== "object") return null;

    const sortedSessions = Object.values(sessions).sort(({ status: a }, { status: b }) => {
        if (a === b) return 0;
        if (a === "online") return 1;
        if (b === "online") return -1;
        if (a === "idle") return 1;
        if (b === "idle") return -1;
        return 0;
    });

    // Get the most active status
    const activeStatus = sortedSessions[0]?.status || "offline";

    // Inject mod type into clientStatuses so other users can see it
    const { clientStatuses } = PresenceStore.getState();
    if (!clientStatuses[user.id]) {
        clientStatuses[user.id] = {};
    }
    clientStatuses[user.id][modType] = activeStatus;
}

interface ModIndicatorProps {
    user: User;
    isProfile?: boolean;
    isMessage?: boolean;
    isMemberList?: boolean;
}

const ModIndicator = ({ user, isProfile, isMessage, isMemberList }: ModIndicatorProps) => {
    if (user == null || (user.bot && !Settings.plugins.ModIdentifier.showBots)) return null;

    // Ensure own mod status is injected
    useEnsureOwnModStatus(user);

    // Detect mod type for this user
    const modType = detectModType(user.id);
    if (!modType) return null;

    // Get user status for the mod type
    const status = useStateFromStores([PresenceStore], () => {
        const presence = PresenceStore.getState();
        const userStatus = presence?.clientStatuses?.[user.id];
        if (userStatus && modType in userStatus) {
            return userStatus[modType] as string;
        }
        // Fallback to first available status
        if (userStatus) {
            const statuses = Object.values(userStatus);
            return statuses[0] || "offline";
        }
        return "offline";
    });

    return (
        <div
            className={classes("vc-mod-indicator", isProfile && "vc-mod-indicator-profile", isMessage && "vc-mod-indicator-message")}
            style={{ marginLeft: isMemberList ? "4px" : undefined }}
        >
            <ModIcon mod={modType} status={status} small={isProfile || isMemberList} />
        </div>
    );
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
        },
        {
            find: ".Masks.STATUS_ONLINE",
            replacement: {
                match: /(clientStatuses\[(\i)\.id\]\s*=\s*\{)/,
                replace: "$1...$self.injectModStatus($2),"
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

    injectModStatus(user: User) {
        if (!user || user.id !== AuthenticationStore.getId()) {
            return {};
        }
        const modType = getCurrentModType();
        return {
            [modType]: "online" // Inject mod type as a client status
        };
    },

    start() {
        if (settings.store.list) toggleMemberListDecorators(true);
        if (settings.store.profiles) toggleNicknameIcons(true);
        if (settings.store.messages) toggleMessageDecorators(true);
    },

    stop() {
        if (settings.store.list) toggleMemberListDecorators(false);
        if (settings.store.profiles) toggleNicknameIcons(false);
        if (settings.store.messages) toggleMessageDecorators(false);
    }
});

