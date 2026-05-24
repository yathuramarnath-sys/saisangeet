; installer.nsh — custom NSIS hook for Plato POS
; Force-closes any running Plato POS process before installation begins.
; This prevents the "Plato POS cannot be closed" error during updates.

!macro preInit
  ; Force kill Plato POS if running — silently, no user prompt needed
  nsExec::ExecToLog 'taskkill /F /IM "Plato POS.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "plato pos.exe" /T'
  Sleep 1000
!macroend

!macro customInstall
  ; Nothing extra needed at install time
!macroend
