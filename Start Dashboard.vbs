Option Explicit
Dim shell, fs, root, python, base, folder, args, candidate
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
python = ""
FindPython shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.cache\codex-runtimes\codex-primary-runtime\dependencies\python"
base = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Python"
If fs.FolderExists(base) Then
  For Each folder In fs.GetFolder(base).SubFolders
    FindPython folder.Path
  Next
End If
For Each candidate In Split(shell.ExpandEnvironmentStrings("%PATH%"), ";")
  If InStr(LCase(candidate), "windowsapps") = 0 Then FindPython Replace(candidate, """", "")
Next
If python = "" Then
  MsgBox "Python 3 was not found. Install Python from python.org, then double-click this launcher again.", 48, "Dashboard setup"
  WScript.Quit 1
End If
If Not fs.FileExists(root & "\serve.py") Then
  MsgBox "Extract the complete project folder first. serve.py is missing beside this launcher.", 48, "Dashboard setup"
  WScript.Quit 1
End If
args = ""
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "--stop" Then args = " --stop"
  If WScript.Arguments(0) = "--no-browser" Then args = " --no-browser"
End If
shell.CurrentDirectory = root
shell.Run """" & python & """ """ & root & "\serve.py""" & args, 0, False

Sub FindPython(path)
  If python <> "" Or path = "" Then Exit Sub
  If fs.FileExists(path & "\pythonw.exe") Then
    python = path & "\pythonw.exe"
  ElseIf fs.FileExists(path & "\python.exe") Then
    python = path & "\python.exe"
  End If
End Sub
