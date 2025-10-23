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

import "./AddonCard.css";

import { classNameFactory } from "@api/Styles";
import { BaseText } from "@components/BaseText";
import { Switch } from "@components/settings";
import { AddonBadge } from "@components/settings/PluginBadge";
import { useRef } from "@webpack/common";
import type { MouseEventHandler, ReactNode } from "react";

import { EditableText } from "./EditableText";
import { useTruncatedText } from "./tabs/plugins/components/truncateText";

const cl = classNameFactory("vc-addon-");

interface Props {
    name: ReactNode;
    description: ReactNode;
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
    disabled?: boolean;
    isNew?: boolean;
    onMouseEnter?: MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: MouseEventHandler<HTMLDivElement>;

    infoButton?: ReactNode;
    footer?: ReactNode;
    author?: ReactNode;

    customName?: string;
    customDescription?: string;
    onEditName?: (newName: string) => void;
    onEditDescription?: (newDescription: string) => void;
}

export function OnlineThemeCard({
    disabled,
    isNew,
    name,
    infoButton,
    footer,
    author,
    enabled,
    setEnabled,
    description,
    onMouseEnter,
    onMouseLeave,
    customName,
    onEditName,
}: Props) {
    const titleRef = useRef<HTMLDivElement>(null);
    const titleContainerRef = useRef<HTMLDivElement>(null);
    const { truncated, containerRef } = useTruncatedText(description ? description.toString() : "");

    return (
        <div
            className={cl("card", { "card-disabled": disabled })}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className={cl("header")}>
                <div className={cl("name-author")}>
                    <BaseText size="md" weight="bold" className={cl("name")}>
                        <div ref={titleContainerRef} className={cl("title-container")}>
                            <div
                                ref={titleRef}
                                className={cl("title")}
                                onMouseOver={() => {
                                    const title = titleRef.current!;
                                    const titleContainer = titleContainerRef.current!;

                                    title.style.setProperty("--offset", `${titleContainer.clientWidth - title.scrollWidth}px`);
                                    title.style.setProperty("--duration", `${Math.max(0.5, (title.scrollWidth - titleContainer.clientWidth) / 7)}s`);
                                }}
                            >
                                {onEditName ? (
                                    <EditableText
                                        value={customName || (name ? name.toString() : "")}
                                        onChange={onEditName}
                                        className={cl("editable")}
                                    />
                                ) : (
                                    customName || name
                                )}
                            </div>
                        </div>
                        {isNew && <AddonBadge text="NEW" color="#ED4245" />}
                    </BaseText>

                    {!!author && (
                        <BaseText size="md" className={cl("author")}>
                            {author}
                        </BaseText>
                    )}
                </div>

                {infoButton}

                <Switch
                    checked={enabled}
                    onChange={setEnabled}
                    disabled={disabled}
                />
            </div>

            <div
                ref={containerRef}
                className={cl("note")}
                style={{ lineHeight: "1.25em", fontSize: "small" }}
                title={description ? description.toString() : ""}
            >
                {truncated}
            </div>

            {footer}
        </div>
    );
}
