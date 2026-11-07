!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\resources\dota-notes-companion.exe" 0 +2
  ExecWait '"$INSTDIR\resources\dota-notes-companion.exe" --uninstall'
!macroend
!macro NSIS_HOOK_PREUNINSTALL
  IfFileExists "$INSTDIR\resources\dota-notes-companion.exe" 0 +2
  ExecWait '"$INSTDIR\resources\dota-notes-companion.exe" --uninstall'
!macroend
