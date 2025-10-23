/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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

import { showNotification } from "@api/Notifications";
import { Settings, useSettings } from "@api/Settings";
import { CheckedTextInput } from "@components/CheckedTextInput";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Grid } from "@components/Grid";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { authorizeCloud, cloudLogger, deauthorizeCloud, getCloudAuth, getCloudUrl } from "@utils/cloud";
import { Margins } from "@utils/margins";
import { deleteCloudSettings, getCloudSettings, putCloudSettings } from "@utils/settingsSync";
import { Alerts, Button, Tooltip, useState } from "@webpack/common";

function validateUrl(url: string) {
    try {
        new URL(url);
        return true;
    } catch {
        return "Invalid URL";
    }
}

async function eraseAllData() {
    const res = await fetch(new URL("/v1/", getCloudUrl()), {
        method: "DELETE",
        headers: { Authorization: await getCloudAuth() }
    });

    if (!res.ok) {
        cloudLogger.error(`Failed to erase data, API returned ${res.status}`);
        showNotification({
            title: "Cloud Integrations",
            body: `Could not erase all data (API returned ${res.status}), please contact support.`,
            color: "var(--red-360)"
        });
        return;
    }

    Settings.cloud.authenticated = false;
    await deauthorizeCloud();

    showNotification({
        title: "Cloud Integrations",
        body: "Successfully erased all data.",
        color: "var(--green-360)"
    });
}

function SettingsSyncSection() {
    const { cloud } = useSettings(["cloud.authenticated", "cloud.settingsSync"]);
    const sectionEnabled = cloud.authenticated && cloud.settingsSync;

    return (
        <section className={Margins.top16}>
            <Heading>Settings Sync</Heading>

            <Paragraph size="md" className={Margins.bottom20}>
                Synchronize your settings to the cloud. This allows easy synchronization across multiple devices with
                minimal effort.
            </Paragraph>
            <FormSwitch
                key="cloud-sync"
                title="Settings Sync"
                value={cloud.settingsSync}
                onChange={v => { cloud.settingsSync = v; }}
                disabled={!cloud.authenticated}
            />
            <div className="vc-cloud-settings-sync-grid">
                <Button
                    size={Button.Sizes.SMALL}
                    disabled={!sectionEnabled}
                    onClick={() => putCloudSettings(true)}
                >
                    Sync to Cloud
                </Button>
                <Tooltip text="This will overwrite your local settings with the ones on the cloud. Use wisely!">
                    {({ onMouseLeave, onMouseEnter }) => (
                        <Button
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.RED}
                            disabled={!sectionEnabled}
                            onClick={() => getCloudSettings(true, true)}
                        >
                            Sync from Cloud
                        </Button>
                    )}
                </Tooltip>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.RED}
                    disabled={!sectionEnabled}
                    onClick={() => deleteCloudSettings()}
                >
                    Delete Cloud Settings
                </Button>
            </div>
        </section>
    );
}

function CloudTab() {
    const settings = useSettings(["cloud.authenticated", "cloud.url"]);
    const [inputKey, setInputKey] = useState(0);

    async function changeUrl(url: string) {
        settings.cloud.url = url;
        settings.cloud.authenticated = false;

        await deauthorizeCloud();
        await authorizeCloud();

        setInputKey(prev => prev + 1);
    }

    return (
        <SettingsTab title="Equicord Cloud">
            <section className={Margins.top16}>
                <Heading>Cloud Settings</Heading>

                <Paragraph size="md" className={Margins.bottom20}>
                    Equicord comes with a cloud integration allowing settings to be synced across apps and devices.
                    <br />
                    We use our own <Link href="https://github.com/Equicord/Equicloud">Equicloud backend</Link> to provide our cloud instance with enhanced features.
                    <br />
                    Our <Link href="https://equicord.org/cloud/policy">privacy policy</Link> allows you to see what information we store, how we use it, and data retention.
                    <br />
                    Equicloud is BSD 3.0 licensed so you can host it yourself if you would like.
                    <br />
                    You can swap between Equicord and Vencord's different cloud instances below if needed.
                </Paragraph>
                <FormSwitch
                    key="backend"
                    title="Enable Cloud Integrations"
                    description="This will request authorization if you have not yet set up cloud integrations."
                    value={settings.cloud.authenticated}
                    onChange={v => {
                        if (v)
                            authorizeCloud();
                        else
                            settings.cloud.authenticated = v;
                    }}
                />
                <Heading>Backend URL</Heading>
                <Paragraph className={Margins.bottom8}>
                    Which backend to use when using cloud integrations.
                </Paragraph>
                <CheckedTextInput
                    key={`backendUrl-${inputKey}`}
                    value={settings.cloud.url}
                    onChange={async v => {
                        settings.cloud.url = v;
                        settings.cloud.authenticated = false;
                        await deauthorizeCloud();
                    }}
                    validate={validateUrl}
                />

                <Grid columns={2} gap="1em" className={Margins.top8}>
                    <Button
                        size={Button.Sizes.MEDIUM}
                        disabled={!settings.cloud.authenticated}
                        onClick={async () => {
                            settings.cloud.authenticated = false;
                            await deauthorizeCloud();
                            await authorizeCloud();
                        }}
                    >
                        Reauthorize
                    </Button>
                    <Button
                        size={Button.Sizes.MEDIUM}
                        color={Button.Colors.RED}
                        disabled={!settings.cloud.authenticated}
                        onClick={() => Alerts.show({
                            title: "Are you sure?",
                            body: "Once your data is erased, we cannot recover it. There's no going back!",
                            onConfirm: eraseAllData,
                            confirmText: "Erase it!",
                            confirmColor: "vc-cloud-erase-data-danger-btn",
                            cancelText: "Nevermind"
                        })}
                    >
                        Erase All Data
                    </Button>
                    <Button size={Button.Sizes.MEDIUM} onClick={() => changeUrl("https://cloud.equicord.org/")}>
                        Use Equicord's Cloud
                    </Button>
                    <Button size={Button.Sizes.MEDIUM} onClick={() => changeUrl("https://api.vencord.dev/")}>
                        Use Vencord's Cloud
                    </Button>
                </Grid>

                <Divider className={Margins.top16} />
            </section >
            <SettingsSyncSection />
        </SettingsTab>
    );
}

export default wrapTab(CloudTab, "Cloud");
