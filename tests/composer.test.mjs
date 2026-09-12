import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('native composer guard distinguishes empty markers, placeholders, drafts and multiline text',{skip:process.platform!=='win32'},()=>{
  mkdirSync(path.join(root,'artifacts'),{recursive:true});
  const output=path.join(mkdtempSync(path.join(root,'artifacts','composer-test-')),'ComposerGuardTests.exe');
  execFileSync(path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),[
    '/nologo','/target:exe','/platform:x64','/out:'+output,
    path.join(root,'native/ComposerGuard.cs'),path.join(root,'native/TranscriptGuard.cs'),path.join(root,'tests/ComposerGuardTests.cs'),
  ],{cwd:root,windowsHide:true,stdio:'pipe'});
  process.stdout.write(execFileSync(output,[],{windowsHide:true,encoding:'utf8'}));
});
