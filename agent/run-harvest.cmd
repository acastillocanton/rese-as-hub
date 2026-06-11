@echo off
REM Launcher del agente de cosecha de deep-links (ver agent/README.md).
REM Lo ejecuta el acceso directo de la carpeta de Inicio y tambien se puede
REM ejecutar a mano (doble clic). No necesita admin. Requiere Node en el PATH.
cd /d "%~dp0.."
echo.>> "agent\harvest.log"
echo ==================== %DATE% %TIME% ====================>> "agent\harvest.log"
node "agent\harvest-maps-urls.mjs" >> "agent\harvest.log" 2>&1
echo (fin, codigo %ERRORLEVEL%)>> "agent\harvest.log"
