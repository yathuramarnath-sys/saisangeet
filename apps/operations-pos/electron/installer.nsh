; installer.nsh — Plato POS installer fixes
;
; preInit: ONLY safe built-in NSIS registry ops — NO plugins, NO nsExec, NO Sleep.
; nsExec + Sleep in preInit caused installer window to never appear on Windows 11 24H2.
;
; Process killing and directory cleanup is NOT needed here because:
;   - customCheckAppRunning (empty) skips the "app is running" check
;   - customUnInstallCheck (ClearErrors) ignores failed old uninstaller
;   - electron-builder overwrites files directly without needing old folder gone

!macro preInit
  ; Delete old uninstall registry keys so electron-builder doesn't try to
  ; run the missing old uninstaller (which would cause a silent failure).
  ; These are pure NSIS built-in ops — safe to run before installer UI appears.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\2624a8bc-0806-5099-9bb3-86068397e784"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\in.dinexpos.pos"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Plato POS"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\2624a8bc-0806-5099-9bb3-86068397e784"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Plato POS"
  DeleteRegKey HKCU "Software\2624a8bc-0806-5099-9bb3-86068397e784"
  DeleteRegKey HKCU "Software\in.dinexpos.pos"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Plato POS"
!macroend

; Skip the "app is running" check entirely — no dialog, no retry loop
!macro customCheckAppRunning
!macroend

; If old uninstaller fails for any reason — ignore and proceed
!macro customUnInstallCheck
  ClearErrors
!macroend
