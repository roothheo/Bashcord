/*!
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// DO NOT REMOVE UNLESS YOU WISH TO FACE THE WRATH OF THE CIRCULAR DEPENDENCY DEMON!!!!!!!
import "~plugins";

import "./utils/quickCss";
import "./webpack/patchWebpack";

export * as Api from "./api";
export * as Components from "./components";
export * as Plugins from "./plugins";
export * as Util from "./utils";
export * as QuickCss from "./utils/quickCss";
export * as Updater from "./utils/updater";
export * as Webpack from "./webpack";
export * as WebpackPatcher from "./webpack/patchWebpack";
export { PlainSettings, Settings };

import { addVencordUiStyles } from "@components/css";
import { openUpdaterModal } from "@components/settings/tabs/updater";
import { IS_WINDOWS } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { StartAt } from "@utils/types";
import { openWelcomeModal } from "./components/WelcomeModal";

// Fonction de test pour forcer l'affichage du popup (accessible depuis la console)
(window as any).testBashcordWelcome = () => {
    console.log("🎉 Bashcord: Force opening welcome modal...");
    openWelcomeModal();
};

// Fonction pour réinitialiser le popup (accessible depuis la console)
(window as any).resetBashcordWelcome = () => {
    console.log("🎉 Bashcord: Resetting welcome popup...");
    localStorage.removeItem("bashcord-welcome-shown");
    console.log("🎉 Bashcord: Welcome popup reset. Reload Discord to see it again.");
};

import { get as dsGet } from "./api/DataStore";
import { NotificationData, showNotification } from "./api/Notifications";
import { PlainSettings, Settings } from "./api/Settings";
import { patches, PMLogger, startAllPlugins } from "./plugins";
import { localStorage } from "./utils/localStorage";
import { relaunch } from "./utils/native";
import { getCloudSettings, putCloudSettings } from "./utils/settingsSync";
import { changes, checkForUpdates, update, UpdateLogger } from "./utils/updater";
import { onceReady } from "./webpack";
import { SettingsRouter } from "./webpack/common";

if (IS_REPORTER) {
    require("./debug/runReporter");
}

async function syncSettings() {
    // Check if cloud auth exists for current user before attempting sync
    const hasCloudAuth = await dsGet("Vencord_cloudSecret");
    if (!hasCloudAuth) {
        if (Settings.cloud.authenticated) {
            // User switched to an account that isn't connected to cloud
            showNotification({
                title: "Cloud Settings",
                body: "Cloud sync was disabled because this account isn't connected to the cloud App. You can enable it again by connecting this account in Cloud Settings. (note: it will store your preferences separately)",
                color: "var(--yellow-360)",
                onClick: () => SettingsRouter.open("VencordCloud")
            });
            // Disable cloud sync globally
            Settings.cloud.authenticated = false;
        }
        return;
    }

    // pre-check for local shared settings
    if (
        Settings.cloud.authenticated &&
        !hasCloudAuth // this has been enabled due to local settings share or some other bug
    ) {
        // show a notification letting them know and tell them how to fix it
        showNotification({
            title: "Cloud Integrations",
            body: "We've noticed you have cloud integrations enabled in another client! Due to limitations, you will " +
                "need to re-authenticate to continue using them. Click here to go to the settings page to do so!",
            color: "var(--yellow-360)",
            onClick: () => SettingsRouter.open("EquicordCloud")
        });
        return;
    }

    if (
        Settings.cloud.settingsSync && // if it's enabled
        Settings.cloud.authenticated // if cloud integrations are enabled
    ) {
        if (localStorage.Vencord_settingsDirty) {
            await putCloudSettings();
            delete localStorage.Vencord_settingsDirty;
        } else if (await getCloudSettings(false)) {
            // if we synchronized something (false means no sync)
            // we show a notification here instead of allowing getCloudSettings() to show one to declutter the amount of
            // potential notifications that might occur. getCloudSettings() will always send a notification regardless if
            // there was an error to notify the user, but besides that we only want to show one notification instead of all
            // of the possible ones it has (such as when your settings are newer).
            showNotification({
                title: "Cloud Settings",
                body: "Your settings have been updated! Click here to restart to fully apply changes!",
                color: "var(--green-360)",
                onClick: relaunch
            });
        }
    }
}

let notifiedForUpdatesThisSession = false;
let isUpdatingInProgress = false;
let lastUpdateCheckTime = 0;

async function runUpdateCheck() {
    // Protection anti-boucle : ne pas vérifier si une mise à jour est déjà en cours
    if (isUpdatingInProgress) {
        UpdateLogger.info("Update already in progress, skipping check");
        return;
    }

    // Protection anti-boucle : ne pas vérifier trop souvent (minimum 2 minutes entre les vérifications)
    const now = Date.now();
    const timeSinceLastCheck = now - lastUpdateCheckTime;
    if (timeSinceLastCheck < 2 * 60 * 1000) {
        UpdateLogger.info(`Skipping update check (last check ${Math.round(timeSinceLastCheck / 1000)}s ago)`);
        return;
    }
    lastUpdateCheckTime = now;

    // Protection anti-boucle : vérifier si une mise à jour a été installée récemment (dans les 5 dernières minutes)
    // Cela évite les boucles infinies si le hash ne correspond pas
    const lastUpdateTime = localStorage.getItem("bashcord-last-update-time");
    if (lastUpdateTime) {
        const timeSinceLastUpdate = now - parseInt(lastUpdateTime, 10);
        if (timeSinceLastUpdate < 5 * 60 * 1000) {
            UpdateLogger.info(`Recent update detected (${Math.round(timeSinceLastUpdate / 1000)}s ago), skipping check to prevent loop`);
            return;
        }
    }

    const notify = (data: NotificationData) => {
        if (notifiedForUpdatesThisSession) return;
        notifiedForUpdatesThisSession = true;

        setTimeout(() => showNotification({
            permanent: true,
            noPersist: true,
            ...data
        }), 10_000);
    };

    try {
        const isOutdated = await checkForUpdates();
        if (!isOutdated) {
            // Si pas de mise à jour, la comparaison par timestamp a déjà été faite dans checkForUpdates
            return;
        }

        // Installation automatique forcée pour garantir que Bashcord reste à jour
        // même si Discord change quelque chose qui bloque l'accès aux paramètres
        UpdateLogger.info("Bashcord update detected, installing automatically...");
        isUpdatingInProgress = true;
        
        const updateSuccess = await update();
        if (updateSuccess) {
            UpdateLogger.info("Bashcord updated successfully, restarting...");
            // Enregistrer le timestamp de la mise à jour pour éviter les boucles
            localStorage.setItem("bashcord-last-update-time", now.toString());
            // Enregistrer le timestamp de la release comme dernière version installée
            if (IS_STANDALONE && changes.length > 0) {
                const releaseTimestamp = changes[0].hash; // Contient maintenant le timestamp published_at
                if (releaseTimestamp) {
                    let releaseTime: number;
                    try {
                        releaseTime = new Date(releaseTimestamp).getTime();
                        if (isNaN(releaseTime)) {
                            releaseTime = parseInt(releaseTimestamp, 10);
                        }
                    } catch {
                        releaseTime = parseInt(releaseTimestamp, 10);
                    }
                    if (!isNaN(releaseTime) && releaseTime > 0) {
                        localStorage.setItem("bashcord-last-installed-timestamp", releaseTime.toString());
                        UpdateLogger.info(`Stored release timestamp: ${new Date(releaseTime).toISOString()}`);
                    }
                }
            }
            
            // Toujours notifier l'utilisateur qu'une mise à jour a été installée
            notify({
                title: "Bashcord has been updated!",
                body: "Click here to restart Discord to apply changes",
                onClick: relaunch
            });
            // Relancer automatiquement après un court délai pour appliquer les changements
            setTimeout(() => {
                relaunch();
            }, 3000);
        } else {
            UpdateLogger.error("Failed to install Bashcord update");
            isUpdatingInProgress = false;
            notify({
                title: "Bashcord update failed",
                body: "An update was available but installation failed. Check console for details.",
                color: "var(--red-360)"
            });
        }
    } catch (err) {
        isUpdatingInProgress = false;
        UpdateLogger.error("Failed to check or install updates", err);
        notify({
            title: "Bashcord update check failed",
            body: "Failed to check for updates. Check console for details.",
            color: "var(--red-360)"
        });
    }
}


async function init() {
    await onceReady;
    startAllPlugins(StartAt.WebpackReady);

    syncSettings();

    // Popup de bienvenue Bashcord
    setTimeout(() => {
        const hasShownWelcome = localStorage.getItem("bashcord-welcome-shown");
        console.log("🎉 Bashcord: Checking welcome popup...", { hasShownWelcome });
        
        if (!hasShownWelcome) {
            console.log("🎉 Bashcord: Opening welcome modal...");
            openWelcomeModal();
            localStorage.setItem("bashcord-welcome-shown", "true");
        } else {
            console.log("🎉 Bashcord: Welcome popup already shown, skipping...");
        }
    }, 3000);

    if (!IS_DEV && !IS_WEB && !IS_UPDATER_DISABLED) {
        // Vérification immédiate au démarrage
        runUpdateCheck();

        // Vérification périodique toutes les 30 minutes pour garantir que Bashcord reste à jour
        // même si Discord change quelque chose qui bloque l'accès aux paramètres
        setInterval(runUpdateCheck, 1000 * 60 * 30); // 30 minutes
    }

    if (IS_DEV) {
        const pendingPatches = patches.filter(p => !p.all && p.predicate?.() !== false);
        if (pendingPatches.length)
            PMLogger.warn(
                "Webpack has finished initialising, but some patches haven't been applied yet.",
                "This might be expected since some Modules are lazy loaded, but please verify",
                "that all plugins are working as intended.",
                "You are seeing this warning because this is a Development build of Equicord.",
                "\nThe following patches have not been applied:",
                "\n\n" + pendingPatches.map(p => `${p.plugin}: ${p.find}`).join("\n")
            );
    }
}

startAllPlugins(StartAt.Init);
init();

document.addEventListener("DOMContentLoaded", () => {
    addVencordUiStyles();

    startAllPlugins(StartAt.DOMContentLoaded);

    // FIXME
    if (IS_DISCORD_DESKTOP && Settings.winNativeTitleBar && IS_WINDOWS) {
        createAndAppendStyle("vencord-native-titlebar-style").textContent = "[class*=titleBar]{display: none!important}";
    }
}, { once: true });
