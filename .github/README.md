# 🤖 GitHub Actions - Bashcord

[![Sync with Equicord](https://github.com/roothheo/bashcord/actions/workflows/sync-equicord.yml/badge.svg)](https://github.com/roothheo/bashcord/actions/workflows/sync-equicord.yml)
[![Build after Sync](https://github.com/roothheo/bashcord/actions/workflows/build-on-sync.yml/badge.svg)](https://github.com/roothheo/bashcord/actions/workflows/build-on-sync.yml)

## 📋 Workflows Configurés

### 🔄 Sync with Equicord
- **Fréquence** : Automatique toutes les heures
- **Fonction** : Synchronise avec le repo Equicord upstream
- **Protection** : Préserve vos modifications dans userplugins/ et followVoiceUser/
- **Déclenchement manuel** : Onglet Actions → Run workflow

### 🔨 Build after Sync
- **Déclencheur** : Après chaque sync réussi
- **Fonction** : Build et test automatique
- **Artefacts** : Disponibles pendant 7 jours

## 🎯 Comment ça marche ?

1. **Toutes les heures**, GitHub vérifie les nouveaux commits d'Equicord
2. Si des changements existent, ils sont **automatiquement mergés**
3. Vos fichiers personnalisés sont **toujours protégés**
4. Un **build automatique** vérifie que tout fonctionne
5. Le tout est **poussé sur votre repo** bashcord

## 🔒 Fichiers Protégés

- `src/userplugins/**` - Vos plugins
- `src/equicordplugins/followVoiceUser/**` - Votre version
- `src/components/settings/tabs/plugins/index.tsx` - Label Bashcord

## 📖 Documentation Complète

Voir [SYNC_INFO.md](./SYNC_INFO.md) pour plus de détails.

