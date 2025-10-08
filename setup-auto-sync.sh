#!/bin/bash
# Script pour configurer la synchronisation automatique

BASHCORD_DIR="/home/bash/Bureau/bashcord"
SCRIPT_PATH="$BASHCORD_DIR/auto-sync-equicord.sh"

echo "🔧 Configuration de la synchronisation automatique avec Equicord"
echo ""

# Méthode 1: Cron job (vérifie toutes les heures)
setup_cron() {
    echo "📅 Configuration du cron job..."
    
    # Vérifier si le cron existe déjà
    if crontab -l 2>/dev/null | grep -q "auto-sync-equicord.sh"; then
        echo "✅ Cron job déjà configuré"
    else
        # Ajouter le cron job (toutes les heures)
        (crontab -l 2>/dev/null; echo "0 * * * * $SCRIPT_PATH >> $BASHCORD_DIR/sync.log 2>&1") | crontab -
        echo "✅ Cron job ajouté (synchronisation toutes les heures)"
    fi
}

# Méthode 2: Service systemd (plus robuste)
setup_systemd() {
    echo "⚙️  Configuration du service systemd..."
    
    # Créer le service
    cat > ~/.config/systemd/user/bashcord-sync.service << EOF
[Unit]
Description=Bashcord Auto-Sync avec Equicord
After=network-online.target

[Service]
Type=oneshot
ExecStart=$SCRIPT_PATH
WorkingDirectory=$BASHCORD_DIR

[Install]
WantedBy=default.target
EOF

    # Créer le timer (toutes les heures)
    cat > ~/.config/systemd/user/bashcord-sync.timer << EOF
[Unit]
Description=Timer pour Bashcord Auto-Sync
Requires=bashcord-sync.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

    # Recharger et activer
    systemctl --user daemon-reload
    systemctl --user enable bashcord-sync.timer
    systemctl --user start bashcord-sync.timer
    
    echo "✅ Service systemd configuré et démarré"
}

echo "Choisissez la méthode de synchronisation automatique:"
echo "1) Cron job (simple, vérifie toutes les heures)"
echo "2) Service systemd (recommandé, plus robuste)"
echo "3) Les deux"
echo ""
read -p "Votre choix (1/2/3): " choice

case $choice in
    1)
        setup_cron
        ;;
    2)
        mkdir -p ~/.config/systemd/user
        setup_systemd
        ;;
    3)
        setup_cron
        mkdir -p ~/.config/systemd/user
        setup_systemd
        ;;
    *)
        echo "❌ Choix invalide"
        exit 1
        ;;
esac

echo ""
echo "✅ Configuration terminée!"
echo ""
echo "📋 Commandes utiles:"
echo "  - Voir les logs: tail -f $BASHCORD_DIR/sync.log"
echo "  - Sync manuel: $SCRIPT_PATH"
echo "  - Désactiver cron: crontab -e (supprimer la ligne)"
echo "  - Désactiver systemd: systemctl --user stop bashcord-sync.timer"
echo ""

