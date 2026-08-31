@echo off
rem Essor — lancement local, pour developper ou travailler hors ligne.
rem
rem L'usage normal est desormais l'adresse GitHub Pages (voir DEPLOIEMENT.md) :
rem c'est la seule qui soit accessible du telephone, et c'est elle qui porte
rem le coffre synchronise.
rem
rem Ce lanceur sert le dossier sur http://localhost:8765 plutot que d'ouvrir
rem index.html directement : « file:// » constitue une origine differente, donc
rem un AUTRE coffre, vide, sans rapport avec celui du site.

setlocal
set "PORT=8765"

rem Un serveur statique, avec ce qui est disponible sur la machine.
set "SERVEUR="
where python >nul 2>nul && set "SERVEUR=python -m http.server %PORT%"
if not defined SERVEUR where py >nul 2>nul && set "SERVEUR=py -m http.server %PORT%"
if not defined SERVEUR where npx >nul 2>nul && set "SERVEUR=npx --yes serve -l %PORT% ."

if not defined SERVEUR (
  echo Ni Python ni Node ne sont installes : impossible de servir le dossier.
  echo Ouvrez plutot l'application a son adresse GitHub Pages.
  pause
  goto :eof
)

pushd "%~dp0"
start "" http://localhost:%PORT%/index.html
echo Essor est servi sur http://localhost:%PORT%/ — fermez cette fenetre pour l'arreter.
%SERVEUR%
popd
