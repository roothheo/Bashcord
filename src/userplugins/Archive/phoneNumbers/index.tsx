/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { ApplicationCommandInputType } from "@api/Commands/types";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

// Import Google's official libphonenumber library
import { PhoneNumberUtil, PhoneNumberFormat, PhoneNumberType } from "google-libphonenumber";

// Instance unique du PhoneNumberUtil
const phoneUtil = PhoneNumberUtil.getInstance();

function identifyOperator(phoneNumber: string): string {
    try {
        // Parse du numéro avec la bibliothèque officielle Google
        const parsedNumber = phoneUtil.parse(phoneNumber, "FR");

        // Vérification de la validité
        if (!phoneUtil.isValidNumber(parsedNumber)) {
            return "❌ Numéro invalide selon les standards internationaux";
        }

        // Vérification si c'est un numéro français
        const region = phoneUtil.getRegionCodeForNumber(parsedNumber);
        if (region !== "FR") {
            return `📍 Numéro non français (région: ${region || "inconnue"})`;
        }

        // Obtention du type de numéro
        const numberType = phoneUtil.getNumberType(parsedNumber);

        if (numberType !== PhoneNumberType.MOBILE) {
            switch (numberType) {
                case PhoneNumberType.FIXED_LINE:
                    return "📞 Numéro fixe - Opérateur non déterminable";
                case PhoneNumberType.TOLL_FREE:
                    return "🆓 Numéro gratuit";
                case PhoneNumberType.PREMIUM_RATE:
                    return "💰 Numéro surtaxé";
                case PhoneNumberType.SHARED_COST:
                    return "💸 Numéro à coût partagé";
                case PhoneNumberType.VOIP:
                    return "🌐 Numéro VoIP";
                case PhoneNumberType.PERSONAL_NUMBER:
                    return "👤 Numéro personnel";
                case PhoneNumberType.PAGER:
                    return "📟 Numéro de pager";
                case PhoneNumberType.UAN:
                    return "📋 Numéro UAN (Unified Access Number)";
                case PhoneNumberType.VOICEMAIL:
                    return "📧 Numéro de messagerie vocale";
                default:
                    return `📋 Type: ${PhoneNumberType[numberType] || "inconnu"}`;
            }
        }

        // Pour les mobiles français, utiliser les plages connues
        const nationalNumber = parsedNumber.getNationalNumber().toString();

        // Debug: afficher le numéro national pour diagnostiquer
        console.log(`Numéro national: ${nationalNumber}`);

        if (nationalNumber.length >= 2) {
            // Prendre les 2 premiers chiffres du numéro national
            const twoDigitPrefix = nationalNumber.substring(0, 2);
            return getOperatorByPrefix(twoDigitPrefix);
        }

        return "📱 Opérateur mobile non identifié";

    } catch (error) {
        return `❌ Erreur de parsing: ${error instanceof Error ? error.message : "Erreur inconnue"}`;
    }
}

function getOperatorByPrefix(prefix: string): string {
    // Normaliser le préfixe pour gérer les formats avec ou sans le 0 initial
    let normalizedPrefix = prefix;

    // Si le préfixe ne commence pas par 0, on l'ajoute pour la comparaison
    if (!prefix.startsWith('0') && prefix.length === 2) {
        normalizedPrefix = '0' + prefix;
    }

    // Si le préfixe fait 3 caractères et ne commence pas par 0, on l'ajoute
    if (!prefix.startsWith('0') && prefix.length === 3) {
        normalizedPrefix = '0' + prefix.substring(0, 2);
    }

    // Extraire les 3 premiers chiffres (06X, 07X, etc.)
    const threeDigitPrefix = normalizedPrefix.substring(0, 3);

    // Orange (06X: 060-063, 07X: 070-073)
    if (['060', '061', '062', '063', '070', '071', '072', '073'].includes(threeDigitPrefix)) {
        return "📱 Orange";
    }
    // SFR (06X: 064-067, 07X: 074-077)
    else if (['064', '065', '066', '067', '074', '075', '076', '077'].includes(threeDigitPrefix)) {
        return "📱 SFR";
    }
    // Bouygues Telecom (06X: 068-069, 07X: 078-079)
    else if (['068', '069', '078', '079'].includes(threeDigitPrefix)) {
        return "📱 Bouygues Telecom";
    }
    // Free Mobile (09X: 095-098)
    else if (['095', '096', '097', '098'].includes(threeDigitPrefix)) {
        return "📱 Free Mobile";
    }
    else {
        return `📱 Opérateur mobile non identifié (préfixe: ${threeDigitPrefix})`;
    }
}

