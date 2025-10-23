/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { makeRange, OptionType } from "@utils/types";
import { Button, MaskedLink, showToast, Toasts } from "@webpack/common";

import hoverOnlyStyle from "./hoverOnly.css?managed";
import { clearLyricsCache, removeTranslations } from "./spotify/lyrics/api";
import languages from "./spotify/lyrics/providers/translator/languages";
import { Provider } from "./spotify/lyrics/providers/types";

const sliderOptions = {
    markers: makeRange(-2500, 2500, 250),
    stickToMarkers: true,
};

export function toggleHoverControls(value: boolean) {
    (value ? enableStyle : disableStyle)(hoverOnlyStyle);
}

function InstallInstructions() {
    return (
        <section>
            <HeadingSecondary>How to install</HeadingSecondary>
            <Paragraph>
                Install <MaskedLink href="https://github.com/Inrixia/TidaLuna#installation">TidaLuna</MaskedLink> from here, then go to TidalLuna settings &rarr; Plugin stores &rarr; Install <code>@vmohammad/api</code>
            </Paragraph>
        </section>
    );
}

export const settings = definePluginSettings({
    hoverControls: {
        description: "Show controls on hover",
        type: OptionType.BOOLEAN,
        default: false,
        onChange: v => toggleHoverControls(v)
    },
    ShowMusicNoteOnNoLyrics: {
        description: "Show a music note icon when no lyrics are found",
        type: OptionType.BOOLEAN,
        default: true,
    },
    LyricsPosition: {
        description: "Position of the lyrics",
        type: OptionType.SELECT,
        options: [
            { value: "above", label: "Above Player(s)" },
            { value: "below", label: "Below  Player(s)", default: true },
        ],
    },
    LyricsProvider: {
        description: "Where lyrics are fetched from",
        type: OptionType.SELECT,
        options: [
            { value: Provider.Spotify, label: "Spotify (Musixmatch)", default: true },
            { value: Provider.Lrclib, label: "LRCLIB" },
        ],
    },
    TranslateTo: {
        description: "Translate lyrics to - Changing this will clear existing translations",
        type: OptionType.SELECT,
        options: languages,
        onChange: async () => {
            await removeTranslations();
            showToast("Translations cleared", Toasts.Type.SUCCESS);
        }
    },
    LyricsConversion: {
        description: "Automatically translate or romanize lyrics",
        type: OptionType.SELECT,
        options: [
            { value: Provider.None, label: "None", default: true },
            { value: Provider.Translated, label: "Translate" },
            { value: Provider.Romanized, label: "Romanize" },
        ]
    },
    FallbackProvider: {
        description: "When a lyrics provider fails, try other providers",
        type: OptionType.BOOLEAN,
        default: true,
    },
    ShowFailedToasts: {
        description: "Hide toasts when lyrics fail to fetch",
        type: OptionType.BOOLEAN,
        default: true,
    },
    LyricDelay: {
        description: "",
        type: OptionType.SLIDER,
        default: 0,
        ...sliderOptions
    },
    PurgeLyricsCache: {
        description: "Purge the lyrics cache",
        type: OptionType.COMPONENT,
        component: () => (
            <Button
                color={Button.Colors.RED}
                onClick={() => {
                    clearLyricsCache();
                    showToast("Lyrics cache purged", Toasts.Type.SUCCESS);
                }}
            >
                Purge Cache
            </Button>
        ),
    },
    SpotifySectionTitle: {
        type: OptionType.COMPONENT,
        component: () => (
            <section>
                <HeadingSecondary>Spotify</HeadingSecondary>
            </section>
        )
    },
    showSpotifyControls: {
        description: "Show Spotify Controls",
        type: OptionType.BOOLEAN,
        default: false,
    },
    showSpotifyLyrics: {
        description: "Show Spotify Lyrics",
        type: OptionType.BOOLEAN,
        default: false,
    },
    useSpotifyUris: {
        type: OptionType.BOOLEAN,
        description: "Open Spotify URIs instead of Spotify URLs. Will only work if you have Spotify installed and might not work on all platforms",
        default: false
    },
    previousButtonRestartsTrack: {
        type: OptionType.BOOLEAN,
        description: "Restart currently playing track when pressing the previous button if playtime is >3s",
        default: true
    },

    TidalSectionTitle: {
        type: OptionType.COMPONENT,
        component: () => (
            <section>
                <HeadingSecondary>Tidal</HeadingSecondary>
            </section>
        )
    },
    installTidalWithWS: {
        type: OptionType.COMPONENT,
        component: () => <InstallInstructions />
    },
    showTidalControls: {
        description: "Show Tidal Player",
        type: OptionType.BOOLEAN,
        default: false,
    },
    showTidalLyrics: {
        description: "Show Tidal Controls",
        type: OptionType.BOOLEAN,
        default: false,
    },

    YtmSectionTitle: {
        type: OptionType.COMPONENT,
        component: () => (
            <section>
                <HeadingSecondary>Youtube Music</HeadingSecondary>
            </section>
        )
    },
    showYoutubeMusicControls: {
        description: "Show Youtube Music Controls",
        type: OptionType.BOOLEAN,
        default: false
    },
    YoutubeMusicApiUrl: {
        description: "Custom URL for the Api Server plugin",
        type: OptionType.STRING,
        default: "http://localhost:26538",
        placeholder: "http://localhost:26538",
        onChange: (value: string) => {
            if (URL.canParse(value)) {
                settings.store.YoutubeMusicApiUrl = value;
            } else {
                showToast("Invalid URL format for Custom Api Server URL: " + value, Toasts.Type.FAILURE);
                settings.store.YoutubeMusicApiUrl = settings.def.YoutubeMusicApiUrl.default;
            }
        }
    }

});
