/*
 * Bashcord Welcome Modal
 * Copyright (c) 2024 Bashcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { openModal, closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { Button, Flex, React } from "@webpack/common";

// Composant de la modale de bienvenue
export function WelcomeModal({ modalProps }: { modalProps: ModalProps; }) {
    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <BaseText size="lg" weight="semibold" style={{ flexGrow: 1 }}>
                    🎉 Bienvenue sur Bashcord !
                </BaseText>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <BaseText size="md" style={{ marginBottom: "16px" }}>
                    Merci d'avoir choisi Bashcord ! Nous sommes ravis de vous accueillir dans notre communauté.
                </BaseText>
                <BaseText size="md" style={{ marginBottom: "16px" }}>
                    Rejoignez notre serveur Discord pour :
                </BaseText>
                <ul style={{ marginLeft: "20px", marginBottom: "16px" }}>
                    <li>Obtenir de l'aide et du support</li>
                    <li>Recevoir les dernières mises à jour</li>
                    <li>Partager vos créations et plugins</li>
                    <li>Discuter avec la communauté</li>
                </ul>
                <BaseText size="sm" style={{ color: "var(--text-muted)" }}>
                    Cliquez sur "Rejoindre le serveur" pour nous rejoindre !
                </BaseText>
            </ModalContent>
            <ModalFooter>
                <Flex direction={Flex.Direction.HORIZONTAL_REVERSE}>
                    <Button
                        onClick={() => {
                            window.open("https://discord.gg/GxbcPKKCnS", "_blank");
                            modalProps.onClose();
                        }}
                        color={Button.Colors.BRAND}
                    >
                        Rejoindre le serveur
                    </Button>
                    <Button
                        onClick={modalProps.onClose}
                        color={Button.Colors.PRIMARY}
                        look={Button.Looks.OUTLINED}
                    >
                        Plus tard
                    </Button>
                </Flex>
            </ModalFooter>
        </ModalRoot>
    );
}

// Fonction pour ouvrir la modale de bienvenue
export function openWelcomeModal() {
    console.log("🎉 Bashcord: openWelcomeModal called");
    try {
        const modalKey = openModal(modalProps => (
            <WelcomeModal modalProps={modalProps} />
        ));
        console.log("🎉 Bashcord: Modal opened with key:", modalKey);
    } catch (error) {
        console.error("🎉 Bashcord: Error opening welcome modal:", error);
    }
}
