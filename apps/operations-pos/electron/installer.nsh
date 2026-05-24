; installer.nsh — Plato POS custom NSIS hooks
;
; Runs BEFORE the installer does anything else:
; 1. Kill running Plato POS process
; 2. Delete old install folder (frees locked files)
; 3. Delete registry uninstall key (prevents "failed to uninstall" error)

!macro preInit
  ; Step 1 — Kill the running app and all its child processes
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "Plato POS.exe" /T'
  ; Wait for OS to fully release file locks
  Sleep 3000

  ; Step 2 — Delete the old install folder via cmd (% vars always expand in cmd)
  nsExec::ExecToLog 'cmd /c rmdir /s /q "%LOCALAPPDATA%\Programs\Plato POS"'
  nsExec::ExecToLog 'cmd /c rmdir /s /q "%LOCALAPPDATA%\Programs\plato-pos"'
  Sleep 1000

  ; Step 3 — Remove the old registry uninstall entry
  ; Without this, NSIS looks for the old uninstaller, can't find it (deleted), and errors.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\in.dinexpos.pos"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Plato POS"
!macroend
