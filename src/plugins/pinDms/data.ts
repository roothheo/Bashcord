/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Settings } from "@api/Settings";
import { useForceUpdater } from "@utils/react";
import { ChannelStore, React, UserStore } from "@webpack/common";

import { PinOrder, PrivateChannelSortStore, settings } from "./index";

export interface Category {
    id: string;
    name: string;
    color: number;
    channels: string[];
    collapsed?: boolean;
}

const CATEGORY_BASE_KEY = "PinDMsCategories-";
const CATEGORY_MIGRATED_PINDMS_KEY = "PinDMsMigratedPinDMs";
const CATEGORY_MIGRATED_KEY = "PinDMsMigratedOldCategories";
const OLD_CATEGORY_KEY = "BetterPinDMsCategories-";

// Constante pour le type de canal groupe Discord
const ChannelType = {
    GROUP_DM: 3
} as const;

let forceUpdateDms: (() => void) | undefined = undefined;
export let currentUserCategories: Category[] = [];

export async function init() {
    await migrateData();

    const userId = UserStore.getCurrentUser()?.id;
    if (userId == null) return;

    currentUserCategories = settings.store.userBasedCategoryList[userId] ??= [];

    forceUpdateDms?.();
}

/**
 * Supprime la catégorie GRP et libère tous les groupes
 */
export function removeGroupCategory() {
    const groupCategory = currentUserCategories.find(c => c.name === "GRP");
    if (!groupCategory) return;

    // Libérer tous les canaux de la catégorie GRP
    groupCategory.channels.forEach(channelId => {
        // Les canaux seront automatiquement libérés quand on supprime la catégorie
    });

    // Supprimer la catégorie GRP
    const categoryIndex = currentUserCategories.findIndex(c => c.id === groupCategory.id);
    if (categoryIndex !== -1) {
        currentUserCategories.splice(categoryIndex, 1);
    }
}

/**
 * Gère le changement de l'option autoGroupInCategory
 */
export function handleAutoGroupOptionChange(enabled: boolean) {
    if (enabled) {
        // Option activée : créer la catégorie GRP et déplacer les groupes
        ensureGroupCategory();
        autoMoveGroupsToCategory();
    } else {
        // Option désactivée : supprimer la catégorie GRP
        removeGroupCategory();
    }

    // Forcer la mise à jour de l'interface
    forceUpdateDms?.();
}

export function usePinnedDms() {
    forceUpdateDms = useForceUpdater();
    settings.use(["pinOrder", "canCollapseDmSection", "dmSectionCollapsed", "autoGroupInCategory", "userBasedCategoryList"]);
}

/**
 * Vérifie si un canal est un groupe Discord
 */
export function isGroupChannel(channelId: string): boolean {
    const channel = ChannelStore.getChannel(channelId);
    return channel?.type === ChannelType.GROUP_DM;
}

/**
 * S'assure qu'une catégorie "GRP" existe pour les groupes
 */
export function ensureGroupCategory(): Category {
    let groupCategory = currentUserCategories.find(c => c.name === "GRP");

    if (!groupCategory) {
        groupCategory = {
            id: `grp-${Date.now()}`,
            name: "GRP",
            color: 10070709, // Couleur par défaut
            channels: [],
            collapsed: false
        };
        currentUserCategories.push(groupCategory);
    }

    return groupCategory;
}

/**
 * Déplace automatiquement tous les groupes vers la catégorie GRP
 */
export function autoMoveGroupsToCategory() {
    const groupCategory = ensureGroupCategory();
    const privateChannelIds = PrivateChannelSortStore.getPrivateChannelIds();

    privateChannelIds.forEach(channelId => {
        if (isGroupChannel(channelId)) {
            // Retirer le canal de toute autre catégorie
            removeChannelFromCategory(channelId);

            // L'ajouter à la catégorie GRP s'il n'y est pas déjà
            if (!groupCategory.channels.includes(channelId)) {
                groupCategory.channels.push(channelId);
            }
        }
    });
}

export function getCategory(id: string) {
    return currentUserCategories.find(c => c.id === id);
}

export function getCategoryByIndex(index: number) {
    return currentUserCategories[index];
}

export function createCategory(category: Category) {
    currentUserCategories.push(category);
}

export function addChannelToCategory(channelId: string, categoryId: string) {
    const category = currentUserCategories.find(c => c.id === categoryId);
    if (category == null) return;

    if (category.channels.includes(channelId)) return;

    category.channels.push(channelId);
}

