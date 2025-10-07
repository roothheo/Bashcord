/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { classNameFactory } from "@api/Styles";
import { NavigationRouter, SelectedChannelStore, SelectedGuildStore, showToast, Toasts, useState } from "@webpack/common";
import { JSX } from "react";

import { logger, settings } from "./constants";
import { BasicChannelTabsProps, ChannelTabsProps, PersistedTabs } from "./types";

const cl = classNameFactory("vc-channeltabs-");

// Navigation context tracking system
interface NavigationContext {
    guildId: string;
    channelId: string;
    timestamp: number;
    source: "bookmark" | "tab" | "unknown";
}

let lastNavigationContext: NavigationContext | null = null;
let isViewingViaBookmark = false;
let isNavigatingViaTabFlag = false;

export function isViewingViaBookmarkMode() {
    return settings.store.bookmarksIndependentFromTabs && isViewingViaBookmark;
}

export function isNavigatingViaTab() {
    return isNavigatingViaTabFlag;
}

export function clearBookmarkViewingMode() {
    isViewingViaBookmark = false;
}

export function setNavigationSource(guildId: string, channelId: string, source: "bookmark" | "tab") {
    lastNavigationContext = {
        guildId: guildId || "@me",
        channelId,
        timestamp: Date.now(),
        source
    };
}

export function isNavigationFromSource(guildId: string | null | undefined, channelId: string, source: "bookmark"): boolean {
    if (!lastNavigationContext) return false;

    // Normalize both sides for comparison (handles null/undefined/"" for DMs)
    const normalizedGuildId = guildId || "@me";
    const normalizedContextGuildId = lastNavigationContext.guildId || "@me";

    // Check if this navigation matches the tracked source
    const matches =
        normalizedContextGuildId === normalizedGuildId &&
        lastNavigationContext.channelId === channelId &&
        lastNavigationContext.source === source;

    // Don't clear immediately - allow multiple React updates to check
    // Context will be cleared by clearStaleNavigationContext() after 2 seconds

    return matches;
}

// Clean up old contexts (safety mechanism)
export function clearStaleNavigationContext() {
    if (lastNavigationContext && Date.now() - lastNavigationContext.timestamp > 2000) {
        lastNavigationContext = null;
    }
}

function replaceArray<T>(array: T[], ...values: T[]) {
    const len = array.length;
    for (let i = 0; i < len; i++) array.pop();
    array.push(...values);
}

let highestIdIndex = 0;
const genId = () => highestIdIndex++;

const openTabs: ChannelTabsProps[] = [];
const closedTabs: ChannelTabsProps[] = [];
let currentlyOpenTab: number;
const openTabHistory: number[] = [];
let persistedTabs: Promise<PersistedTabs | undefined>;

// cache for the tab state (so like scroll pos etc)
interface TabStateCache {
    scrollPosition: number;
    timestamp: number;
}
const tabStateCache = new Map<number, TabStateCache>();

// horror
const _ = {
    get openedTabs() {
        return openTabs;
    }
};
export const { openedTabs } = _;

let update = (save = true) => {
    logger.warn("Update function not set");
};
let bumpGhostTabCount = () => {
    logger.warn("Set ghost tab function not set");
};
let clearGhostTabs = () => {
    logger.warn("Clear ghost tab function not set");
};

export function createTab(props: BasicChannelTabsProps | ChannelTabsProps, switchToTab?: boolean, messageId?: string, save = true) {
    const id = genId();
    openTabs.push({ ...props, id, messageId, compact: "compact" in props ? props.compact : settings.store.openNewTabsInCompactMode });
    if (switchToTab) moveToTab(id);
    clearGhostTabs();
    update(save);
}

export function closeTab(id: number) {
    if (openTabs.length <= 1) return;
    const i = openTabs.findIndex(v => v.id === id);
    if (i === -1) return logger.error("Couldn't find channel tab with ID " + id, openTabs);

    const closed = openTabs.splice(i, 1);
    closedTabs.push(...closed);

    // the memory leak preventer
    tabStateCache.delete(id);

    if (id === currentlyOpenTab) {
        if (openTabHistory.length) {
            openTabHistory.pop();
            let newTab: ChannelTabsProps | undefined = undefined;
            while (!newTab) {
                const maybeNewTabId = openTabHistory.at(-1);
                openTabHistory.pop();
                if (!maybeNewTabId) {
                    moveToTab(openTabs[Math.max(i - 1, 0)].id);
                }
                const maybeNewTab = openTabs.find(t => t.id === maybeNewTabId);
                if (maybeNewTab) newTab = maybeNewTab;
            }

            moveToTab(newTab.id);
            openTabHistory.pop();
        }
        else moveToTab(openTabs[Math.max(i - 1, 0)].id);
    }
    if (i !== openTabs.length) bumpGhostTabCount();
    else clearGhostTabs();
    update();
}

