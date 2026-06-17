@echo off
REM Keep the Sochmat print agent running: restart it if it ever exits/crashes.
REM Logs go to print_agent.log next to this file. Double-click to run, or point
REM Task Scheduler / the Startup folder at this file (see README).

cd /d "%~dp0"

REM Use the venv if one exists, else fall back to the system Python.
set PY=python
if exist ".venv\Scripts\python.exe" set PY=.venv\Scripts\python.exe

:loop
echo [%date% %time%] starting print agent >> print_agent.log
%PY% print_agent.py >> print_agent.log 2>&1
echo [%date% %time%] agent exited (code %errorlevel%); restarting in 5s >> print_agent.log
timeout /t 5 /nobreak > nul
goto loop
