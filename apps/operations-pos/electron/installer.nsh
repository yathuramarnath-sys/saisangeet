; installer.nsh — custom NSIS hook for Plato POS
; 1. Force-kills any running Plato POS process
; 2. Removes old installation folder so locked files don't block the update
; User data (localStorage, settings) is in AppData\Roaming — NOT touched here.

!macro preInit
  ; Force kill Plato POS — silently, ignore errors if not running
  nsExec::ExecToLog 'taskkill /F /IM "Plato POS.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "plato pos.exe" /T'
  ; Wait for process to fully release file locks
  Sleep 2000

  ; Remove old per-user install folder so locked files are cleared
  ; $LOCALAPPDATA = C:\Users\<name>\AppData\Local
  ; User data lives in AppData\Roaming — completely separate, not touched
  RMDir /r "$LOCALAPPDATA\Programs\plato-pos"
  RMDir /r "$LOCALAPPDATA\Programs\Plato POS"
!macroend

!macro customInstall
  ; Nothing extra needed — clean install handles everything
!macroend
