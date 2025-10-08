#!/bin/bash
# Script de synchronisation AUTOMATIQUE avec Equicord
# Lance en arrière-plan et synchronise régulièrement

BASHCORD_DIR="/home/bash/Bureau/bashcord"
LOG_FILE="$BASHCORD_DIR/sync.log"
LOCK_FILE="/tmp/bashcord-sync.lock"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Éviter les exécutions simultanées
if [ -f "$LOCK_FILE" ]; then
    log "⚠️  Synchronisation déjà en cours, abandon."
    exit 0
fi

touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

cd "$BASHCORD_DIR" || exit 1

log "🔄 Démarrage de la synchronisation automatique..."

# Récupérer les mises à jour d'Equicord
git fetch upstream >> "$LOG_FILE" 2>&1

# Vérifier s'il y a des changements
CHANGES=$(git log --oneline HEAD..upstream/main | wc -l)

if [ "$CHANGES" -eq 0 ]; then
    log "✅ Déjà à jour avec Equicord"
    exit 0
fi

log "📦 $CHANGES nouveau(x) commit(s) disponible(s)"

# Sauvegarder l'état actuel (au cas où)
git stash push -m "Auto-stash avant sync $(date)" >> "$LOG_FILE" 2>&1

# Merger automatiquement
log "🔀 Merge en cours (fichiers protégés préservés)..."
if git merge upstream/main --no-edit >> "$LOG_FILE" 2>&1; then
    log "✅ Merge réussi"
else
    log "⚠️  Conflits détectés, résolution automatique..."
    
    # Garder nos versions des fichiers protégés
    git checkout --ours src/userplugins/ >> "$LOG_FILE" 2>&1
    git checkout --ours src/equicordplugins/followVoiceUser/ >> "$LOG_FILE" 2>&1
    git checkout --ours src/components/settings/tabs/plugins/index.tsx >> "$LOG_FILE" 2>&1
    
    git add . >> "$LOG_FILE" 2>&1
    git merge --continue --no-edit >> "$LOG_FILE" 2>&1
    
    log "✅ Conflits résolus"
fi

# Restaurer le stash si nécessaire
if git stash list | grep -q "Auto-stash avant sync"; then
    git stash pop >> "$LOG_FILE" 2>&1
fi

# Rebuild automatique si pnpm est disponible
if command -v pnpm &> /dev/null; then
    log "🔨 Rebuild en cours..."
    pnpm build >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
        log "✅ Build réussi"
    else
        log "❌ Erreur lors du build"
    fi
else
    log "⚠️  pnpm non trouvé, rebuild manuel nécessaire"
fi

log "🎉 Synchronisation terminée avec succès!"

