#!/bin/bash
# Installation de l'atelier de conception sur le Mac (à faire une fois, puis
# après chaque mise à jour du dossier). Double-cliquez sur ce fichier.
# Tout reste sur ce Mac : un environnement Python propre à l'atelier est créé
# dans le dossier .venv, à côté de ce fichier.
set -e
cd "$(dirname "$0")"

echo "== Atelier de conception — installation =="

# Python 3.10 au minimum (celui livré avec macOS est souvent trop ancien)
PY=""
for v in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$v" >/dev/null 2>&1 && "$v" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    PY="$(command -v "$v")"; break
  fi
done
if [ -z "$PY" ]; then
  echo
  echo "Python 3.10 ou plus récent est nécessaire."
  echo "Installez-le depuis https://www.python.org/downloads/macos/ puis relancez ce fichier."
  read -r -p "Appuyez sur Entrée pour fermer." _
  exit 1
fi
echo "Python : $("$PY" --version)"

if [ ! -x .venv/bin/python ]; then
  "$PY" -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip >/dev/null
.venv/bin/python -m pip install -r requirements.txt

echo
echo "Vérification sur le plan d'essai fictif…"
.venv/bin/python -m pytest -q tests

chmod +x lancer.command 2>/dev/null || true
echo
echo "Installation terminée. Double-cliquez sur « lancer.command » pour ouvrir l'atelier."
read -r -p "Appuyez sur Entrée pour fermer." _
