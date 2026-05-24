; installer.nsh — Plato POS
; Force install to C:\PlatoPos — completely avoids the old broken installation.
; Old files in AppData\Programs\Plato POS are left untouched (McAfee locks them).
; New clean install goes to C:\PlatoPos — no conflicts, no locked files.

!macro preInit
  ; Override install directory to a fixed path — bypasses old installation entirely
  StrCpy $INSTDIR "C:\PlatoPos"
!macroend