function getCarrierInfo(phoneNumber: string): string {
    try {
        const parsedNumber = phoneUtil.parse(phoneNumber, "FR");

        if (!phoneUtil.isValidNumber(parsedNumber)) {
            return "❌ Numéro invalide";
        }

        const numberType = phoneUtil.getNumberType(parsedNumber);
        const region = phoneUtil.getRegionCodeForNumber(parsedNumber);

        let info = `🌍 **Région:** ${region}\n`;
        info += `📋 **Type:** ${PhoneNumberType[numberType]}\n`;
        info += `✅ **Valide:** ${phoneUtil.isValidNumber(parsedNumber) ? "Oui" : "Non"}\n`;
        info += `💭 **Possible:** ${phoneUtil.isPossibleNumber(parsedNumber) ? "Oui" : "Non"}\n`;

        if (region === "FR" && numberType === PhoneNumberType.MOBILE) {
            const nationalNumber = parsedNumber.getNationalNumber().toString();
            if (nationalNumber.length >= 3) {
                const prefix = nationalNumber.substring(0, 3);
                const operator = getOperatorByPrefix(prefix);
                info += `🏢 **Opérateur:** ${operator.replace(/📱\s*/, "")}`;
            }
        }

        return info;
    } catch (error) {
        return `❌ Erreur: ${error instanceof Error ? error.message : "Erreur inconnue"}`;
    }
}

