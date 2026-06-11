@echo off
REM Agente en MODO ESCUCHA (ver agent/README.md): pasada inicial + atento al
REM boton web (cada ~60s) + pasada periodica. Queda corriendo en segundo plano.
REM Lo lanza el acceso directo de la carpeta de Inicio. No necesita admin.
cd /d "%~dp0.."
echo.>> "agent\harvest.log"
echo ==================== WATCH %DATE% %TIME% ====================>> "agent\harvest.log"
node "agent\harvest-maps-urls.mjs" --watch >> "agent\harvest.log" 2>&1
