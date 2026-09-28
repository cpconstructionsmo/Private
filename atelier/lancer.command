#!/bin/bash
# Ouvre l'atelier de conception dans le navigateur. Double-cliquez sur ce
# fichier ; fermez la fenêtre du Terminal pour arrêter l'atelier.
# Le serveur n'écoute que sur ce Mac (127.0.0.1) : rien n'est accessible
# depuis un autre appareil, et aucun plan n'est envoyé ailleurs.
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "L'atelier n'est pas encore installé : double-cliquez d'abord sur « installer.command »."
  read -r -p "Appuyez sur Entrée pour fermer." _
  exit 1
fi
exec .venv/bin/python -m atelier.serveur "$@"