export function closeOtherTabs(id: number) {
    const tab = openTabs.find(v => v.id === id);
    if (tab === undefined) return logger.error("Couldn't find channel tab with ID " + id, openTabs);

    const removedTabs = openTabs.filter(v => v.id !== id);
    closedTabs.push(...removedTabs.reverse());
    const lastTab = openTabs.find(v => v.id === currentlyOpenTab)!;
    replaceArray(openTabs, tab);
    setOpenTab(id);
    replaceArray(openTabHistory, id);

    if (tab.channelId !== lastTab.channelId) moveToTab(id);
    else update();
}

export function closeTabsToTheRight(id: number) {
    const i = openTabs.findIndex(v => v.id === id);
    if (i === -1) return logger.error("Couldn't find channel tab with ID " + id, openTabs);

    const tabsToTheRight = openTabs.filter((_, ind) => ind > i);
    closedTabs.push(...tabsToTheRight.reverse());
    const tabsToTheLeft = openTabs.filter((_, ind) => ind <= i);
    replaceArray(openTabs, ...tabsToTheLeft);

    if (!tabsToTheLeft.some(v => v.id === currentlyOpenTab)) moveToTab(openTabs.at(-1)!.id);
    else update();
}

export function closeTabsToTheLeft(id: number) {
    const i = openTabs.findIndex(v => v.id === id);
    if (i === -1) return logger.error("Couldn't find channel tab with ID " + id, openTabs);

    const tabsToTheLeft = openTabs.filter((_, ind) => ind < i);
    closedTabs.push(...tabsToTheLeft.reverse());
    const tabsToTheRight = openTabs.filter((_, ind) => ind >= i);
    replaceArray(openTabs, ...tabsToTheRight);

    if (!tabsToTheRight.some(v => v.id === currentlyOpenTab)) moveToTab(openTabs[0].id);
    else update();
}

let lastNavigationTime = 0;

export function handleChannelSwitch(ch: BasicChannelTabsProps) {
    // only require channelId to allow synthetic IDs for special pages
    if (!ch.channelId) return;

    // don't modify tabs when viewing via bookmarks in independent mode
    if (isViewingViaBookmarkMode()) {
        return;
    }

    const tab = openTabs.find(c => c.id === currentlyOpenTab);

    // Normalize guildId for DMs/Group Chats to ensure consistent comparison
    const normalizedGuildId = ch.guildId || "@me";
    const existingTab = openTabs.find(tab => {
        const tabGuildId = tab.guildId || "@me";
        return tab.channelId === ch.channelId && tabGuildId === normalizedGuildId;
    });

    // First check: switch to existing tab if setting enabled and tab exists
    if (settings.store.switchToExistingTab && existingTab) {
        moveToTab(existingTab.id);
        return;
    }

    // Second check: create new tab if setting enabled
    if (settings.store.createNewTabIfNotExists) {
        // Apply rapid navigation logic when creating new tabs
        const now = Date.now();
        const isRapidNavigation = now - lastNavigationTime < settings.store.rapidNavigationThreshold * 1000;
        lastNavigationTime = now;

        if (isRapidNavigation && settings.store.enableRapidNavigation) {
            // Replace current tab content instead of creating new one
            const currentTab = openTabs.find(t => t.id === currentlyOpenTab);
            if (currentTab && currentTab.channelId !== ch.channelId) {
                currentTab.channelId = ch.channelId;
                currentTab.guildId = ch.guildId;
                update();
                return;
            }
        }

        // Create new tab (normal behavior)
        if (!existingTab) {
            createTab(ch, true);
        }
        return;
    }

    // Default behavior: replace current tab content
    if (tab && tab.channelId !== ch.channelId) {
        openTabs[openTabs.indexOf(tab)] = { id: tab.id, compact: tab.compact, ...ch };
        update();
    }
}

