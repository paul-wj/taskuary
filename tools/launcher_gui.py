"""Source-launcher controls. The server stays independent of this window."""
import ipaddress, json, os, queue, socket, subprocess, sys, threading, time
from pathlib import Path
from urllib.parse import urlsplit, parse_qs


def load_lan(home: Path) -> bool:
    path = home / 'launcher.json'
    if not path.exists(): return False
    return json.loads(path.read_text(encoding='utf-8')).get('lan') is True


def save_lan(home: Path, enabled: bool):
    path = home / 'launcher.json'
    data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    data['lan'] = bool(enabled)
    path.write_text(json.dumps(data) + '\n', encoding='utf-8')


def lan_urls(local: str, addresses: list[str]) -> list[str]:
    port = urlsplit(local).port or 80
    urls = []
    for value in addresses:
        address = ipaddress.ip_address(value)
        if address.version != 4 or address.is_loopback or address.is_unspecified or address.is_link_local or address.is_multicast: continue
        url = f'http://{address}:{port}'
        if url not in urls: urls.append(url)
    return urls


def login_link(local: str, target: str, token: str) -> str:
    from taskuary import launchkey
    link = launchkey.remote_link(local, token)
    key = parse_qs(urlsplit(link).query).get('k', [''])[0]
    if not key: raise RuntimeError('无法生成登录链接：服务未响应或身份验证失败。')
    return f'{target.rstrip("/")}/?{urlsplit(link).query}'


def ready(url: str) -> bool:
    import http.client
    u = urlsplit(url)
    conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=1)
    try:
        conn.request('GET', '/api/health')
        response = conn.getresponse()
        return response.status == 200 and json.loads(response.read()).get('ok') is True
    except (OSError, ValueError, http.client.HTTPException): return False
    finally: conn.close()


