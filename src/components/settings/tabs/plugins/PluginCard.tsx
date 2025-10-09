/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotice } from "@api/Notices";
import { classNameFactory } from "@api/Styles";
import { CogWheel, InfoIcon } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { proxyLazy } from "@utils/lazy";
import { Logger } from "@utils/Logger";
import { classes, isObjectEmpty } from "@utils/misc";
import { Plugin } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { React, showToast, Toasts } from "@webpack/common";
import { Settings } from "Vencord";

import { PluginMeta } from "~plugins";

import { openPluginModal } from "./PluginModal";

const logger = new Logger("PluginCard");
const cl = classNameFactory("vc-plugins-");

// Avoid circular dependency
const { startDependenciesRecursive, startPlugin, stopPlugin, isPluginEnabled } = proxyLazy(() => require("plugins") as typeof import("plugins"));

export const ButtonClasses = findByPropsLazy("button", "disabled", "enabled");

interface PluginCardProps {
    plugin: Plugin;
    disabled?: boolean;
    onRestartNeeded(name: string, key: string): void;
    isNew?: boolean;
    onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

export function PluginCard({ plugin, disabled, onRestartNeeded, onMouseEnter, onMouseLeave, isNew }: PluginCardProps) {
    const settings = Settings.plugins[plugin.name];
    const pluginMeta = PluginMeta[plugin.name];
    const isEquicordPlugin = pluginMeta.folderName.startsWith("src/equicordplugins/") ?? false;
    const isUserplugin = pluginMeta.userPlugin ?? false;

    const isEnabled = () => isPluginEnabled(plugin.name);

    function toggleEnabled() {
        const wasEnabled = isEnabled();

        // If we're enabling a plugin, make sure all deps are enabled recursively.
        if (!wasEnabled) {
            const { restartNeeded, failures } = startDependenciesRecursive(plugin);

            if (failures.length) {
                logger.error(`Failed to start dependencies for ${plugin.name}: ${failures.join(", ")}`);
                showNotice("Failed to start dependencies: " + failures.join(", "), "Close", () => null);
                return;
            }

            if (restartNeeded) {
                // If any dependencies have patches, don't start the plugin yet.
                settings.enabled = true;
                onRestartNeeded(plugin.name, "enabled");
                return;
            }
        }

        // if the plugin has patches, dont use stopPlugin/startPlugin. Wait for restart to apply changes.
        if (plugin.patches?.length) {
            settings.enabled = !wasEnabled;
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        // If the plugin is enabled, but hasn't been started, then we can just toggle it off.
        if (wasEnabled && !plugin.started) {
            settings.enabled = !wasEnabled;
            return;
        }

        const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);

        if (!result) {
            settings.enabled = false;

            const msg = `Error while ${wasEnabled ? "stopping" : "starting"} plugin ${plugin.name}`;
            showToast(msg, Toasts.Type.FAILURE, {
                position: Toasts.Position.BOTTOM,
            });

            return;
        }

        settings.enabled = !wasEnabled;
    }

    const sourceBadge = isEquicordPlugin ? (
        <img
            src="https://equicord.org/assets/favicon.png"
            alt="Equicord"
            title="Equicord Plugin"
            style={{
                width: "20px",
                height: "20px",
                marginLeft: "8px",
                borderRadius: "2px"
            }}
        />
    ) : isUserplugin ? (
        <img
            src="data:image/jpeg;base64,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"
            alt="Userplugin"
            title="Userplugin"
            style={{
                width: "20px",
                height: "20px",
                marginLeft: "8px",
                borderRadius: "2px"
            }}
        />
    ) : (
        <img
            src="https://vencord.dev/assets/favicon-dark.png"
            alt="Vencord"
            title="Vencord Plugin"
            style={{
                width: "20px",
                height: "20px",
                marginLeft: "8px",
                borderRadius: "2px"
            }}
        />
    );

    return (
        <AddonCard
            name={plugin.name}
            sourceBadge={sourceBadge}
            description={plugin.description}
            isNew={isNew}
            enabled={isEnabled()}
            setEnabled={toggleEnabled}
            disabled={disabled}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            infoButton={
                <button
                    role="switch"
                    onClick={() => openPluginModal(plugin, onRestartNeeded)}
                    className={classes(ButtonClasses.button, cl("info-button"))}
                >
                    {plugin.options && !isObjectEmpty(plugin.options)
                        ? <CogWheel className={cl("info-icon")} />
                        : <InfoIcon className={cl("info-icon")} />
                    }
                </button>
            } />
    );
}
