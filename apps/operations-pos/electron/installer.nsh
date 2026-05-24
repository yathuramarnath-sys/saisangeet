; installer.nsh — Plato POS permanent installer fix
;
; PERMANENT STRATEGY:
; - Install always goes to C:\PlatoPos (fixed path, never conflicts with old installs)
; - preInit kills any remaining process + removes startup registry entry
; - CloseApplications is overridden to skip the "cannot be closed" check entirely
;   because our updater.bat already ensures the POS is dead before installer starts

!macro preInit
  ; Set fixed install path — always fresh, no conflict with old AppData installation
  StrCpy $INSTDIR "C:\PlatoPos"

  ; Kill any remaining Plato POS processes
  nsExec::ExecToLog '$SYSDIR\cmd.exe /c taskkill /F /IM "Plato POS.exe" /T'
  Sleep 2000

  ; Remove from Windows startup registry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Plato POS"

  ; Remove old uninstall registry entry (prevents "failed to uninstall" error)
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\in.dinexpos.pos"
!macroend

; Override CloseApplications — skip the "app cannot be closed" check entirely
; The updater.bat already killed the process before installer launched
!macro CloseApplications
!macroend

!macro CloseApplicationsPostInstall
!macroend