export default definePlugin({
    name: "PhoneNumbers",
    description: "Identifie l'opérateur d'un numéro de téléphone avec Google libphonenumber officiel",
    authors: [Devs.BigDuck],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "operator",
            description: "Identifie l'opérateur d'un numéro de téléphone français",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    type: ApplicationCommandOptionType.STRING,
                    name: "numero",
                    description: "Le numéro de téléphone à analyser (format: 06/07, +33, etc.)",
                    required: true
                }
            ],
            execute: async (args, ctx) => {
                try {
                    const phoneNumber = args[0].value;
                    const operator = identifyOperator(phoneNumber);

                    sendBotMessage(ctx.channel.id, {
                        content: `📞 **Analyse du numéro:** \`${phoneNumber}\`\n🏢 **Résultat:** ${operator}`,
                    });
                } catch (error) {
                    sendBotMessage(ctx.channel.id, {
                        content: `❌ Erreur lors de l'analyse du numéro: \`${error}\``,
                    });
                }
            }
        },
        {
            name: "operatorinfo",
            description: "Affiche des informations sur les préfixes des opérateurs français",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute: async (args, ctx) => {
                const info = `📋 **Préfixes des opérateurs mobiles français:**

🟠 **Orange:** 060-063, 070-073
🔴 **SFR:** 064-067, 074-077  
🔵 **Bouygues Telecom:** 068-069, 078-079
🟢 **Free Mobile:** 095-098

📍 **Notes:**
• Les numéros 01-05 sont des fixes (opérateur non déterminable)
• Les numéros 08 sont des numéros spéciaux
• Les numéros 09 sont non géographiques/VoIP
• Certains MVNO utilisent les plages de leurs opérateurs hôtes

🔧 **Technologie:**
• Utilise \`Google libphonenumber officiel\` pour une validation stricte
• Validation selon les standards ITU-T E.164
• Métadonnées maintenues par Google`;

                sendBotMessage(ctx.channel.id, {
                    content: info,
                });
            }
        },
        {
            name: "phonevalidate",
            description: "Valide un numéro de téléphone avec des informations détaillées (Google libphonenumber)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    type: ApplicationCommandOptionType.STRING,
                    name: "numero",
                    description: "Le numéro de téléphone à valider",
                    required: true
                },
                {
                    type: ApplicationCommandOptionType.STRING,
                    name: "pays",
                    description: "Code pays (FR par défaut)",
                    required: false
                }
            ],
            execute: async (args, ctx) => {
                try {
                    const phoneNumber = args[0].value;
                    const region = args[1]?.value || "FR";

                    let result = `📞 **Validation du numéro:** \`${phoneNumber}\`\n\n`;

                    try {
                        const parsedNumber = phoneUtil.parse(phoneNumber, region);

                        result += `✅ **Numéro parsé avec succès**\n`;
                        result += `🌍 **Région:** ${phoneUtil.getRegionCodeForNumber(parsedNumber) || "inconnue"}\n`;
                        result += `📱 **Format national:** ${phoneUtil.format(parsedNumber, PhoneNumberFormat.NATIONAL)}\n`;
                        result += `🌐 **Format international:** ${phoneUtil.format(parsedNumber, PhoneNumberFormat.INTERNATIONAL)}\n`;
                        result += `🔢 **Format E.164:** ${phoneUtil.format(parsedNumber, PhoneNumberFormat.E164)}\n`;
                        result += `📋 **Format RFC3966:** ${phoneUtil.format(parsedNumber, PhoneNumberFormat.RFC3966)}\n`;
                        result += `✔️ **Valide:** ${phoneUtil.isValidNumber(parsedNumber) ? "Oui" : "Non"}\n`;
                        result += `💭 **Possible:** ${phoneUtil.isPossibleNumber(parsedNumber) ? "Oui" : "Non"}\n`;

                        const numberType = phoneUtil.getNumberType(parsedNumber);
                        result += `📋 **Type:** ${PhoneNumberType[numberType] || "inconnu"}\n`;

                        // Si c'est français et mobile, ajouter l'opérateur
                        const numberRegion = phoneUtil.getRegionCodeForNumber(parsedNumber);
                        if (numberRegion === "FR" && numberType === PhoneNumberType.MOBILE) {
                            const operator = identifyOperator(phoneNumber);
                            result += `🏢 **Opérateur:** ${operator.replace(/📱\s*/, "")}`;
                        }

                        // Ajout des informations sur la région de portabilité si disponible
                        try {
                            const carrierInfo = getCarrierInfo(phoneNumber);
                            if (carrierInfo && !carrierInfo.startsWith("❌")) {
                                result += `\n\n📊 **Informations détaillées:**\n${carrierInfo}`;
                            }
                        } catch (e) {
                            // Ignore les erreurs de carrier info
                        }

                    } catch (parseError) {
                        result += `❌ **Erreur de parsing:** ${parseError instanceof Error ? parseError.message : "Erreur inconnue"}`;
                    }

                    sendBotMessage(ctx.channel.id, {
                        content: result,
                    });
                } catch (error) {
                    sendBotMessage(ctx.channel.id, {
                        content: `❌ Erreur lors de la validation: \`${error}\``,
                    });
                }
            }
        },
        {
            name: "phoneformat",
            description: "Formate un numéro de téléphone dans différents formats",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    type: ApplicationCommandOptionType.STRING,
                    name: "numero",
                    description: "Le numéro de téléphone à formater",
                    required: true
                },
                {
                    type: ApplicationCommandOptionType.STRING,
                    name: "pays",
                    description: "Code pays (FR par défaut)",
                    required: false
                }
            ],
            execute: async (args, ctx) => {
                try {
                    const phoneNumber = args[0].value;
                    const region = args[1]?.value || "FR";

                    try {
                        const parsedNumber = phoneUtil.parse(phoneNumber, region);

                        if (!phoneUtil.isValidNumber(parsedNumber)) {
                            sendBotMessage(ctx.channel.id, {
                                content: `❌ **Numéro invalide:** \`${phoneNumber}\`\n\nLe numéro ne respecte pas les standards internationaux.`,
                            });
                            return;
                        }

                        const result = `📞 **Formatage du numéro:** \`${phoneNumber}\`

📱 **National:** ${phoneUtil.format(parsedNumber, PhoneNumberFormat.NATIONAL)}
🌐 **International:** ${phoneUtil.format(parsedNumber, PhoneNumberFormat.INTERNATIONAL)}
🔢 **E.164:** ${phoneUtil.format(parsedNumber, PhoneNumberFormat.E164)}
📋 **RFC3966:** ${phoneUtil.format(parsedNumber, PhoneNumberFormat.RFC3966)}

🌍 **Région:** ${phoneUtil.getRegionCodeForNumber(parsedNumber) || "inconnue"}
📋 **Type:** ${PhoneNumberType[phoneUtil.getNumberType(parsedNumber)] || "inconnu"}`;

                        sendBotMessage(ctx.channel.id, {
                            content: result,
                        });

                    } catch (parseError) {
                        sendBotMessage(ctx.channel.id, {
                            content: `❌ **Erreur de parsing:** ${parseError instanceof Error ? parseError.message : "Erreur inconnue"}`,
                        });
                    }
                } catch (error) {
                    sendBotMessage(ctx.channel.id, {
                        content: `❌ Erreur lors du formatage: \`${error}\``,
                    });
                }
            }
        }
    ]
});