export function hasClosedTabs() {
    return !!closedTabs.length;
}

export function isTabSelected(id: number) {
    // don't show any tab as selected when viewing via bookmark in independent mode
    if (isViewingViaBookmark && settings.store.bookmarksIndependentFromTabs) {
        return false;
    }
    return id === currentlyOpenTab;
}

export function moveDraggedTabs(index1: number, index2: number) {
    if (index1 < 0 || index1 >= openTabs.length || index2 < 0 || index2 >= openTabs.length)
        return logger.error(`Out of bounds drag (swap between indexes ${index1} and ${index2})`, openTabs);

    const firstItem = openTabs.splice(index1, 1)[0];
    if (!firstItem) return logger.error(`Tab at index ${index1} is undefined`, openTabs);

    openTabs.splice(index2, 0, firstItem);
    update();
}

function getScrollContainer(): HTMLElement | null {
    // discord's main chat scroller
    return document.querySelector('[class*="scrollerInner_"]') as HTMLElement;
}

function cacheCurrentTabState() {
    if (!settings.store.renderAllTabs) return;

    const scrollContainer = getScrollContainer();
    if (scrollContainer && currentlyOpenTab !== undefined) {
        tabStateCache.set(currentlyOpenTab, {
            scrollPosition: scrollContainer.scrollTop,
            timestamp: Date.now()
        });
    }
}

function restoreTabState(tabId: number) {
    if (!settings.store.renderAllTabs) return;

    const cached = tabStateCache.get(tabId);
    if (!cached) return;

    // restore scroll pos after delay to make sure content loaded
    requestAnimationFrame(() => {
        setTimeout(() => {
            const scrollContainer = getScrollContainer();
            if (scrollContainer) {
                scrollContainer.scrollTop = cached.scrollPosition;
            }
        }, 50);
    });
}

export function moveToTab(id: number) {
    const tab = openTabs.find(v => v.id === id);
    if (tab === undefined) return logger.error("Couldn't find channel tab with ID " + id, openTabs);

    // clear bookmark viewing mode when switching to a tab
    isViewingViaBookmark = false;

    // cache current tab state before switching to it
    cacheCurrentTabState();

    setOpenTab(id);

    // SET FLAG: We're initiating navigation
    isNavigatingViaTabFlag = true;

    // handle special pages with synthetic channelIds
    if (tab.channelId && tab.channelId.startsWith("__")) {
        const routeMap: Record<string, string> = {
            "__quests__": "/quest-home",
            "__message-requests__": "/message-requests",
            "__friends__": "/channels/@me",
            "__shop__": "/shop",
            "__library__": "/library",
            "__discovery__": "/discovery",
            "__nitro__": "/store"
        };

        const route = routeMap[tab.channelId];
        if (route) {
            setNavigationSource(tab.guildId, tab.channelId, "tab");
            NavigationRouter.transitionTo(route);
            // Clear flag after navigation completes
            setTimeout(() => { isNavigatingViaTabFlag = false; }, 100);
            return;
        }
    }

    // regular channel nav
    if (tab.messageId) {
        setNavigationSource(tab.guildId, tab.channelId, "tab");
        NavigationRouter.transitionTo(`/channels/${tab.guildId}/${tab.channelId}/${tab.messageId}`);
        delete openTabs[openTabs.indexOf(tab)].messageId;
    }
    else if (tab.channelId !== SelectedChannelStore.getChannelId() || tab.guildId !== SelectedGuildStore.getGuildId()) {
        setNavigationSource(tab.guildId, tab.channelId, "tab");
        NavigationRouter.transitionToGuild(tab.guildId, tab.channelId);
        // restore cached state for the new tab
        restoreTabState(id);
    }
    else update();

    // Clear flag after navigation
    setTimeout(() => { isNavigatingViaTabFlag = false; }, 100);
}

