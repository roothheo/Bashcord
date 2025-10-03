/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@equicordplugins/_misc/styles.css";

import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Forms, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    platform: {
        type: OptionType.SELECT,
        description: "What platform to show up as on",
        restartNeeded: true,
        options: [
            {
                label: "Desktop",
                value: "desktop",
                default: true,
            },
            {
                label: "Web",
                value: "web",
            },
            {
                label: "Android",
                value: "android"
            },
            {
                label: "iOS",
                value: "ios"
            },
            {
                label: "Xbox",
                value: "xbox",
            },
            {
                label: "Playstation",
                value: "playstation",
            },
        ]
    }
});

export default definePlugin({
    name: "PlatformSpoofer",
    description: "Spoof what platform or device you're on",
    authors: [EquicordDevs.Drag],
    settingsAboutComponent: () => <>
        <Forms.FormText className="plugin-warning">
            We can't guarantee this plugin won't get you warned or banned.
        </Forms.FormText>
    </>,
    settings: settings,
    patches: [
        {
            find: "_doIdentify(){",
            replacement: {
                match: /(\[IDENTIFY\].*let.{0,5}=\{.*properties:)(.*),presence/,
                replace: "$1{...$2,...$self.getPlatform(true)},presence"
            }
        },
        {
            find: "voiceChannelEffect]:",
            replacement: {
                match: /(?<=participantUserId:(\i).{0,2000}participantType:\i,platform:)(\i)(?=,className:\i\(\))/,
                replace: "$self.getPlatform(false, $1)?.vcIcon||$2"
            }
        }
    ],
    getPlatform(bypass, userId?: any) {
        const platform = settings.store.platform ?? "desktop";

        if (bypass || userId === UserStore.getCurrentUser().id) {
            switch (platform) {
                case "desktop":
                    return { browser: "Discord Client", vcIcon: 0 };
                case "web":
                    return { browser: "Discord Web", vcIcon: 0 };
                case "ios":
                    return { browser: "Discord iOS", vcIcon: 1 };
                case "android":
                    return { browser: "Discord Android", vcIcon: 1 };
                case "xbox":
                    return { browser: "Discord Embedded", vcIcon: 2 };
                case "playstation":
                    return { browser: "Discord Embedded", vcIcon: 3 };
                default:
                    return null;
            }
        }

        return null;
    }
});
