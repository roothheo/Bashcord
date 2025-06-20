/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Menu } from "@webpack/common";

import { addChannelToCategory, canMoveChannelInDirection, currentUserCategories, isPinned, isGroupChannel, moveChannel, removeChannelFromCategory } from "../data";
import { PinOrder, settings } from "../index";
import { openCategoryModal } from "./CreateCategoryModal";

function createPinMenuItem(channelId: string) {
    const pinned = isPinned(channelId);
    const isGroup = isGroupChannel(channelId);

    return (
        <Menu.MenuItem
            id="pin-dm"
            label="Pin DMs"
        >

            {!pinned && (
                <>
                    {!isGroup && (
                <>
                    <Menu.MenuItem
                        id="vc-add-category"
                        label="Add Category"
                        color="brand"
                        action={() => openCategoryModal(null, channelId)}
                    />
                    <Menu.MenuSeparator />

                    {
                                currentUserCategories
                                    .filter(category => category.name !== "GRP") // Exclure la catégorie GRP pour les non-groupes
                                    .map(category => (
                            <Menu.MenuItem
                                key={category.id}
                                id={`pin-category-${category.id}`}
                                label={category.name}
                                action={() => addChannelToCategory(channelId, category.id)}
                            />
                        ))
                    }
                        </>
                    )}

                    {isGroup && (
                        <Menu.MenuItem
                            id="auto-pin-group"
                            label="Épingler automatiquement (GRP)"
                            color="brand"
                            action={() => {
                                // Les groupes sont automatiquement ajoutés à la catégorie GRP
                                const groupCategory = currentUserCategories.find(c => c.name === "GRP");
                                if (groupCategory) {
                                    addChannelToCategory(channelId, groupCategory.id);
                                }
                            }}
                        />
                    )}
                </>
            )}

            {pinned && (
                <>
                    {!isGroup && (
                    <Menu.MenuItem
                        id="unpin-dm"
                        label="Unpin DM"
                        color="danger"
                        action={() => removeChannelFromCategory(channelId)}
                    />
                    )}

                    {isGroup && (
                        <Menu.MenuItem
                            id="unpin-group"
                            label="Désépingler le groupe"
                            color="danger"
                            action={() => removeChannelFromCategory(channelId)}
                        />
                    )}

                    {
                        settings.store.pinOrder === PinOrder.Custom && canMoveChannelInDirection(channelId, -1) && (
                            <Menu.MenuItem
                                id="move-up"
                                label="Move Up"
                                action={() => moveChannel(channelId, -1)}
                            />
                        )
                    }

                    {
                        settings.store.pinOrder === PinOrder.Custom && canMoveChannelInDirection(channelId, 1) && (
                            <Menu.MenuItem
                                id="move-down"
                                label="Move Down"
                                action={() => moveChannel(channelId, 1)}
                            />
                        )
                    }
                </>
            )}

        </Menu.MenuItem>
    );
}

const GroupDMContext: NavContextMenuPatchCallback = (children, props) => {
    const container = findGroupChildrenByChildId("leave-channel", children);
    container?.unshift(createPinMenuItem(props.channel.id));
};

const UserContext: NavContextMenuPatchCallback = (children, props) => {
    const container = findGroupChildrenByChildId("close-dm", children);
    if (container) {
        const idx = container.findIndex(c => c?.props?.id === "close-dm");
        container.splice(idx, 0, createPinMenuItem(props.channel.id));
    }
};

export const contextMenus = {
    "gdm-context": GroupDMContext,
    "user-context": UserContext
};
