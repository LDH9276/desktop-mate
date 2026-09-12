import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const windows=process.env.WINDIR || 'C:\\Windows';
const gac=path.join(windows,'Microsoft.NET/assembly/GAC_MSIL');
const references=['UIAutomationClient','UIAutomationTypes','WindowsBase'].map(name=>{
  const dir=path.join(gac,name);
  const match=readdirSync(dir).map(version=>path.join(dir,version,name+'.dll')).find(existsSync);
  if(!match)throw new Error(`Windows assembly not found: ${name}`);
  return '/reference:'+match;
});
execFileSync(path.join(windows,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),[
  '/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll',...references,
  '/out:'+path.join(root,'native/ChatBridge.exe'),path.join(root,'native/ChatBridge.cs'),path.join(root,'native/ComposerGuard.cs'),path.join(root,'native/TranscriptGuard.cs'),
],{cwd:root,stdio:'inherit',windowsHide:true});
console.log('Windows accessibility bridge compiled.');
