/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findComponentByCodeLazy, findStoreLazy } from "@webpack";
import { Avatar, Flex, React, RelationshipStore, Tooltip, TypingStore, UserStore, useStateFromStores } from "@webpack/common";

const ThreeDots = findComponentByCodeLazy(".dots,", "dotRadius:");

const PrivateChannelSortStore = findStoreLazy("PrivateChannelSortStore") as { getPrivateChannelIds: () => string[]; };

const settings = definePluginSettings({
    showTooltip: {
        type: OptionType.BOOLEAN,
        description: "Afficher un tooltip au survol avec les personnes qui écrivent",
        default: true
    },
    tooltipDisplayMode: {
        type: OptionType.SELECT,
        description: "Mode d'affichage du tooltip",
        options: [
            { label: "Avatars uniquement", value: "avatars", default: false },
            { label: "Pseudos uniquement", value: "usernames", default: false },
            { label: "Avatars et pseudos", value: "both", default: true }
        ]
    }
});

// Fonction pour obtenir les utilisateurs qui tapent dans les DMs
function getTypingUsers(): Array<{ user: ReturnType<typeof UserStore.getUser>; channelId: string; }> {
    const typingUsers: Array<{ user: ReturnType<typeof UserStore.getUser>; channelId: string; }> = [];
    const currentUserId = UserStore.getCurrentUser()?.id;

    if (!currentUserId) return typingUsers;

    const privateChannelIds = PrivateChannelSortStore.getPrivateChannelIds();

    for (const channelId of privateChannelIds) {
        const channelTypingUsers = TypingStore.getTypingUsers(channelId);
        const userIds = Object.keys(channelTypingUsers).filter(id => id !== currentUserId);

        for (const userId of userIds) {
            const user = UserStore.getUser(userId);
            if (user && !RelationshipStore.isBlocked(userId) && !RelationshipStore.isIgnored(userId)) {
                typingUsers.push({ user, channelId });
            }
        }
    }

    return typingUsers;
}

// Composant pour afficher le tooltip
function TypingTooltip({ children }: { children: React.ReactNode; }) {
    const typingUsers = useStateFromStores([TypingStore], getTypingUsers);
    const displayMode = settings.store.tooltipDisplayMode;
    const showTooltip = settings.store.showTooltip;

    if (!showTooltip || typingUsers.length === 0) {
        return <>{children}</>;
    }

    const tooltipContent = (
        <Flex style={{ flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
            {typingUsers.map(({ user, channelId }) => {
                const username = RelationshipStore.getNickname(user.id) || (user as any).globalName || user.username;
                const avatarUrl = user.getAvatarURL(undefined, 128);

                return (
                    <Flex key={`${user.id}-${channelId}`} style={{ alignItems: "center", gap: "6px" }}>
                        {(displayMode === "avatars" || displayMode === "both") && (
                            <Avatar
                                size="SIZE_16"
                                src={avatarUrl}
                            />
                        )}
                        {(displayMode === "usernames" || displayMode === "both") && (
                            <span>{username}</span>
                        )}
                    </Flex>
                );
            })}
        </Flex>
    );

    return (
        <Tooltip text={tooltipContent}>
            {({ onMouseEnter, onMouseLeave }) => (
                <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
                    {children}
                </div>
            )}
        </Tooltip>
    );
}

export default definePlugin({
    name: "HomeTyping",
    description: "Changes the home button to a typing indicator if someone in your dms is typing",
    authors: [Devs.Samwich],
    settings,
    TypingIcon() {
        return (
            <TypingTooltip>
                <ThreeDots dotRadius={3} themed={true} />
            </TypingTooltip>
        );
    },
    isTyping() {
        return useStateFromStores([TypingStore], () =>
            PrivateChannelSortStore.getPrivateChannelIds().some(id =>
                Object.keys(TypingStore.getTypingUsers(id)).some(userId => userId !== UserStore.getCurrentUser().id)
            )
        );
    },
    patches: [
        {
            find: "#{intl::DISCODO_DISABLED}",
            replacement:
                [
                    {
                        match: /(\(0,\i.jsx\)\(\i.\i,{}\))/,
                        replace: "arguments[0].user == null ? null : (vcIsTyping ? $self.TypingIcon() : $1)"
                    },
                    // define isTyping earlier in the function so i dont bReAk ThE rUlEs Of HoOkS
                    {
                        match: /if\(null==\i\)return null;/,
                        replace: "let vcIsTyping = $self.isTyping();$&"
                    }
                ],
            group: true
        }
    ]
});
