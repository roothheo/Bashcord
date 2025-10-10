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

import { LazyComponent, LazyComponentWrapper } from "@utils/react";
import { FilterFn, filters, lazyWebpackSearchHistory, waitFor } from "@webpack";
import { React } from "@webpack/common";

export function waitForComponent<T extends React.ComponentType<any> = React.ComponentType<any> & Record<string, any>>(name: string, filter: FilterFn | string | string[]) {
    if (IS_REPORTER) lazyWebpackSearchHistory.push(["waitForComponent", Array.isArray(filter) ? filter : [filter]]);

    let myValue: T = function () {
        throw new Error(`Vencord could not find the ${name} Component`);
    } as any;

    const lazyComponent = LazyComponent(() => myValue) as LazyComponentWrapper<T>;

    // Essayer de trouver le composant avec un timeout
    let found = false;
    const timeout = setTimeout(() => {
        if (!found) {
            console.warn(`Component ${name} not found within timeout, using fallback`);
            // Créer un composant de fallback simple
            myValue = function (props: any) {
                return React.createElement("div", {
                    className: `fallback-${name.toLowerCase()}`,
                    style: {
                        marginBottom: "10px",
                        padding: "8px",
                        backgroundColor: "var(--background-secondary, #2f3136)",
                        borderRadius: "4px",
                        border: "1px solid var(--background-tertiary, #202225)"
                    },
                    ...props
                });
            } as any;
            Object.assign(lazyComponent, myValue);
        }
    }, 5000); // 5 secondes de timeout

    waitFor(filter, (v: any) => {
        found = true;
        clearTimeout(timeout);
        myValue = v;
        Object.assign(lazyComponent, v);
    }, { isIndirect: true });

    return lazyComponent;
}

export function waitForStore(name: string, cb: (v: any) => void) {
    if (IS_REPORTER) lazyWebpackSearchHistory.push(["waitForStore", [name]]);

    waitFor(filters.byStoreName(name), cb, { isIndirect: true });
}
