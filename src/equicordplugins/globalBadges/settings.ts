/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    showPrefix: {
        type: OptionType.BOOLEAN,
        description: "Shows the Mod as Prefix",
        default: true,
        restartNeeded: false
    },
    showSuffix: {
        type: OptionType.BOOLEAN,
        description: "Shows the Mod as Suffix",
        default: false,
        restartNeeded: false
    },
    showCustom: {
        type: OptionType.BOOLEAN,
        description: "Show Custom Badges",
        default: true,
        restartNeeded: false
    },
    showNekocord: {
        type: OptionType.BOOLEAN,
        description: "Show Nekocord Badges",
        default: true,
        restartNeeded: false
    },
    showReviewDB: {
        type: OptionType.BOOLEAN,
        description: "Show ReviewDB Badges",
        default: true,
        restartNeeded: false
    },
    showAero: {
        type: OptionType.BOOLEAN,
        description: "Show Aero Badges",
        default: true,
        restartNeeded: false
    },
    showAliucord: {
        type: OptionType.BOOLEAN,
        description: "Show Aliucord Badges",
        default: true,
        restartNeeded: false
    },
    showRa1ncord: {
        type: OptionType.BOOLEAN,
        description: "Show Ra1ncord Badges",
        default: true,
        restartNeeded: false
    },
    showVelocity: {
        type: OptionType.BOOLEAN,
        description: "Show Velocity Badges",
        default: true,
        restartNeeded: false
    },
    showEnmity: {
        type: OptionType.BOOLEAN,
        description: "Show Enmity Badges",
        default: true,
        restartNeeded: false
    },
    showReplugged: {
        type: OptionType.BOOLEAN,
        description: "Show Replugged Badges",
        default: true,
        restartNeeded: false
    }
});
