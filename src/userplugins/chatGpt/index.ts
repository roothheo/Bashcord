import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { OpenAI } from "openai";
import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";

// Déclaration des paramètres du plugin
const settings = definePluginSettings({
    openaiApiKey: {
        type: OptionType.STRING,
        default: "",
        description: "Entrez votre clé API OpenAI ici."
    }
});

let isInitialized = false;

export default definePlugin({
    name: "ChatGPT",
    description: "Permet d'utiliser ChatGPT directement dans Discord",
    authors: [{
        name: "Bash",
        id: 1327483363518582784n
    }],
    dependencies: ["CommandsAPI"],
    settings,
    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "chatgpt",
            description: "Posez une question à ChatGPT",
            options: [
                {
                    name: "question",
                    description: "Votre question pour ChatGPT",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute: async (opts, ctx) => {
                try {
                    const apiKey = settings.store.openaiApiKey;
                    if (!apiKey) {
                        throw "La clé API OpenAI n'est pas configurée. Veuillez la renseigner dans les paramètres du plugin.";
                    }
                    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
                    const question = opts.find(opt => opt.name === "question")?.value;

                    if (!question) throw "Aucune question fournie !";

                    const response = await client.chat.completions.create({
                        model: "gpt-3.5-turbo",
                        messages: [
                            {
                                role: "user",
                                content: question
                            }
                        ]
                    });

                    const answer = response.choices[0].message.content ?? "";

                    sendBotMessage(ctx.channel.id, {
                        content: answer
                    });
                } catch (error) {
                    console.error("[ChatGPT] Erreur lors de l'exécution de la commande:", error);
                    sendBotMessage(ctx.channel.id, {
                        content: typeof error === "string" ? error : "Une erreur s'est produite lors de la communication avec ChatGPT."
                    });
                }
            }
        }
    ],
    start() {
        if (isInitialized) {
            console.log("[ChatGPT] Le plugin est déjà initialisé");
            return;
        }

        try {
            console.log("[ChatGPT] Initialisation du plugin...");

            if (!settings.store.openaiApiKey) {
                throw new Error("La clé API OpenAI n'est pas configurée. Veuillez la renseigner dans les paramètres du plugin.");
            }

            isInitialized = true;
            console.log("[ChatGPT] Plugin initialisé avec succès");
        } catch (error) {
            console.error("[ChatGPT] Erreur lors de l'initialisation du plugin:", error);
            isInitialized = false;
            throw error;
        }
    },
    stop() {
        console.log("[ChatGPT] Arrêt du plugin...");
        isInitialized = false;
    }
});
