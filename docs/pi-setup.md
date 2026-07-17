# Raspberry Pi setup — from blank SD card to brewing

Complete path from nothing to a touch panel that boots straight into the
brewery controller, with phone alerts and remote view. Current as of
Raspberry Pi OS **Trixie** (Debian 13, released Oct 2025) on a **Pi 5**.

> **Why the choices below matter on a Pi 5:** the Pi 5 moved GPIO behind
> the RP1 southbridge, which killed every memory-mapped GPIO library
> (pigpio, wiringPi, sysfs). This project uses the kernel character
> device via libgpiod — the supported path — so nothing here fights the
> hardware. The desktop is Wayland with the **labwc** compositor, so
> kiosk autostart goes through `~/.config/labwc/autostart`, not the old
> LXDE files you'll find in stale tutorials.

---

## 1. Flash the SD card

1. Install **Raspberry Pi Imager** on your Mac (`brew install --cask raspberry-pi-imager` or raspberrypi.com/software).
2. Choose device: **Raspberry Pi 5** · OS: **Raspberry Pi OS (64-bit)** — the full desktop image, *not* Lite (the kiosk browser needs the desktop stack).
3. Click the ⚙️ / "Edit settings" before writing:
   - hostname: `brewery`
   - username/password: pick yours (examples below assume `brewer`)
   - Wi-Fi credentials + country (or skip if using Ethernet — Ethernet is more reliable next to VFDs and pumps)
   - enable SSH (password auth is fine on a home LAN)
4. Write the card, boot the Pi, wait for it to appear: `ping brewery.local`

## 2. First login

```bash
ssh brewer@brewery.local
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

## 3. Get the code

```bash
ssh brewer@brewery.local
git clone https://github.com/cmklundt/pi-node-brewery-controller.git brewery
cd brewery
```

## 4. Run the installer

```bash
bash install/install.sh
```

What it does (idempotent — safe to re-run):

| step | what | why |
|---|---|---|
| apt packages | `libgpiod-dev gpiod openssl avahi-daemon` | GPIO char-device lib + headers for the native driver; mDNS so `brewery.local` resolves |
| Node.js 22 LTS | NodeSource repo | Debian's node is old |
| SPI on | `raspi-config nonint do_spi 0` | the four MAX31865s share SPI0 |
| `npm install` + `npm run install:hardware` | app deps + `node-libgpiod`/`spi-device` | the native drivers are optional so dev machines never need them |
| `npm run build` | production UI into `dist/` | the server serves it — one origin for kiosk, laptop, phone |
| TLS cert | self-signed, SANs for `brewery.local` + LAN IP | browsers require HTTPS for service workers / push — see §7 |
| `brewery.service` | systemd unit, `--hardware`, restart-always | server up before the kiosk, restarts on crash, outputs de-energized on stop |
| labwc autostart | Chromium `--kiosk` at `http://localhost:8080` | requirement #2 — panel appears on power-up |
| screen blanking off + desktop autologin | `raspi-config nonint` | a brewery panel that goes dark mid-boil is useless |

Then: `sudo reboot`. The Pi boots to the desktop, Chromium launches
full-screen into the panel, and the server is already running underneath.

## 5. Touchscreen notes (HDMI panel)

- Most 10"+ HDMI panels present touch as a USB HID device — it just works
  under Wayland, including in the kiosk Chromium (`--touch-events=enabled`
  is already in the autostart line).
- If the panel needs a specific resolution, set it in **Screen
  Configuration** once, or add a `video=` kernel arg in
  `/boot/firmware/cmdline.txt`.
- If touch is rotated relative to the display, rotate the *display* in
  Screen Configuration — Wayland rotates the touch matrix with it (this
  used to be two separate fixes under X11).
- Cursor on glass: Chromium hides the pointer after a few seconds of
  touch-only input, so no extra configuration is needed.

## 6. Sanity checks

```bash
systemctl status brewery          # server running?
journalctl -u brewery -f          # live logs (sensor faults show here)
curl -s localhost:8080/healthz    # {"ok":true,"driver":"hardware",...}
gpiodetect                        # should list the RP1 gpiochip
ls /dev/spidev0.*                 # SPI enabled?
```

No shield attached yet? Run the service in sim mode while you bench-test:
`sudo systemctl edit brewery` → override `ExecStart` to drop `--hardware`.

## 7. Phone alerts + remote view (requirements #6 & #7)

Any phone on the same Wi-Fi can open **`http://brewery.local:8080`** and
watch/control everything — that part needs no setup.

**Push notifications** (hop alarms, step changes, timers, faults with the
screen off) need a *secure origin* — browsers refuse service workers and
push on plain HTTP. The installer already created a self-signed cert and
the server listens on **`https://brewery.local:8443`**. One-time phone setup:

1. Grab `data/certs/server.crt` from the Pi
   (`scp brewer@brewery.local:brewery/data/certs/server.crt .`).
2. **iPhone**: AirDrop/email the file → Settings → *Profile Downloaded* →
   Install → then Settings → General → About → Certificate Trust Settings
   → enable full trust.
   **Android**: Settings → Security → Encryption & credentials → Install a
   certificate → CA certificate.
3. On the phone, open **`https://brewery.local:8443`** → share menu →
   **Add to Home Screen** (installs the PWA; on iOS this step is required
   for push, iOS 16.4+).
4. Open the installed app → **Setup** tab → **Enable alerts on this
   device** → allow notifications → **Send test**.

That phone now gets pushes for: hop additions, at-temperature, step
complete, brew complete, timer done, temp deviation (>4°F for 2 min),
sensor faults. Alert rules live in the config (`alerts` block).

**Remote view from outside your LAN** is deliberately not exposed — don't
port-forward a brewery. If you want it later, Tailscale on the Pi and the
phone is the sane path (`curl -fsSL https://tailscale.com/install.sh | sh`),
and push/HTTPS work unchanged over it.

## 8. Day-2 operations

```bash
# update the app
cd ~/brewery && git pull && npm install && npm run build && sudo systemctl restart brewery

# watch a brew from your laptop
open http://brewery.local:8080

# back up config + brew logs (everything lives in data/)
scp -r brewer@brewery.local:brewery/data ./brewery-backup
```

- **Config** (sensors, outputs, vessels, controllers, recipe) is
  `data/config.json`, editable in the Setup tab; the engine hot-reloads.
- **Brew session logs** are append-only JSONL in `data/sessions/`, one per
  brew, downloadable as CSV from the Reports tab.
- The systemd unit de-energizes every output on stop/crash/reboot — and
  remember the real safety is the hardware interlock + panel wiring, never
  software.

## Troubleshooting

| symptom | check |
|---|---|
| kiosk doesn't launch | `cat ~/.config/labwc/autostart`; make sure you're booting to desktop w/ autologin (`raspi-config` → System → Boot) |
| white screen in kiosk | server not up yet? `systemctl status brewery`; the SW cache will paint last-known UI once it's been loaded once |
| all probes read fault | SPI off (`ls /dev/spidev0.*`), or ref resistor mismatch — config says 430 Ω (PT100) |
| one probe faults | its CS wiring, or probe leads; fault bits are logged in `journalctl -u brewery` |
| GPIO "permission denied" | user not in `gpio` group (log out/in after install), or another process holds the line (`gpioinfo`) |
| push "not allowed" on phone | not on HTTPS, cert not trusted, or (iOS) PWA not added to home screen |
| `brewery.local` doesn't resolve | avahi not running, or client is Android (some builds lack mDNS — use the raw IP) |