export function removeChannelFromCategory(channelId: string) {
    const category = currentUserCategories.find(c => c.channels.includes(channelId));
    if (category == null) return;

    category.channels = category.channels.filter(c => c !== channelId);
}

export function removeCategory(categoryId: string) {
    const categoryIndex = currentUserCategories.findIndex(c => c.id === categoryId);
    if (categoryIndex === -1) return;

    currentUserCategories.splice(categoryIndex, 1);
}

export function collapseCategory(id: string, value = true) {
    const category = currentUserCategories.find(c => c.id === id);
    if (category == null) return;

    category.collapsed = value;
}

// Utils
export function isPinned(id: string) {
    return currentUserCategories.some(c => c.channels.includes(id));
}

export function categoryLen() {
    return currentUserCategories.length;
}

export function getAllUncollapsedChannels() {
    if (settings.store.pinOrder === PinOrder.LastMessage) {
        const sortedChannels = PrivateChannelSortStore.getPrivateChannelIds();
        return currentUserCategories.filter(c => !c.collapsed).flatMap(c => sortedChannels.filter(channel => c.channels.includes(channel)));
    }

    return currentUserCategories.filter(c => !c.collapsed).flatMap(c => c.channels);
}

export function getSections() {
    return currentUserCategories.reduce((acc, category) => {
        acc.push(category.channels.length === 0 ? 1 : category.channels.length);
        return acc;
    }, [] as number[]);
}

// Move categories
export const canMoveArrayInDirection = (array: any[], index: number, direction: -1 | 1) => {
    const a = array[index];
    const b = array[index + direction];

    return a && b;
};

export const canMoveCategoryInDirection = (id: string, direction: -1 | 1) => {
    const categoryIndex = currentUserCategories.findIndex(m => m.id === id);
    return canMoveArrayInDirection(currentUserCategories, categoryIndex, direction);
};

export const canMoveCategory = (id: string) => canMoveCategoryInDirection(id, -1) || canMoveCategoryInDirection(id, 1);

export const canMoveChannelInDirection = (channelId: string, direction: -1 | 1) => {
    const category = currentUserCategories.find(c => c.channels.includes(channelId));
    if (category == null) return false;

    const channelIndex = category.channels.indexOf(channelId);
    return canMoveArrayInDirection(category.channels, channelIndex, direction);
};


function swapElementsInArray(array: any[], index1: number, index2: number) {
    if (!array[index1] || !array[index2]) return;
    [array[index1], array[index2]] = [array[index2], array[index1]];
}

export function moveCategory(id: string, direction: -1 | 1) {
    const a = currentUserCategories.findIndex(m => m.id === id);
    const b = a + direction;

    swapElementsInArray(currentUserCategories, a, b);
}

export function moveChannel(channelId: string, direction: -1 | 1) {
    const category = currentUserCategories.find(c => c.channels.includes(channelId));
    if (category == null) return;

    const a = category.channels.indexOf(channelId);
    const b = a + direction;

    swapElementsInArray(category.channels, a, b);
}

// TODO(OptionType.CUSTOM Related): Remove DataStore PinnedDms migration once enough time has passed
async function migrateData() {
    if (Settings.plugins.PinDMs.dmSectioncollapsed != null) {
        settings.store.dmSectionCollapsed = Settings.plugins.PinDMs.dmSectioncollapsed;
        delete Settings.plugins.PinDMs.dmSectioncollapsed;
    }

    const dataStoreKeys = await DataStore.keys();
    const pinDmsKeys = dataStoreKeys.map(key => String(key)).filter(key => key.startsWith(CATEGORY_BASE_KEY));

    if (pinDmsKeys.length === 0) return;

    for (const pinDmsKey of pinDmsKeys) {
        const categories = await DataStore.get<Category[]>(pinDmsKey);
        if (categories == null) continue;

        const userId = pinDmsKey.replace(CATEGORY_BASE_KEY, "");
        settings.store.userBasedCategoryList[userId] = categories;

        await DataStore.del(pinDmsKey);
    }

    await Promise.all([DataStore.del(CATEGORY_MIGRATED_PINDMS_KEY), DataStore.del(CATEGORY_MIGRATED_KEY), DataStore.del(OLD_CATEGORY_KEY)]);
}
