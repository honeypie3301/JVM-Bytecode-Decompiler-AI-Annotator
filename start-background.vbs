' JadAI Background Silent Launcher (Path Dynamic)
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = projectDir
serverFile = projectDir & "\dist\server.cjs"
nodeExe = "node.exe"
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeExe = "C:\Program Files\nodejs\node.exe"
End If

If Not fso.FileExists(serverFile) Then
  WshShell.Run "cmd.exe /c npm run build", 0, True
End If

WshShell.Environment("Process")("NODE_ENV") = "production"
WshShell.Environment("Process")("JADAI_PORT") = "4730"
WshShell.Environment("Process")("PORT") = "4730"
If fso.FileExists(serverFile) Then
  WshShell.Run """" & nodeExe & """ --expose-gc --max-old-space-size=512 dist/server.cjs", 0, False
Else
  WshShell.Run "cmd.exe /c npx tsx server.ts", 0, False
End If
