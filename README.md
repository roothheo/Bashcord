# [<img src="./browser/icon.png" width="40" align="left" alt="Bashcord">](https://github.com/Bashcord/Bashcord) Bashcord

[![Bashcord](https://img.shields.io/badge/Bashcord-blue?style=flat)](https://github.com/Bashcord/Bashcord)
[![Tests](https://github.com/Bashcord/Bashcord/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/Bashcord/Bashcord/actions/workflows/test.yml)
[![Discord](https://img.shields.io/discord/1173279886065029291.svg?color=768AD4&label=Discord&logo=discord&logoColor=white)](https://discord.gg/bashcord)

Bashcord est un fork personnalisé d'[Equicord](https://github.com/Equicord/Equicord) (lui-même basé sur [Vencord](https://github.com/Vendicated/Vencord)), avec des plugins exclusifs et une interface personnalisée.

## 🎯 À propos de Bashcord

Bashcord est une modification Discord qui combine la puissance d'Equicord avec des fonctionnalités exclusives et une expérience utilisateur personnalisée. Notre objectif est de fournir une expérience Discord améliorée avec des plugins uniques et une interface moderne.

### ✨ Fonctionnalités exclusives

- **🎤 Messages vocaux directs** - Bouton microphone intégré dans la barre de chat
- **🎵 Soundboard Pro** - Table de mixage audio avancée avec sons personnalisés
- **🔧 Plugins Bashcord** - Collection exclusive de plugins dans `src/bashplugins/`
- **🎨 Interface personnalisée** - Branding et thème Bashcord
- **🔄 Synchronisation automatique** - Mise à jour automatique avec Equicord

### 📦 Plugins inclus

Bashcord inclut tous les plugins d'Equicord plus nos plugins exclusifs :

#### Plugins Bashcord exclusifs
- **SoundboardPro** - Table de mixage audio professionnelle
- **VoiceMessageSender** - Envoi de messages vocaux depuis la barre de chat
- **AutoDeco** - Déconnexion automatique
- **AntiGroup** - Protection contre les groupes indésirables
- **MessageCleaner** - Nettoyage automatique des messages
- **Token Display** - Affichage sécurisé du token
- **BypassUpload** - Contournement des limites d'upload
- Et bien d'autres...

## 🚀 Installation

### Installation rapide

**Windows**
```bash
# Télécharger et exécuter l'installateur
curl -L https://github.com/Bashcord/Bashcord/releases/latest/download/bashcord-installer.exe -o bashcord-installer.exe
./bashcord-installer.exe
```

**Linux/macOS**
```bash
# Script d'installation automatique
curl -sS https://raw.githubusercontent.com/Bashcord/Bashcord/main/misc/install.sh | bash
```

### Installation manuelle

1. **Cloner le repository**
```bash
git clone https://github.com/Bashcord/Bashcord.git
cd Bashcord
```

2. **Installer les dépendances**
```bash
# Installer pnpm si ce n'est pas déjà fait
npm install -g pnpm

# Installer les dépendances
pnpm install --frozen-lockfile
```

3. **Compiler Bashcord**
```bash
pnpm build
```

4. **Injecter dans Discord**
```bash
pnpm inject
```

## 🛠️ Développement

### Prérequis
- [Node.js LTS](https://nodejs.org/) (v18 ou plus récent)
- [pnpm](https://pnpm.io/) (gestionnaire de paquets)
- [Git](https://git-scm.com/)

### Commandes de développement

```bash
# Mode développement avec rechargement automatique
pnpm dev

# Compilation de production
pnpm build

# Tests
pnpm test

# Linting
pnpm lint

# Injection dans Discord
pnpm inject
```

### Structure du projet

```
Bashcord/
├── src/
│   ├── bashplugins/          # Plugins exclusifs Bashcord
│   ├── equicordplugins/      # Plugins Equicord
│   ├── plugins/              # Plugins Vencord
│   ├── components/           # Composants UI personnalisés
│   └── Vencord.ts           # Point d'entrée principal
├── scripts/                  # Scripts de build et utilitaires
├── browser/                  # Version navigateur
└── dist/                     # Fichiers compilés
```

## 🎨 Personnalisation

### Plugins personnalisés

Les plugins Bashcord sont situés dans `src/bashplugins/`. Chaque plugin suit la structure standard :

```typescript
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    // Configuration du plugin
});

export default definePlugin({
    name: "MonPlugin",
    description: "Description du plugin",
    authors: [{ name: "Bashcord", id: 1234567890123456789n }],
    settings,
    // ... reste de la configuration
});
```

### Thème et branding

Le branding Bashcord est géré dans :
- `src/components/WelcomeModal.tsx` - Modal de bienvenue
- `src/plugins/_core/settings.tsx` - Interface des paramètres
- `src/Vencord.ts` - Initialisation et popup de bienvenue

## 🔄 Mise à jour automatique

Bashcord se synchronise automatiquement avec les mises à jour d'Equicord tout en préservant :
- Les plugins exclusifs dans `src/bashplugins/`
- Le branding et l'interface personnalisée
- Les workflows CI/CD personnalisés

## 🤝 Contribution

Nous accueillons les contributions ! Voici comment contribuer :

1. **Fork** le repository
2. **Créer** une branche pour votre fonctionnalité (`git checkout -b feature/AmazingFeature`)
3. **Commit** vos changements (`git commit -m 'Add some AmazingFeature'`)
4. **Push** vers la branche (`git push origin feature/AmazingFeature`)
5. **Ouvrir** une Pull Request

### Guidelines de contribution

- Suivez les conventions de code existantes
- Ajoutez des tests pour les nouvelles fonctionnalités
- Documentez les nouvelles APIs
- Respectez la licence GPL-3.0

## 📄 Licence

Ce projet est sous licence GPL-3.0-or-later. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 🙏 Remerciements

- **[Vendicated](https://github.com/Vendicated)** - Créateur de [Vencord](https://github.com/Vendicated/Vencord)
- **[Equicord](https://github.com/Equicord)** - Fork de Vencord avec des plugins supplémentaires
- **[Suncord](https://github.com/verticalsync/Suncord)** - Inspiration et aide

## ⚠️ Avertissement

L'utilisation de Bashcord viole les conditions d'utilisation de Discord.

Les modifications de client sont contre les Conditions d'Utilisation de Discord. Cependant, Discord est assez indifférent à leur égard et il n'y a aucun cas connu d'utilisateurs bannis pour avoir utilisé des mods de client ! Vous devriez généralement être en sécurité si vous n'utilisez pas de plugins qui implémentent un comportement abusif. Mais ne vous inquiétez pas, tous les plugins intégrés sont sûrs à utiliser !

Quoi qu'il en soit, si votre compte vous est essentiel et que le désactiver serait un désastre pour vous, vous ne devriez probablement pas utiliser de mods de client (pas exclusif à Bashcord), juste pour être en sécurité.

De plus, assurez-vous de ne pas publier de captures d'écran avec Bashcord dans un serveur où vous pourriez être banni pour cela.

## 📞 Support

- **Discord** : [Rejoignez notre serveur](https://discord.gg/bashcord)
- **Issues** : [GitHub Issues](https://github.com/Bashcord/Bashcord/issues)
- **Documentation** : [Wiki du projet](https://github.com/Bashcord/Bashcord/wiki)

---

<div align="center">
  <strong>Fait avec ❤️ par l'équipe Bashcord</strong>
</div>