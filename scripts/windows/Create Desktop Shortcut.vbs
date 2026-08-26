Option Explicit

Dim shell, files, installDir, appPath, launcherPath
Dim desktopPath, shortcutPath, shortcut

If WScript.Arguments.Count <> 1 Then
  WScript.Echo "Usage: Create Desktop Shortcut.vbs <install-directory>"
  WScript.Quit 2
End If

Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")

installDir = files.GetAbsolutePathName(WScript.Arguments(0))
appPath = files.BuildPath(installDir, "Grok Bot 0.18 Reconstructed.exe")
launcherPath = files.BuildPath(installDir, "Launch Grok Bot.vbs")

If Not files.FileExists(appPath) Or Not files.FileExists(launcherPath) Then
  WScript.Echo "The installed application or launcher is missing."
  WScript.Quit 1
End If

desktopPath = shell.SpecialFolders("Desktop")
shortcutPath = files.BuildPath(desktopPath, "Grok Bot 0.18 Reconstructed.lnk")
Set shortcut = shell.CreateShortcut(shortcutPath)
shortcut.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
shortcut.Arguments = Chr(34) & launcherPath & Chr(34)
shortcut.WorkingDirectory = installDir
shortcut.IconLocation = appPath & ",0"
shortcut.Description = "Launch Grok Bot and make the local Docker sandbox available"
shortcut.Save

WScript.Echo shortcutPath
