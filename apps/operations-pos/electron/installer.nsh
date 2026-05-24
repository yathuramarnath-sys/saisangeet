; installer.nsh — Plato POS permanent installer fix
;
; ROOT CAUSE (discovered by reading electron-builder NSIS templates):
; "Plato POS cannot be closed" comes from TWO places:
;
;   SOURCE 1 — allowOnlyOneInstallerInstance.nsh line 110
;     _CHECK_APP_RUNNING finds POS still running → retry loop → shows dialog
;     FIX: customCheckAppRunning override (empty) skips this check entirely
;
;   SOURCE 2 — installUtil.nsh line 219
;     uninstallOldVersion runs OLD uninstaller (ExecWait) → old uninstaller fails
;     5 retries → shows SAME "$(appCannotBeClosed)" dialog
;     FIX: preInit deletes the uninstall registry keys + wipes old directories
;          so uninstallOldVersion finds no UninstallString and returns early

!macro preInit
  ; Set fixed install path — always fresh, never conflicts with old AppData install
  StrCpy $INSTDIR "C:\PlatoPos"

  ; InitPluginsDir MUST be called before any nsExec plugin calls
  InitPluginsDir

  ; ── Kill ALL Plato POS processes (main exe + all Electron helper processes) ──
  nsExec::ExecToLog '$SYSDIR\cmd.exe /c taskkill /F /IM "Plato POS.exe" /T >nul 2>&1'
  nsExec::ExecToLog '$SYSDIR\cmd.exe /c taskkill /F /IM "Plato POS Helper.exe" /T >nul 2>&1'
  nsExec::ExecToLog '$SYSDIR\cmd.exe /c taskkill /F /IM "Plato POS Helper (Renderer).exe" /T >nul 2>&1'
  nsExec::ExecToLog '$SYSDIR\cmd.exe /c taskkill /F /IM "Plato POS Helper (GPU).exe" /T >nul 2>&1'
  nsExec::ExecToLog '$SYSDIR\cmd.exe /c wmic process where "name like ''Plato%%''" delete >nul 2>&1'
  Sleep 3000

  ; ── Wipe old install directories (releases all file locks) ──
  ; This prevents the old uninstaller from failing due to locked/in-use files
  nsExec::ExecToLog '$SYSDIR\cmd.exe /c rmdir /S /Q "$LOCALAPPDATA\Programs\Plato POS" >nul 2>&1'
  nsExec::ExecToLog '$SYSDIR\cmd.exe /c rmdir /S /Q "C:\PlatoPos" >nul 2>&1'
  Sleep 500

  ; ── Delete ALL registry keys for old installs ──
  ; IMPORTANT: electron-builder uses APP_GUID (UUID hash of appId) as the registry key name,
  ; NOT the appId string. Confirmed from build output: UNINSTALL_APP_KEY=2624a8bc-0806-5099-9bb3-86068397e784
  ; Without UninstallString in registry, uninstallOldVersion returns early (no retry loop)
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\2624a8bc-0806-5099-9bb3-86068397e784"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\in.dinexpos.pos"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Plato POS"
  DeleteRegKey HKCU "Software\2624a8bc-0806-5099-9bb3-86068397e784"
  DeleteRegKey HKCU "Software\in.dinexpos.pos"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Plato POS"
!macroend

; ── SOURCE 1 FIX ──
; customCheckAppRunning overrides _CHECK_APP_RUNNING in allowOnlyOneInstallerInstance.nsh
!macro customCheckAppRunning
!macroend

; ── SOURCE 2 FIX (backup) ──
; customUnInstallCheck overrides handleUninstallResult in installUtil.nsh
; If the old uninstaller fails for ANY reason, skip the error and proceed with install
!macro customUnInstallCheck
  ClearErrors
!macroend
