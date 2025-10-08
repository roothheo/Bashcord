#!/bin/bash
# Script pour synchroniser avec Equicord en préservant vos modifications

echo "🔄 Synchronisation avec Equicord..."
echo ""

# Récupérer les dernières mises à jour d'Equicord
echo "📥 Récupération des mises à jour d'Equicord..."
git fetch upstream

# Afficher les changements disponibles
echo ""
echo "📋 Nouveaux commits disponibles depuis Equicord:"
git log --oneline HEAD..upstream/main | head -10

echo ""
read -p "Voulez-vous merger ces changements ? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo ""
    echo "🔀 Merge en cours (vos fichiers dans userplugins/ seront préservés)..."

    # Merge avec préservation de vos fichiers
    git merge upstream/main --no-edit || {
        echo ""
        echo "⚠️  Conflit détecté ! Résolution automatique..."
        echo ""

        # En cas de conflit, garder nos versions des fichiers protégés
        git checkout --ours src/userplugins/ 2>/dev/null
        git checkout --ours src/components/settings/tabs/plugins/index.tsx 2>/dev/null

        git add .
        git merge --continue --no-edit
    }

    echo ""
    echo "✅ Synchronisation terminée !"
    echo ""
    echo "📦 N'oubliez pas de rebuild avec: pnpm build"
else
    echo "❌ Synchronisation annulée."
fi

