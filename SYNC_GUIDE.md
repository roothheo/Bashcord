# 🔄 Guide de Synchronisation avec Equicord

Ce guide explique comment synchroniser Bashcord avec les mises à jour d'Equicord tout en préservant vos modifications personnelles.

## 🎯 Configuration effectuée

✅ **Remote upstream configuré** : Equicord est maintenant ajouté comme source de mises à jour
✅ **Protection automatique** : Vos fichiers personnalisés sont protégés lors des merges
✅ **Script de sync** : Un script automatique pour faciliter les mises à jour

## 📁 Fichiers protégés

Les fichiers suivants **ne seront JAMAIS écrasés** lors d'une synchronisation :

- 🔒 **`src/userplugins/**`** - Tous vos plugins personnalisés
- 🔒 **`src/equicordplugins/followVoiceUser/**`** - Votre version modifiée du plugin
- 🔒 **`src/components/settings/tabs/plugins/index.tsx`** - Votre label "Show Bashcord"

## 🤖 Synchronisation automatique (RECOMMANDÉ)

### Installation unique :
```bash
./setup-auto-sync.sh
```

Choisissez entre :
- **Cron job** : Simple, vérifie toutes les heures
- **Systemd service** : Plus robuste, recommandé pour Linux moderne
- **Les deux** : Maximum de fiabilité

Une fois configuré, votre Bashcord se synchronisera automatiquement avec Equicord **toutes les heures** !

### Commandes utiles :
```bash
# Voir les logs de synchronisation
tail -f sync.log

# Forcer une sync maintenant
./auto-sync-equicord.sh

# Désactiver (cron)
crontab -e  # Supprimer la ligne bashcord

# Désactiver (systemd)
systemctl --user stop bashcord-sync.timer
systemctl --user disable bashcord-sync.timer
```

## 🚀 Méthode manuelle (synchronisation ponctuelle)

### Script interactif :
```bash
./sync-equicord.sh
```

Le script va :
1. Récupérer les mises à jour d'Equicord
2. Afficher les nouveaux commits
3. Vous demander confirmation
4. Merger en préservant vos fichiers
5. Résoudre automatiquement les conflits si nécessaire

## 🛠️ Méthode 2 : Synchronisation manuelle

### Étape 1 : Récupérer les mises à jour
```bash
git fetch upstream
```

### Étape 2 : Voir les changements disponibles
```bash
git log --oneline HEAD..upstream/main
```

### Étape 3 : Merger
```bash
git merge upstream/main
```

Si des conflits apparaissent sur vos fichiers protégés :
```bash
# Garder votre version
git checkout --ours src/userplugins/
git checkout --ours src/components/settings/tabs/plugins/index.tsx

# Finaliser le merge
git add .
git merge --continue
```

## 📦 Après chaque synchronisation

N'oubliez pas de rebuild :
```bash
pnpm build
```

## 💡 Conseils

- **Avant de sync** : Committez ou stash vos changements en cours
- **Fréquence** : Synchronisez régulièrement (1x par semaine par exemple)
- **Backup** : Vos plugins sont dans `src/userplugins/`, sauvegardez-les régulièrement

## 🔍 Vérifier l'état

Pour voir si vous êtes à jour :
```bash
git fetch upstream
git log --oneline HEAD..upstream/main
```

Si aucun commit n'apparaît, vous êtes à jour ! ✅

## 🆘 En cas de problème

Si quelque chose se passe mal :
```bash
# Annuler le merge en cours
git merge --abort

# Revenir à l'état précédent
git reset --hard HEAD
```

## 📋 Structure des remotes

- **origin** : Votre fork (bashcord) - pour vos commits
- **upstream** : Equicord officiel - pour les mises à jour

```bash
# Pousser vos changements sur votre fork
git push origin main

# Récupérer les mises à jour d'Equicord
git fetch upstream
git merge upstream/main
```

---

**Créé le :** $(date)
**Version :** 1.0

