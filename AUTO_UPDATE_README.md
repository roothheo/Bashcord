# 🤖 Auto-Update System for Bashcord

Ce système permet de mettre automatiquement à jour votre fork Bashcord avec les dernières modifications d'Equicord tout en préservant vos personnalisations.

## 🛡️ Fichiers Protégés

Les fichiers suivants sont automatiquement protégés lors des mises à jour :

- **`src/plugins/_core/settings.tsx`** - Interface utilisateur personnalisée "Bashcord"
- **`src/userplugins/`** - Tous vos plugins personnalisés

## 🔄 Types de Mise à Jour

### 1. Mise à Jour Automatique (Quotidienne)
- **Fichier** : `.github/workflows/auto-update-from-equicord.yml`
- **Fréquence** : Tous les jours à 2h UTC
- **Déclenchement** : Automatique via GitHub Actions

### 2. Mise à Jour Manuelle
- **Fichier** : `.github/workflows/manual-update.yml`
- **Déclenchement** : Via l'interface GitHub Actions
- **Options** :
  - Forcer la mise à jour même sans nouveaux commits
  - Ajouter un message personnalisé

## 🚀 Comment Utiliser

### Mise à Jour Manuelle

1. Allez sur votre repository GitHub
2. Cliquez sur l'onglet **"Actions"**
3. Sélectionnez **"Manual Update from Equicord"**
4. Cliquez sur **"Run workflow"**
5. Configurez les options si nécessaire :
   - ✅ **Force update** : Forcer même sans nouveaux commits
   - 💬 **Update message** : Message personnalisé pour le commit
6. Cliquez sur **"Run workflow"**

### Vérifier les Mises à Jour

1. Allez dans **"Actions"** sur GitHub
2. Consultez les logs des workflows :
   - **"Auto-Update from Equicord"** (quotidien)
   - **"Manual Update from Equicord"** (manuel)

## 📊 Résumé des Mises à Jour

Chaque exécution génère un résumé détaillé incluant :
- Nombre de commits intégrés
- Fichiers protégés
- Statut de la fusion
- Liens vers les sources

## 🔧 Fonctionnement Technique

### Processus de Mise à Jour

1. **Sauvegarde** : Création d'une sauvegarde des fichiers protégés
2. **Récupération** : Fetch des dernières modifications d'Equicord
3. **Fusion** : Tentative de fusion automatique
4. **Résolution de conflits** : Résolution automatique en préservant vos fichiers
5. **Restauration** : Restauration des fichiers protégés
6. **Vérification** : Validation que les personnalisations sont préservées
7. **Commit** : Création d'un commit avec les changements
8. **Push** : Envoi des modifications vers votre repository

### Gestion des Conflits

- **Fichiers protégés** : Toujours garder votre version
- **Autres fichiers** : Accepter les modifications d'Equicord
- **Vérification** : Contrôle automatique de l'intégrité

## ⚠️ Important

- Les workflows nécessitent des permissions **write** sur le repository
- Assurez-vous que `GITHUB_TOKEN` a les bonnes permissions
- Les mises à jour sont automatiques, surveillez les notifications GitHub

## 🆘 Dépannage

### Si une mise à jour échoue

1. Vérifiez les logs dans l'onglet **"Actions"**
2. Les erreurs sont généralement liées aux permissions
3. Vous pouvez toujours faire une mise à jour manuelle

### Si des personnalisations sont perdues

1. Consultez l'historique Git pour retrouver vos modifications
2. Les sauvegardes sont créées à chaque mise à jour
3. Restaurez depuis un commit précédent si nécessaire

## 📝 Logs et Historique

- **Commits** : Chaque mise à jour crée un commit avec un message détaillé
- **Actions** : Historique complet dans l'onglet GitHub Actions
- **Résumés** : Résumé automatique de chaque exécution

---

*Ce système garantit que votre Bashcord reste à jour avec Equicord tout en préservant vos personnalisations uniques.*
