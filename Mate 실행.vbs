Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
electron = folder & "\node_modules\electron\dist\electron.exe"
builtPage = folder & "\dist\index.html"

If Not fs.FileExists(electron) Then
  MsgBox "Mate 실행 파일을 찾을 수 없습니다." & vbCrLf & vbCrLf & "README의 설치 명령을 먼저 실행해 주세요.", 16, "Mate 실행 오류"
  WScript.Quit 1
End If

If Not fs.FileExists(builtPage) Then
  MsgBox "Mate 빌드 파일을 찾을 수 없습니다." & vbCrLf & vbCrLf & "PowerShell에서 npm run build를 먼저 실행해 주세요.", 16, "Mate 실행 오류"
  WScript.Quit 1
End If

shell.CurrentDirectory = folder
shell.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
On Error Resume Next
shell.Run Chr(34) & electron & Chr(34) & " " & Chr(34) & folder & Chr(34), 0, False
If Err.Number <> 0 Then
  MsgBox "Mate를 시작하지 못했습니다." & vbCrLf & vbCrLf & Err.Description, 16, "Mate 실행 오류"
  WScript.Quit 1
End If
