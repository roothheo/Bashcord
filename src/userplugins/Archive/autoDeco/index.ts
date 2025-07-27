import definePlugin, { OptionType } from "@utils/types";
import { NavContextMenuPatchCallback, addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Menu, React } from "@webpack/common";
import { Channel, User } from "discord-types/general";

const VoiceActions = findByPropsLazy("leaveChannel");
const VoiceStateStore = findStoreLazy("VoiceStateStore");
const UserStore = findStoreLazy("UserStore");
const SelectedChannelStore = findStoreLazy("SelectedChannelStore");

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Activer AutoDeco"
    }
});

let targetUserId: string | null = null;

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: User; }) => {
    const currentUser = UserStore.getCurrentUser();
    if (!user || user.id === currentUser.id) return;
    const [checked, setChecked] = React.useState(targetUserId === user.id);
    children.push(
        React.createElement(Menu.MenuSeparator, {}),
        React.createElement(Menu.MenuCheckboxItem, {
            id: "autodeco-context",
            label: checked ? "Désactiver AutoDeco" : "Activer AutoDeco",
            checked,
            action: () => {
                if (checked) {
                    targetUserId = null;
                    setChecked(false);
                    showNotification({ title: "AutoDeco", body: `AutoDeco désactivé pour ${user.username}` });
                } else {
                    targetUserId = user.id;
                    setChecked(true);
                    showNotification({ title: "AutoDeco", body: `AutoDeco activé pour ${user.username}` });
                }
            }
        })
    );
};

export default definePlugin({
    name: "AutoDeco",
    description: "Se déconnecte automatiquement du canal vocal lorsqu'un utilisateur spécifique rejoint",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,
    contextMenus: {
        "user-context": UserContextMenuPatch
    },
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }) {
            if (!targetUserId || !settings.store.enabled) return;
            const currentUserId = UserStore.getCurrentUser().id;
            const currentChannelId = SelectedChannelStore.getVoiceChannelId();
            for (const state of voiceStates) {
                if (
                    state.userId === targetUserId &&
                    state.channelId &&
                    currentChannelId
                ) {
                    // L'utilisateur cible vient de rejoindre un vocal
                    if (VoiceActions && typeof VoiceActions.leaveChannel === "function") {
                        VoiceActions.leaveChannel();
                    }
                    showNotification({
                        title: "AutoDeco",
                        body: `Déconnexion automatique : ${state.user?.username || "Utilisateur"} a rejoint un canal vocal`
                    });
                }
            }
        }
    },
    start() { },
    stop() {
        targetUserId = null;
    }
});