export function openStartupTabs(props: BasicChannelTabsProps & { userId: string; }, setUserId: (id: string) => void) {
    const { userId } = props;
    persistedTabs ??= DataStore.get("ChannelTabs_openChannels_v2");
    replaceArray(openTabs);
    replaceArray(openTabHistory);
    highestIdIndex = 0;

    if (settings.store.onStartup !== "nothing" && Vencord.Plugins.isPluginEnabled("KeepCurrentChannel"))
        return showToast("Not restoring tabs as KeepCurrentChannel is enabled", Toasts.Type.FAILURE);

    switch (settings.store.onStartup) {
        case "remember": {
            persistedTabs.then(tabs => {
                const t = tabs?.[userId];
                if (!t) {
                    createTab({ channelId: props.channelId, guildId: props.guildId }, true);
                    return showToast("Failed to restore tabs", Toasts.Type.FAILURE);
                }
                replaceArray(openTabs); // empty the array
                t.openTabs.forEach(tab => createTab(tab));
                currentlyOpenTab = openTabs[t.openTabIndex]?.id ?? 0;

                setUserId(userId);
                moveToTab(currentlyOpenTab);
            });
            break;
        }
        case "preset": {
            const tabs = settings.store.tabSet?.[userId];
            if (!tabs) break;
            tabs.forEach(t => createTab(t));
            setOpenTab(0);
            setUserId(userId);
            break;
        }
        default: {
            setUserId(userId);
        }
    }

    if (!openTabs.length) createTab({ channelId: props.channelId, guildId: props.guildId }, true, undefined, false);
    for (let i = 0; i < openTabHistory.length; i++) openTabHistory.pop();
    moveToTab(currentlyOpenTab);
}

export function reopenClosedTab() {
    if (!closedTabs.length) return;
    const tab = closedTabs.pop()!;
    createTab(tab, true);
}

export const saveTabs = async (userId: string) => {
    if (!userId) return;

    DataStore.update<PersistedTabs>("ChannelTabs_openChannels_v2", old => {
        return {
            ...(old ?? {}),
            [userId]: { openTabs, openTabIndex: openTabs.findIndex(t => t.id === currentlyOpenTab) }
        };
    });
};

export function setOpenTab(id: number) {
    const i = openTabs.findIndex(v => v.id === id);
    if (i === -1) return logger.error("Couldn't find channel tab with ID " + id, openTabs);

    currentlyOpenTab = id;
    openTabHistory.push(id);
}

export function setUpdaterFunction(fn: () => void) {
    update = fn;
}

export function switchChannel(ch: BasicChannelTabsProps) {
    handleChannelSwitch(ch);
    moveToTab(openTabs.find(t => t.id === currentlyOpenTab)!.id);
}

export function navigateToBookmark(ch: BasicChannelTabsProps) {
    // check if independent mode is enabled
    if (settings.store.bookmarksIndependentFromTabs) {
        // set flag that we're viewing via bookmark
        isViewingViaBookmark = true;

        // set navigation context BEFORE navigating
        setNavigationSource(ch.guildId, ch.channelId, "bookmark");

        // Handle special pages with synthetic channelIds
        if (ch.channelId && ch.channelId.startsWith("__")) {
            const routeMap: Record<string, string> = {
                "__quests__": "/quest-home",
                "__message-requests__": "/message-requests",
                "__friends__": "/channels/@me",
                "__shop__": "/shop",
                "__library__": "/library",
                "__discovery__": "/discovery",
                "__nitro__": "/store"
            };

            const route = routeMap[ch.channelId];
            if (route) {
                NavigationRouter.transitionTo(route);
                // trigger update to reflect tab deselection
                update();
                return;
            }
        }

        // navigate directly without affecting tab state
        NavigationRouter.transitionToGuild(ch.guildId, ch.channelId);

        // trigger update to reflect tab deselection
        update();
    } else {
        // use old behavior - affects tabs
        // sorry for all the comments im losing it here
        switchChannel(ch);
    }
}

export function toggleCompactTab(id: number) {
    const i = openTabs.findIndex(v => v.id === id);
    if (i === -1) return logger.error("Couldn't find channel tab with ID " + id, openTabs);

    openTabs[i] = {
        ...openTabs[i],
        compact: !openTabs[i].compact
    };
    update();
}

export function useGhostTabs() {
    let timeout;
    const [count, setCount] = useState(0);
    bumpGhostTabCount = () => {
        setCount(count + 1);
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            setCount(0);
        }, 3000);
    };
    clearGhostTabs = () => {
        clearTimeout(timeout);
        setCount(0);
    };
    return new Array<JSX.Element>(count).fill(<div className={cl("tab", "ghost-tab")} />);
}
