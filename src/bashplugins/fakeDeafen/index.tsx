import definePlugin from "@utils/types";
import { findByProps, findComponentByCodeLazy } from "@webpack";
import { React } from "@webpack/common";

let originalVoiceStateUpdate: any;
let fakeDeafenEnabled = false;

const Button = findComponentByCodeLazy(".NONE,disabled:", ".PANEL_BUTTON");

function FakeDeafenIcon() {
    const color = fakeDeafenEnabled ? "#fff" : "#888";
    return (
        <svg width="28" height="28" viewBox="0 0 241 209" fill="none">
            <g transform="translate(0,209) scale(0.1,-0.1)" fill={color} stroke="none">
                <path d="M825 1742 c-44 -21 -167 -153 -227 -242 -38 -58 -64 -150 -53 -193 6
-22 2 -27 -41 -43 -25 -10 -56 -28 -68 -40 -11 -12 -43 -27 -71 -33 -57 -14
-98 -37 -90 -51 4 -6 -7 -10 -24 -10 -16 0 -41 -4 -55 -10 l-26 -10 0 -430 0
-430 391 0 392 0 -6 45 c-11 77 46 177 148 261 49 39 173 96 330 151 55 19
109 43 120 53 28 25 130 75 191 93 77 23 107 41 145 89 47 57 144 208 153 235
11 36 46 73 69 73 36 0 96 50 117 97 22 51 43 183 30 198 -4 5 -10 24 -12 40
-3 26 -8 30 -36 33 -22 2 -34 -2 -38 -12 -3 -9 -12 -16 -19 -16 -8 0 -23 -12
-34 -26 -16 -20 -31 -27 -58 -28 -33 -1 -40 3 -54 33 -20 43 -42 56 -60 35
-10 -13 -10 -20 4 -44 17 -29 22 -62 11 -73 -4 -3 -7 -38 -9 -77 -2 -76 -26
-126 -59 -124 -10 1 -28 -9 -41 -22 -16 -16 -36 -24 -57 -24 -18 0 -51 -10
-73 -23 -22 -13 -66 -33 -98 -46 -54 -22 -62 -23 -118 -11 -57 12 -61 12 -93
-11 -32 -23 -383 -318 -409 -343 -7 -7 -136 -115 -287 -241 -151 -126 -278
-233 -282 -239 -11 -17 -60 11 -56 33 3 16 104 107 378 336 46 39 122 103 169
144 47 40 163 137 256 216 94 78 177 151 185 160 10 12 15 42 15 92 l1 75 -86
56 c-47 31 -98 63 -113 71 -15 8 -26 19 -24 25 13 35 -89 168 -154 202 -50 25
-127 28 -174 6z m-105 -362 c23 13 26 5 6 -16 -17 -16 -62 -19 -71 -4 -3 6 -3
20 0 31 l7 21 19 -21 c16 -17 24 -19 39 -11z m625 -62 c9 -37 -12 -58 -57 -58
-23 0 -28 4 -28 23 0 14 6 24 15 24 8 0 12 -4 9 -9 -3 -4 2 -8 10 -8 22 0 28
17 8 25 -16 6 -16 7 2 21 28 20 34 18 41 -18z m-322 -133 c97 -17 137 -32 137
-52 0 -18 -118 -17 -235 2 -91 14 -111 14 -78 -3 39 -20 132 -36 215 -36 101
-1 92 -16 -15 -24 -74 -5 -159 10 -218 39 -46 23 -62 43 -54 69 6 18 15 20 84
20 43 0 117 -7 164 -15z m-663 -887 c0 -14 -19 1 -31 25 -12 22 -12 22 10 3
11 -11 21 -23 21 -28z"/>
                <path d="M1130 1652 c0 -5 7 -15 15 -22 8 -6 17 -22 21 -33 8 -28 44 -67 60
-67 17 0 1 45 -24 74 -25 27 -72 59 -72 48z"/>
            </g>
        </svg>
    );
}

function FakeDeafenButton() {
    return (
        <Button
            tooltipText={fakeDeafenEnabled ? "Disable Fake Deafen" : "Enable Fake Deafen"}
            icon={FakeDeafenIcon}
            role="switch"
            aria-checked={fakeDeafenEnabled}
            redGlow={fakeDeafenEnabled}
            onClick={() => {
                fakeDeafenEnabled = !fakeDeafenEnabled;
                const ChannelStore = findByProps("getChannel", "getDMFromUserId");
                const SelectedChannelStore = findByProps("getVoiceChannelId");
                const GatewayConnection = findByProps("voiceStateUpdate", "voiceServerPing");
                const MediaEngineStore = findByProps("isDeaf", "isMute");
                if (ChannelStore && SelectedChannelStore && GatewayConnection && typeof GatewayConnection.voiceStateUpdate === "function") {
                    const channelId = SelectedChannelStore.getVoiceChannelId?.();
                    const channel = channelId ? ChannelStore.getChannel?.(channelId) : null;
                    if (channel) {
                        if (fakeDeafenEnabled) {
                            GatewayConnection.voiceStateUpdate({
                                channelId: channel.id,
                                guildId: channel.guild_id,
                                selfMute: true,
                                selfDeaf: true
                            });
                        } else {
                            const selfMute = MediaEngineStore?.isMute?.() ?? false;
                            const selfDeaf = MediaEngineStore?.isDeaf?.() ?? false;
                            GatewayConnection.voiceStateUpdate({
                                channelId: channel.id,
                                guildId: channel.guild_id,
                                selfMute,
                                selfDeaf
                            });
                        }
                    }
                }
            }}
        />
    );
}

export default definePlugin({
    name: "FakeDeafen",
    description: "Adds a button to fake deafen yourself in voice channels. When enabled, you appear deafened and muted to others, but you can still hear and speak.",
    authors: [{ name: "hyyven", id: 449282863582412850n }],
    patches: [
        {
            find: "#{intl::ACCOUNT_SPEAKING_WHILE_MUTED}",
            replacement: {
                match: /className:\i\.buttons,.{0,50}children:\[/,
                replace: "$&$self.FakeDeafenButton(),"
            }
        }
    ],
    FakeDeafenButton,
    start() {
        const GatewayConnection = findByProps("voiceStateUpdate", "voiceServerPing");
        if (!GatewayConnection || typeof GatewayConnection.voiceStateUpdate !== "function") {
            console.warn("[FakeDeafen] GatewayConnection.voiceStateUpdate not found");
        } else {
            originalVoiceStateUpdate = GatewayConnection.voiceStateUpdate;
            GatewayConnection.voiceStateUpdate = function (args) {
                if (fakeDeafenEnabled && args && typeof args === "object") {
                    args.selfMute = true;
                    args.selfDeaf = true;
                }
                return originalVoiceStateUpdate.apply(this, arguments);
            };
        }
    },
    stop() {
        const GatewayConnection = findByProps("voiceStateUpdate", "voiceServerPing");
        if (GatewayConnection && originalVoiceStateUpdate) {
            GatewayConnection.voiceStateUpdate = originalVoiceStateUpdate;
        }
    }
});
