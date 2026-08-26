Option Explicit

Dim shell, files, installDir, localAppData, appPath
Dim dockerExe, dockerDesktop, dockerStatus, startedAt
Dim processEnvironment

Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
Set processEnvironment = shell.Environment("PROCESS")

If Len(Trim(processEnvironment("DOCKER_API_VERSION"))) = 0 Then
  processEnvironment("DOCKER_API_VERSION") = "1.44"
End If

installDir = files.GetParentFolderName(WScript.ScriptFullName)
localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
appPath = files.BuildPath(installDir, "Grok Bot 0.18 Reconstructed.exe")
dockerExe = files.BuildPath(localAppData, "Programs\DockerDesktop\resources\bin\docker.exe")
dockerDesktop = files.BuildPath(localAppData, "Programs\DockerDesktop\Docker Desktop.exe")

If Not files.FileExists(appPath) Then
  MsgBox "Grok Bot is missing from:" & vbCrLf & installDir, vbCritical, "Grok Bot"
  WScript.Quit 1
End If

If files.FileExists(dockerExe) Then
  dockerStatus = DockerInfoExitCode(shell, dockerExe)
  If dockerStatus <> 0 And files.FileExists(dockerDesktop) Then
    shell.Run Quote(dockerDesktop), 0, False
    startedAt = Now
    Do
      WScript.Sleep 2000
      dockerStatus = DockerInfoExitCode(shell, dockerExe)
      If dockerStatus = 0 Then Exit Do
    Loop While DateDiff("s", startedAt, Now) < 120
  End If
End If

shell.Run Quote(appPath), 1, False

Function DockerInfoExitCode(activeShell, executable)
  On Error Resume Next
  DockerInfoExitCode = activeShell.Run(Quote(executable) & " info", 0, True)
  If Err.Number <> 0 Then
    Err.Clear
    DockerInfoExitCode = 1
  End If
  On Error GoTo 0
End Function

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
