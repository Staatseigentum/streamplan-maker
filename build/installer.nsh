; Force Windows Explorer to drop its cached icon association right after
; install/uninstall, so the Desktop/Start Menu shortcut and taskbar icon show
; the real app icon immediately instead of a stale placeholder (Windows keys
; its icon cache by file path, which otherwise lingers until a manual cache
; clear or reboot).
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