class Launcher:
    def __init__(self, window, root: Path):
        import tkinter as tk
        from tkinter import ttk
        from taskuary import config
        self.window, self.root, self.home = window, root, config.home()
        self.events, self.local, self.child = queue.Queue(), '', None
        self.cfg = config.load()
        self.lan = tk.BooleanVar(value=load_lan(self.home))
        self.status = tk.StringVar(value='点击启动；已有实例会直接复用，不会重启正在工作的 Agent。')
        self.address = tk.StringVar()
        window.title('Taskuary 启动器')
        window.geometry('720x350')
        window.minsize(650, 350)
        frame = ttk.Frame(window, padding=20); frame.pack(fill='both', expand=True)
        ttk.Label(frame, text='Taskuary', font=('Segoe UI', 18, 'bold')).pack(anchor='w')
        self.toggle = ttk.Checkbutton(frame, text='允许局域网访问（记住选择，下次启动服务时生效）', variable=self.lan, command=self.preference)
        self.toggle.pack(anchor='w', pady=(14, 8))
        ttk.Label(frame, text='不自动重启服务或修改防火墙。修改后请先在应用中退出，再点击启动。', wraplength=660).pack(anchor='w')
        buttons = ttk.Frame(frame); buttons.pack(fill='x', pady=14)
        self.start_button = ttk.Button(buttons, text='启动 / 刷新状态', command=self.start); self.start_button.pack(side='left')
        self.open_button = ttk.Button(buttons, text='打开本机应用', command=self.open_local, state='disabled'); self.open_button.pack(side='left', padx=8)
        ttk.Label(frame, text='局域网访问地址（可选择网卡）：').pack(anchor='w')
        self.addresses = ttk.Combobox(frame, textvariable=self.address, state='readonly'); self.addresses.pack(fill='x', pady=6)
        self.copy_button = ttk.Button(frame, text='复制一次性登录链接', command=self.copy_link, state='disabled'); self.copy_button.pack(anchor='w')
        ttk.Label(frame, textvariable=self.status, wraplength=660).pack(anchor='w', pady=10)
        ttk.Label(frame, text='登录链接仅限本人使用，2 分钟内有效且只能使用一次。关闭此窗口不会停止服务。', wraplength=660).pack(anchor='w')
        window.after(100, self.drain)

    def preference(self):
        from tkinter import messagebox
        try:
            save_lan(self.home, self.lan.get())
            self.status.set('已保存。正在运行的服务不会改变；请在应用中退出服务后重新启动，勿中断工作中的 Agent。')
        except (OSError, ValueError) as e:
            self.lan.set(not self.lan.get())
            messagebox.showerror('无法保存设置', str(e), parent=self.window)

    def work(self, action, callback):
        self.start_button.configure(state='disabled')
        self.open_button.configure(state='disabled')
        self.copy_button.configure(state='disabled')
        def run():
            try: self.events.put((callback, action(), None))
            except Exception as e: self.events.put((callback, None, str(e)))
        threading.Thread(target=run, daemon=True).start()

    def drain(self):
        try:
            while True:
                callback, result, error = self.events.get_nowait()
                self.start_button.configure(state='normal')
                self.open_button.configure(state='normal' if self.local else 'disabled')
                self.copy_button.configure(state='normal' if self.addresses['values'] else 'disabled')
                if error: self.status.set(error)
                else: callback(result)
        except queue.Empty: pass
        self.window.after(100, self.drain)

    def start(self):
        enabled = self.lan.get()
        self.status.set('正在查找或启动服务，请稍候……')
        self.work(lambda: self.connect(enabled), self.connected)

    def connect(self, enabled):
        from taskuary import config, instance
        from taskuary.cli import public_url
        cfg = config.load()
        held = instance.holder()
        local = held.get('url') or public_url(cfg['server']['host'], cfg['server']['port'])
        if held and not ready(local):
            raise RuntimeError('已有实例正在启动或未响应。请稍后刷新；不会启动第二个实例。')
        if not ready(local):
            if self.child and self.child.poll() is None:
                raise RuntimeError('上次启动仍在进行，请稍后刷新。')
            local = public_url('127.0.0.1', cfg['server']['port'])
            command = [sys.executable, str(self.root / 'tools' / 'start_taskuary.py'), '--no-browser',
                       '--host', '0.0.0.0' if enabled else '127.0.0.1', '--port', str(cfg['server']['port'])]
            options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS} if os.name == 'nt' else {'start_new_session': True}
            with (self.home / 'launcher-server.log').open('ab') as log:
                self.child = subprocess.Popen(command, cwd=self.root, stdin=subprocess.DEVNULL, stdout=log, stderr=log, **options)
            end = time.monotonic() + 120
            while time.monotonic() < end:
                # The CLI may select another port if its preferred port is occupied.
                held = instance.holder()
                candidate = held.get('url') or local
                if ready(candidate): local = candidate; break
                if self.child.poll() is not None:
                    raise RuntimeError(f'启动失败，请查看 {self.home / "launcher-server.log"}')
                time.sleep(.5)
            else: raise RuntimeError(f'服务尚未就绪，请稍后刷新或查看 {self.home / "launcher-server.log"}')
        addresses = [item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)]
        urls = [url for url in lan_urls(local, addresses) if ready(url)]
        return local, urls

    def connected(self, result):
        self.local, urls = result
        self.addresses['values'] = urls
        self.address.set(urls[0] if urls else '')
        self.open_button.configure(state='normal')
        self.copy_button.configure(state='normal' if urls else 'disabled')
        self.status.set(f'服务已就绪：{self.local}。' + ('局域网可访问；在另一台电脑打开复制的登录链接。' if urls else '未检测到可访问的局域网地址；检查监听设置、网卡和防火墙。'))

    def copy_link(self):
        target = self.address.get()
        if not self.local or not target: return
        self.work(lambda: self.make_link(target), self.copied)

    def make_link(self, target):
        from taskuary import config
        return login_link(self.local, target, config.load()['server'].get('token') or '')

    def copied(self, link):
        self.window.clipboard_clear(); self.window.clipboard_append(link)
        self.window.update_idletasks()
        self.status.set('已复制新的登录链接。请在另一台电脑 2 分钟内打开，不要转发给其他人。')

    def open_local(self):
        if not self.local: return
        def open_link(link):
            from taskuary.cli import _open_private
            _open_private(link)
            self.status.set('已在本机浏览器打开应用。')
        self.work(lambda: self.make_link(self.local), open_link)


def main(root: Path):
    import tkinter as tk
    window = tk.Tk()
    Launcher(window, root)
    window.mainloop()
