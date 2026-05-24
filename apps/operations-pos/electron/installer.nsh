; installer.nsh — custom NSIS hook for Plato POS
; Runs BEFORE installer tries to copy files.
; 1. Force-kills Plato POS process
; 2. Waits for file locks to release
; 3. Deletes old install folder via cmd so %LOCALAPPDATA% expands correctly

!macro preInit
  ; Kill all Plato POS processes — /T kills child processes too
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "Plato POS.exe" /T'
  ; Wait for OS to fully release file locks after kill
  Sleep 3000
  ; Delete old install folder — use cmd so %LOCALAPPDATA% expands correctly
  nsExec::ExecToLog 'cmd /c rmdir /s /q "%LOCALAPPDATA%\Programs\Plato POS"'
  nsExec::ExecToLog 'cmd /c rmdir /s /q "%LOCALAPPDATA%\Programs\plato-pos"'
  Sleep 500
!macroend
