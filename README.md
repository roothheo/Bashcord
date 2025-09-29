# 🚀 [<img src="./browser/icon.png" width="40" align="left" alt="Bashcord">](https://github.com/Equicord/Equicord) **Bashcord** - Discord mais en mieux

[![Discord](https://img.shields.io/discord/1173279886065029291.svg?color=7289da&label=Discord&logo=discord&logoColor=white&style=for-the-badge)](https://discord.gg/5Xh2W87egW)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Equicord/Equicord/test.yml?branch=main&style=for-the-badge&logo=github)](https://github.com/Equicord/Equicord/actions/workflows/test.yml)
[![Version](https://img.shields.io/github/package-json/v/Equicord/Equicord?style=for-the-badge&color=ff6b6b)](https://github.com/Equicord/Equicord)

> **Bashcord** est un fork ultra-personnalisé d'[Equicord](https://github.com/Equicord/Equicord) avec des plugins exclusifs développés par **Bash** pour une expérience Discord révolutionnaire ! 🎯

##  **Pourquoi Bashcord ?**

- 🎨 **Interface épurée** et moderne
- ⚡ **Performance optimisée** pour les power users
- 🛠️ **Plugins exclusifs** développés spécialement par Bash
- 🔧 **Personnalisation poussée** de chaque aspect
- 🚀 **Mises à jour régulières** avec les dernières fonctionnalités

---

## 🎯 **Plugins Exclusifs Bashcord**

### 🔥 **Plugins Ultra-Avancés**

<details>
<summary><strong>🧹 MessageCleaner Ultra</strong> - Le nettoyeur de messages le plus puissant</summary>

- ⚡ **Suppression ultra-rapide** de milliers de messages
- 🎯 **Filtrage intelligent** par âge, type, propriétaire
- 🛡️ **Protection anti-rate-limit** avec délais configurables
- 📊 **Progression en temps réel** avec statistiques détaillées
- 🚨 **Système de confirmation** sans popup (double-clic)
- 🎮 **Compatible** groupes, canaux privés, serveurs

</details>

<details>
<summary><strong>👥 GroupKicker Pro</strong> - Kicker des groupes en un clic</summary>

- 👑 **Vérification automatique** des permissions de propriétaire
- ⚡ **Kick en masse** de tous les membres d'un groupe
- 🛡️ **Confirmations de sécurité** multicouches
- 📱 **Notifications visuelles** avec compteurs en temps réel
- 🚫 **Protection anti-erreur** avec logs détaillés
- ⏱️ **Délais anti-spam** configurables

</details>

<details>
<summary><strong>⌨️ Abreviation++</strong> - Expansion d'abréviations avec keybinds</summary>

- 🔤 **500+ abréviations** prêtes à l'emploi
- ⌨️ **Keybind personnalisable** pour toggle instantané
- 🎯 **Abréviations custom** définissables par l'utilisateur
- 🔍 **Mode debug** avec logs détaillés
- 📱 **Notifications** d'expansion optionnelles
- 🎨 **Respecte la casse** et la ponctuation

</details>

### 🎮 **Plugins Gaming & Fun**

- 🎵 **AudioEnhancer** - Améliore la qualité audio Discord
- 🎭 **StatusRotator** - Rotation automatique des statuts
- 🌈 **ThemeSync** - Synchronisation des thèmes avec l'OS
- 🎪 **EmojiSpam** - Spam d'emojis intelligents
- 🎲 **RandomUtils** - Générateur d'éléments aléatoires

### 🛠️ **Plugins Utilitaires**

- 📋 **ClipboardPro** - Gestionnaire de presse-papiers avancé
- 🔍 **SearchPro** - Recherche ultra-rapide dans Discord
- 📊 **StatsTracker** - Statistiques d'utilisation détaillées
- 🔗 **LinkPreview** - Aperçus de liens améliorés
- 📱 **MobileSync** - Synchronisation mobile parfaite

---

## 📦 **Installation Rapide**

### 🖥️ **Windows Passez simplement par l'installeur GUI ou CLI au choix**
```
https://github.com/roothheo/Bashcord-Installer/releases/tag/latest
```

---

## 🚀 **Installation Développeur**

### 📋 **Prérequis**
- [Node.js 18+](https://nodejs.org/) (LTS recommandé)
- [Git](https://git-scm.com/)
- [PNPM](https://pnpm.io/) (gestionnaire de paquets rapide)

### ⚡ **Installation Express**

```bash
# 1. Cloner le repo
git clone https://github.com/YourUsername/Bashcord.git
cd Bashcord

# 2. Installer les dépendances
pnpm install --no-frozen-lockfile

# 3. Build du projet
pnpm build

# 4. Injection dans Discord
pnpm inject
```

### 🔧 **Scripts Utiles**

```bash
pnpm dev          # Mode développement avec hot-reload
pnpm build:watch  # Build automatique lors des changements
pnpm lint         # Vérification du code
pnpm test         # Tests unitaires
pnpm clean        # Nettoyage du cache
```

---

## 🎨 **Configuration Avancée**

### ⚙️ **Settings.json Optimisé**

```json
{
  "bashcord": {
    "theme": "dark-pro",
    "animations": true,
    "performance": "ultra",
    "plugins": {
      "messageCleaner": {
        "delayBetweenDeletes": 500,
        "batchSize": 50,
        "requireDoubleClick": true
      },
      "abreviation": {
        "toggleKeybind": "ctrl+shift+a",
        "showNotifications": true
      }
    }
  }
}
```

### 🎯 **Plugins Personnalisés**

```typescript
// Créer votre propre plugin
export default definePlugin({
    name: "MonPlugin",
    description: "Description de mon plugin",
    authors: [{ name: "MonNom", id: 123456789n }],

    start() {
        console.log("🚀 Plugin démarré !");
    },

    stop() {
        console.log("🛑 Plugin arrêté !");
    }
});
```

---

## 🛡️ **Sécurité & Confidentialité**

### 🔒 **Engagement Sécurité**
- ✅ **Code open-source** vérifié par la communauté
- ✅ **Aucune collecte de données** personnelles
- ✅ **Chiffrement local** des configurations
- ✅ **Mises à jour sécurisées** avec vérification de signature

### ⚠️ **Avertissement Discord**
> L'utilisation de modifications client peut **théoriquement** violer les conditions d'utilisation de Discord. Cependant, **aucun cas de bannissement** n'a été rapporté pour l'utilisation de Bashcord/Vencord. Utilisez à vos propres risques.

---

## 🤝 **Communauté & Support**

### 🆘 **Support Technique**
- 📧 **Email** : support@bashcord.fr
- 💬 **Discord** : `jfaispasdinfos`
- 🐛 **Bug Report** : Utilisez les templates GitHub

---

## 🏆 **Contributeurs**

<table>
  <tr>
    <td align="center">
      <img src="https://avatars.githubusercontent.com/u/116464968?v=4&size=64" alt="Bash"/>
      <br />
      <sub><b>Bash</b></sub>
      <br />
      <sub>Créateur & Lead Dev</sub>
    </td>
    <td align="center">
      <img src="https://github.com/vendicated.png" width="80px;" alt="Ven"/>
      <br />
      <sub><b>Vendicated</b></sub>
      <br />
      <sub>Vencord Creator</sub>
    </td>
    <td align="center">
      <img src="https://github.com/equicord.png" width="80px;" alt="Equicord"/>
      <br />
      <sub><b>Equicord Team</b></sub>
      <br />
      <sub>Base Framework</sub>
    </td>
  </tr>
</table>

---

## 📊 **Statistiques du Projet**

<div align="center">

![Statistiques](https://github-readme-stats.vercel.app/api?username=bash&show_icons=true&theme=tokyonight&count_private=true)

![Langages](https://github-readme-stats.vercel.app/api/top-langs/?username=bash&layout=compact&theme=tokyonight)

</div>

---

## 🎯 **Roadmap 2025**

### 🚀 **Q1 2025**
- [ ] 🤖 **IA Integration** - ChatGPT dans Discord
- [ ] 🎮 **Gaming Dashboard** - Stats gaming en temps réel
- [ ] 📱 **Mobile App** - Companion app pour iOS/Android

### 🎨 **Q2 2025**
- [ ] 🎭 **Theme Builder** - Créateur de thèmes visuel
- [ ] 🔊 **Voice Enhancement** - Amélioration audio IA
- [ ] 🌐 **Web Dashboard** - Interface web de contrôle

### ⚡ **Q3 2025**
- [ ] 🚀 **Performance 2.0** - Refonte du moteur
- [ ] 🛡️ **Security Suite** - Suite de sécurité complète
- [ ] 🎪 **Plugin Marketplace** - Boutique de plugins

---

## 📄 **Licence & Crédits**

```
MIT License - Bashcord 2025
Basé sur Vencord par Vendicated
Powered by Equicord Framework

Made with ❤️ by Bash & Community
```

### 🙏 **Remerciements Spéciaux**
- **Vendicated** pour avoir créé Vencord
- **Equicord Team** pour le framework étendu
- **La Communauté** pour les tests et feedbacks
- **Discord** pour la plateforme (même si on la modifie 😄)

---

<div align="center">

### ⭐ **Si Bashcord vous plaît, n'hésitez pas à laisser une étoile !** ⭐

**[⬆️ Retour en haut](#-bashcord---discord-mais-en-mieux)**

---

*"Discord, mais en mieux. Toujours."* - **Bash**, 2025

</div>
