import {execFile} from 'node:child_process';
import {win32} from 'node:path';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const openWindowsUrl = '$target = $env:AIVS_BROWSER_URL; Remove-Item Env:AIVS_BROWSER_URL; Start-Process -FilePath $target -ErrorAction Stop';

function checkedBrowserUrl(address) {
  const url = new URL(address);
  const local = url.protocol === 'http:' && url.hostname === '127.0.0.1';
  if (url.username || url.password || (!local && url.origin !== 'https://accounts.google.com')) {
    throw new Error('INVALID_SYSTEM_BROWSER_URL');
  }
  return url.href;
}

export function createSystemBrowserOpener({platform = process.platform, environment = process.env, execute = exec} = {}) {
  if (platform === 'darwin') {
    return async address => execute('/usr/bin/open', [checkedBrowserUrl(address)], {timeout: 10000});
  }
  if (platform === 'win32') {
    const powershell = win32.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    return async address => execute(powershell, ['-NoProfile', '-NonInteractive', '-Command', openWindowsUrl], {
      env: {...environment, AIVS_BROWSER_URL: checkedBrowserUrl(address)}, timeout: 10000, windowsHide: true,
    });
  }
}
