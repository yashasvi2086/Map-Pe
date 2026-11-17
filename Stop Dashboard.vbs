Option Explicit
Dim shell, fs, root
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
shell.Run "wscript.exe """ & root & "\Start Dashboard.vbs"" --stop", 0, False
