# 🤖 Synchronisation Automatique GitHub Actions

Ce repository est configuré pour se synchroniser **automatiquement** avec Equicord via GitHub Actions.

## ⚙️ Comment ça fonctionne ?

### 🔄 Workflow de Synchronisation
- **Fréquence** : Toutes les heures (automatique)
- **Action** : Récupère les commits d'Equicord et les merge
- **Protection** : Vos fichiers personnalisés sont préservés

### 🔨 Workflow de Build
- **Déclencheur** : Après chaque synchronisation réussie
- **Action** : Build et test automatique
- **Artefacts** : Disponibles pendant 7 jours

## 📁 Fichiers Protégés

Ces fichiers **ne seront JAMAIS écrasés** lors des synchronisations :

- 🔒 `src/userplugins/**` - Vos plugins personnalisés
- 🔒 `src/equicordplugins/followVoiceUser/**` - Votre version modifiée
- 🔒 `src/components/settings/tabs/plugins/index.tsx` - Label "Show Bashcord"

## 🎮 Utilisation

### Synchronisation Manuelle
Vous pouvez déclencher une synchronisation manuellement :

1. Allez dans l'onglet **Actions** de votre repo
2. Sélectionnez "🔄 Sync with Equicord"
3. Cliquez sur **Run workflow**

### Voir les Logs
1. Onglet **Actions**
2. Cliquez sur le workflow qui vous intéresse
3. Consultez les logs détaillés

### Notifications
Pour recevoir des notifications quand les workflows échouent :
1. Settings → Notifications
2. Activer "Actions" notifications

## 🚨 En cas de problème

Si un workflow échoue :

1. **Vérifier les logs** dans l'onglet Actions
2. **Conflits de merge** : Les fichiers protégés utilisent automatiquement votre version
3. **Erreur de build** : Peut nécessiter une intervention manuelle

### Résolution manuelle si nécessaire :

```bash
# Cloner votre repo
git clone https://github.com/roothheo/bashcord
cd bashcord

# Récupérer les changements
git fetch upstream
git merge upstream/main

# En cas de conflit sur vos fichiers
git checkout --ours src/userplugins/
git checkout --ours src/equicordplugins/followVoiceUser/
git checkout --ours src/components/settings/tabs/plugins/index.tsx

# Finaliser
git add .
git commit -m "Resolve merge conflicts"
git push origin main
```

## 📊 Statistiques

Vous pouvez voir :
- **Nombre de syncs** : Onglet Actions → Workflows
- **Dernière mise à jour** : Badge du workflow
- **Taille des changements** : Dans les logs de chaque workflow

## 🔧 Configuration

Les workflows sont dans `.github/workflows/` :
- `sync-equicord.yml` - Synchronisation automatique
- `build-on-sync.yml` - Build après sync

Pour modifier la fréquence de sync, éditez la ligne `cron` dans `sync-equicord.yml`.

## 📬 Support

Si vous rencontrez des problèmes avec les workflows :
1. Consultez les logs dans Actions
2. Vérifiez les permissions du token GitHub
3. Ouvrez une issue si nécessaire

