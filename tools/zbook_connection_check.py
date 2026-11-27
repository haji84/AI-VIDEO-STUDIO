"""Local Windows Tailscale check. No install, settings change, upload or raw log export."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import threading
import webbrowser

DOWNLOAD_URL = 'https://tailscale.com/download/windows'
STATES = {'Running', 'Stopped', 'NeedsLogin', 'NeedsMachineAuth', 'Starting', 'NoState', 'InUseOtherUser'}


def summarize_status(payload):
    """Only the device's own connection coordinates; never peers, accounts or keys."""
    if not isinstance(payload, dict):
        raise ValueError('invalid status object')
    state = payload.get('BackendState')
    state = state if isinstance(state, str) and state in STATES else 'UNKNOWN'
    own = payload.get('Self')
    own = own if isinstance(own, dict) else {}
    online = own.get('Online')
    online = online if type(online) is bool else None
    addresses = []
    raw = own.get('TailscaleIPs', payload.get('TailscaleIPs', []))
    if isinstance(raw, list):
        for value in raw[:16]:
            try:
                address = ipaddress.ip_address(value)
            except (ValueError, TypeError):
                continue
            network = ipaddress.ip_network('100.64.0.0/10') if address.version == 4 else ipaddress.ip_network('fd7a:115c:a1e0::/48')
            if address in network:
                addresses.append(str(address))
    dns = own.get('DNSName', '')
    if not isinstance(dns, str) or len(dns) > 254 or not re.fullmatch(r'[A-Za-z0-9.-]+\.ts\.net\.?', dns):
        dns = ''
    return {'schema': 'zbook-connection-check-v1', 'os': 'Windows',
            'tailscaleDetected': True, 'state': state, 'selfOnline': online,
            'deviceDns': dns.rstrip('.'), 'deviceIps': addresses,
            'deviceConnectionObserved': state == 'Running' and online is True,
            'codexConnection': 'NOT_TESTED'}


def locate(name):
    # Standard protected installation locations only, never Downloads or cwd.
    for variable, fallback in [('ProgramFiles', r'C:\Program Files'), ('ProgramFiles(x86)', r'C:\Program Files (x86)')]:
        path = Path(os.environ.get(variable, fallback)) / 'Tailscale' / name
        if path.is_file():
            return path
    return None


def collect():
    if platform.system() != 'Windows':
        return {'schema': 'zbook-connection-check-v1', 'os': platform.system(),
                'state': 'WINDOWS_REQUIRED', 'codexConnection': 'NOT_TESTED'}
    executable = locate('tailscale.exe')
    if executable is None:
        return {'schema': 'zbook-connection-check-v1', 'os': 'Windows',
                'tailscaleDetected': False, 'state': 'NOT_DETECTED', 'codexConnection': 'NOT_TESTED'}
    try:
        result = subprocess.run([str(executable), 'status', '--json'],
                                stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=8,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if len(result.stdout) > 4 * 1024 * 1024:
            raise ValueError('status too large')
        return summarize_status(json.loads(result.stdout))
    except (OSError, subprocess.TimeoutExpired, ValueError, RecursionError):
        # Never export raw stderr, login links, account names, command lines or keys.
        return {'schema': 'zbook-connection-check-v1', 'os': 'Windows',
                'tailscaleDetected': True, 'state': 'STATUS_UNAVAILABLE', 'codexConnection': 'NOT_TESTED'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='print the sanitized report without opening a window')
    args = parser.parse_args()
    if args.check:
        result = collect()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get('deviceConnectionObserved') else 2
    if platform.system() != 'Windows':
        print('Run this helper on the Windows ZBook. The cloud machine cannot establish the first device login.')
        return 2
    import tkinter as tk
    from tkinter import messagebox
    root = tk.Tk()
    root.title('ZBook 接続の確認')
    root.geometry('760x560')
    tk.Label(root, text='ZBookの接続状況を確認します', font=('', 16)).pack(pady=12)
    tk.Label(root, text='設定変更・動画送信は行いません。Tailscaleの本人ログインは公式アプリで操作します。', wraplength=700).pack()
    message = tk.StringVar(value='確認中…')
    tk.Label(root, textvariable=message, wraplength=700, justify='left').pack(pady=12)
    output = tk.Text(root, height=14, wrap='word')
    output.pack(fill='both', expand=True, padx=16)
    report = {}
    descriptions = {
        'NOT_DETECTED': '標準の導入先ではTailscaleを検出できません。「Tailscaleを開く」で公式導入ページを開けます。',
        'NeedsLogin': '本人ログインが必要です。「Tailscaleを開く」からログインし、その後「状態を再確認」を押してください。',
        'NeedsMachineAuth': 'Tailscale側で端末の承認が必要です。所有者の管理画面で確認してください。',
        'Stopped': 'Tailscaleが停止中です。公式アプリで接続を選び、その後「状態を再確認」を押してください。',
        'STATUS_UNAVAILABLE': '状態を取得できません。公式アプリを開き、起動・ログイン状態を確認してください。',
    }
    def show(result):
        report.clear(); report.update(result)
        connected = result.get('deviceConnectionObserved') is True
        text = ('ZBook側のTailscale接続を確認しました。Codex側との接続は別途確認が必要です。\n'
                '「診断結果をコピー」を押し、チャットへ返信してください。') if connected else descriptions.get(result.get('state'), '公式アプリで状態を確認し、「状態を再確認」を押してください。')
        message.set(text)
        output.configure(state='normal'); output.delete('1.0', 'end')
        output.insert('1.0', json.dumps(result, ensure_ascii=False, indent=2)); output.configure(state='disabled')
        refresh.configure(state='normal')
    def check():
        refresh.configure(state='disabled'); message.set('確認中…（最大8秒）')
        def run():
            result = collect(); root.after(0, lambda: show(result))
        threading.Thread(target=run, daemon=True).start()
    def open_client():
        client = locate('tailscale-ipn.exe')
        try:
            if client is not None: os.startfile(str(client))
            else: webbrowser.open(DOWNLOAD_URL)
            message.set('Tailscaleの画面、またはWindowsの通知領域アイコンからログインしてください。終わったら「状態を再確認」を押します。')
        except OSError:
            messagebox.showerror('起動できません', 'WindowsのスタートからTailscaleを開いてください。')
    def copy():
        if not report: return
        root.clipboard_clear(); root.clipboard_append(json.dumps(report, ensure_ascii=False, indent=2))
        message.set('診断結果をコピーしました。このチャットに貼り付けて返信できます。パスワードや認証キーは含めていません。')
    buttons = tk.Frame(root); buttons.pack(pady=12)
    tk.Button(buttons, text='Tailscaleを開く', command=open_client).pack(side='left', padx=6)
    refresh = tk.Button(buttons, text='状態を再確認', command=check); refresh.pack(side='left', padx=6)
    tk.Button(buttons, text='診断結果をコピー', command=copy).pack(side='left', padx=6)
    root.after(50, check); root.mainloop()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
