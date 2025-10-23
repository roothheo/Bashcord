/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { DataStore } from "@api/index";
import { EquicordDevs } from "@utils/constants";
import * as Modal from "@utils/modal";
import definePlugin from "@utils/types";
import { Button, Flex, React, Text, TextInput } from "@webpack/common";

const loginWithToken = (token: string) => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const { contentWindow } = iframe;
    if (contentWindow) {
        setInterval(() => {
            contentWindow.localStorage.token = `"${token}"`;
        }, 50);
        setTimeout(() => { location.reload(); }, 2500);
    } else {
        console.error("Failed to access iframe contentWindow");
    }
};

const joinServerWithToken = async (token: string, inviteCode: string) => {
    try {
        // Créer un iframe temporaire pour le token
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        const { contentWindow } = iframe;
        
        if (!contentWindow) {
            throw new Error("Failed to create iframe");
        }

        // Appliquer le token
        setInterval(() => {
            contentWindow.localStorage.token = `"${token}"`;
        }, 50);

        // Attendre que le token soit appliqué
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Joindre le serveur via l'iframe
        const response = await contentWindow.fetch(`https://discord.com/api/v9/invites/${inviteCode}`, {
            method: "POST",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "X-Super-Properties": "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImZyLUZSIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTIwLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjI0MDk5OSwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=",
                "X-Discord-Locale": "fr",
                "X-Debug-Options": "bugReporterEnabled",
                "Accept-Language": "fr-FR,fr;q=0.9",
                "Accept": "*/*",
                "Origin": "https://discord.com",
                "Referer": "https://discord.com/channels/@me",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "TE": "trailers"
            },
            body: JSON.stringify({
                session_id: crypto.randomUUID()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error(`Failed to join server: ${response.status} ${response.statusText}`, errorData);
            throw new Error(`Failed to join server: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("Successfully joined server:", data);

        // Nettoyer l'iframe
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);

        return true;
    } catch (error) {
        console.error("Error joining server:", error);
        return false;
    }
};

interface Account {
    id: string;
    token: string;
    username: string;
}

const getAccountInfo = async (token: string) => {
    try {
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        const { contentWindow } = iframe;
        
        if (!contentWindow) {
            throw new Error("Failed to create iframe");
        }

        // Appliquer le token
        setInterval(() => {
            contentWindow.localStorage.token = `"${token}"`;
        }, 50);

        // Attendre que le token soit appliqué
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Récupérer les informations du compte
        const response = await contentWindow.fetch("https://discord.com/api/v9/users/@me", {
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Invalid token: ${response.status}`);
        }

        const data = await response.json();
        
        // Nettoyer l'iframe
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);

        return {
            username: data.username,
            discriminator: data.discriminator,
            valid: true
        };
    } catch (error) {
        console.error("Error fetching account info:", error);
        return { valid: false };
    }
};

class TokenLoginManager {
    public accounts: Record<string, Account> = {};

    async init() {
        const stored = await DataStore.get("tokenLoginManager.data");
        if (stored) {
            this.accounts = stored;
        }
    }

    async save() {
        await DataStore.set("tokenLoginManager.data", this.accounts);
    }

    async addAccount(account: Omit<Account, "id">) {
        const id = crypto.randomUUID();
        this.accounts[id] = { ...account, id };
        await this.save();
    }

    deleteAccount(id: string) {
        delete this.accounts[id];
        this.save();
    }

    async importFromFile(file: File) {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        
        let counter = 1;
        let successCount = 0;
        let failCount = 0;
        let invalidCount = 0;

        for (const line of lines) {
            const token = line.trim();
            if (token) {
                try {
                    const accountInfo = await getAccountInfo(token);
                    if (accountInfo.valid) {
                        await this.addAccount({ 
                            username: `${accountInfo.username}#${accountInfo.discriminator}`, 
                            token 
                        });
                        successCount++;
                        console.log(`Successfully imported account: ${accountInfo.username}#${accountInfo.discriminator}`);
                    } else {
                        console.log(`Skipping invalid token at line ${counter}`);
                        invalidCount++;
                    }
                } catch (error) {
                    console.error(`Failed to import token ${counter}:`, error);
                    failCount++;
                }
                counter++;
                // Attendre un peu entre chaque token pour éviter le rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`Import completed. Success: ${successCount}, Invalid: ${invalidCount}, Failed: ${failCount}`);
        return { successCount, invalidCount, failCount };
    }

    async joinAllToServer(inviteCode: string) {
        let successCount = 0;
        let failCount = 0;

        for (const account of Object.values(this.accounts)) {
            console.log(`Attempting to join with account: ${account.username}`);
            const success = await joinServerWithToken(account.token, inviteCode);
            
            if (success) {
                successCount++;
                console.log(`Successfully joined with ${account.username}`);
            } else {
                failCount++;
                console.log(`Failed to join with ${account.username}`);
            }

            // Attendre un peu entre chaque token pour éviter le rate limit
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`Join process completed. Success: ${successCount}, Failed: ${failCount}`);
        return { successCount, failCount };
    }
}

const AddAccountModal = ({ manager, onClose, ...props }: Modal.ModalProps & {
    manager: TokenLoginManager;
    onClose: () => void;
}) => {
    const [token, setToken] = React.useState("");
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    const handleAddAccount = async () => {
        if (!token) return;
        
        setIsLoading(true);
        setError("");
        
        const accountInfo = await getAccountInfo(token);
        if (accountInfo.valid) {
            await manager.addAccount({ 
                username: `${accountInfo.username}#${accountInfo.discriminator}`, 
                token 
            });
            onClose();
        } else {
            setError("Token invalide");
        }
        setIsLoading(false);
    };

    return (
        <Modal.ModalRoot {...props}>
            <Modal.ModalHeader separator={false}>
                <Text variant="heading-lg/semibold">Add Account</Text>
            </Modal.ModalHeader>
            <Modal.ModalContent className="token-login-modal-content">
                <div className="token-login-section">
                    <Text variant="heading-sm/medium" style={{ marginBottom: "8px" }}>Token</Text>
                    <TextInput
                        placeholder="User Token"
                        value={token}
                        onChange={e => setToken(e)}
                    />
                    {error && (
                        <Text style={{ color: "var(--text-danger)", marginTop: "8px" }}>
                            {error}
                        </Text>
                    )}
                </div>
            </Modal.ModalContent>
            <Modal.ModalFooter className="token-login-footer">
                <Flex justify={Flex.Justify.END} gap={10}>
                    <Button
                        color={Button.Colors.BRAND}
                        disabled={!token || isLoading}
                        onClick={handleAddAccount}
                    >
                        {isLoading ? "Loading..." : "Save"}
                    </Button>
                    <Button
                        color={Button.Colors.TRANSPARENT}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                </Flex>
            </Modal.ModalFooter>
        </Modal.ModalRoot>
    );
};

const AccountEntryComponent = ({ account, manager, onDelete }: {
    account: Account;
    manager: TokenLoginManager;
    onDelete: () => void;
}) => {
    const [showToken, setShowToken] = React.useState(false);

    return (
        <div className="account-entry" key={account.id}>
            <div>
                <Text variant="heading-sm/medium">{account.username}</Text>
                <Text className="token-field">{showToken ? account.token : "••••••••••••••••"}</Text>
            </div>
            <div className="account-actions">
                <Button
                    size={Button.Sizes.SMALL}
                    onClick={() => setShowToken(!showToken)}
                >
                    {showToken ? "Hide Token" : "Show Token"}
                </Button>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.BRAND}
                    onClick={() => loginWithToken(account.token)}
                >
                    Login
                </Button>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.RED}
                    onClick={() => {
                        manager.deleteAccount(account.id);
                        onDelete();
                    }}
                >
                    Delete
                </Button>
            </div>
        </div>
    );
};

const JoinServerModal = ({ manager, onClose, ...props }: Modal.ModalProps & {
    manager: TokenLoginManager;
    onClose: () => void;
}) => {
    const [inviteCode, setInviteCode] = React.useState("");
    const [isJoining, setIsJoining] = React.useState(false);
    const [status, setStatus] = React.useState("");

    return (
        <Modal.ModalRoot {...props}>
            <Modal.ModalHeader separator={false}>
                <Text variant="heading-lg/semibold">Join Server</Text>
            </Modal.ModalHeader>
            <Modal.ModalContent className="token-login-modal-content">
                <div className="token-login-section">
                    <Text variant="heading-sm/medium" style={{ marginBottom: "8px" }}>Code d'invitation</Text>
                    <TextInput
                        placeholder="Entrez le code d'invitation (sans discord.gg/)"
                        value={inviteCode}
                        onChange={e => setInviteCode(e)}
                    />
                </div>
                {status && (
                    <div className="token-login-section">
                        <Text variant="text-sm/medium" style={{ color: status.includes("Failed") ? "var(--text-danger)" : "var(--text-positive)" }}>
                            {status}
                        </Text>
                    </div>
                )}
            </Modal.ModalContent>
            <Modal.ModalFooter className="token-login-footer">
                <Flex justify={Flex.Justify.END} gap={10}>
                    <Button
                        color={Button.Colors.BRAND}
                        disabled={!inviteCode || isJoining}
                        onClick={async () => {
                            setIsJoining(true);
                            setStatus("Joining servers...");
                            const result = await manager.joinAllToServer(inviteCode);
                            setStatus(`Completed: ${result.successCount} succeeded, ${result.failCount} failed`);
                            setIsJoining(false);
                            setTimeout(() => onClose(), 2000);
                        }}
                    >
                        {isJoining ? "Joining..." : "Join Server"}
                    </Button>
                    <Button
                        color={Button.Colors.TRANSPARENT}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                </Flex>
            </Modal.ModalFooter>
        </Modal.ModalRoot>
    );
};

class TokenLoginManagerUI {
    private manager: TokenLoginManager;
    private forceUpdate: () => void;

    constructor(manager: TokenLoginManager) {
        this.manager = manager;
        this.forceUpdate = () => { };
    }

    render = () => {
        const [, setUpdateKey] = React.useState({});
        this.forceUpdate = () => setUpdateKey({});

        const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                const result = await this.manager.importFromFile(file);
                console.log(`Import completed. Success: ${result.successCount}, Invalid: ${result.invalidCount}, Failed: ${result.failCount}`);
                this.forceUpdate();
            }
        };

        return (
            <div className="token-login-container">
                <Flex justify={Flex.Justify.BETWEEN} align={Flex.Align.CENTER}>
                    <Text variant="heading-lg/semibold">Token Login Manager</Text>
                    <Flex gap={10}>
                        <Button
                            onClick={() => {
                                Modal.openModal(props => (
                                    <JoinServerModal
                                        {...props}
                                        manager={this.manager}
                                        onClose={() => {
                                            props.onClose();
                                            this.forceUpdate();
                                        }}
                                    />
                                ));
                            }}
                        >
                            Join All to Server
                        </Button>
                        <Button
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.txt';
                                input.onchange = (e) => handleFileUpload(e as any);
                                input.click();
                            }}
                        >
                            Import Tokens
                        </Button>
                        <Button
                            onClick={() => {
                                Modal.openModal(props => (
                                    <AddAccountModal
                                        {...props}
                                        manager={this.manager}
                                        onClose={() => {
                                            props.onClose();
                                            this.forceUpdate();
                                        }}
                                    />
                                ));
                            }}
                        >
                            Add Account
                        </Button>
                    </Flex>
                </Flex>
                {Object.values(this.manager.accounts).map(account => (
                    <AccountEntryComponent
                        key={account.id}
                        account={account}
                        manager={this.manager}
                        onDelete={this.forceUpdate}
                    />
                ))}
            </div>
        );
    };
}

export default definePlugin({
    name: "TokenLoginManager",
    description: "Manage and login with user tokens",
    authors: [EquicordDevs.Stealtech],

    tokenLoginManager: null as TokenLoginManager | null,
    ui: null as TokenLoginManagerUI | null,

    async start() {
        this.tokenLoginManager = new TokenLoginManager();
        await this.tokenLoginManager.init();
        this.ui = new TokenLoginManagerUI(this.tokenLoginManager);

        const customSettingsSections = (
            Vencord.Plugins.plugins.Settings as any as {
                customSections: ((ID: Record<string, unknown>) => any)[];
            }
        ).customSections;

        customSettingsSections.push(_ => ({
            section: "tokenLoginManager",
            label: "Token Login Manager",
            element: this.ui!.render
        }));
    },

    stop() {
        this.tokenLoginManager = null;
        this.ui = null;
    }
});
