# KOT / Bill Print Agent

Runs on the shop's **Windows PC** next to the thermal printer. It polls the
Sochmat server for work and prints via ESC/POS, then tells the server it's done:

- **KOT** — printed automatically when an order is accepted.
- **Bill** — printed on demand when an admin clicks "Print Bill".

```
Admin clicks "Accept"  ->  order.status = confirmed + KOT number assigned
Admin clicks "Print Bill"  ->  bill number assigned + order flagged for bill
                           |
   this agent polls  GET /api/print/kot  and  GET /api/print/bill
                           |
   prints  ->  POST /api/print/<kot|bill> { id }  (marks it printed)
```

## Server setup (once)

Set the shared secret on the deployed site (same value the agent uses):

```
PRINT_AGENT_TOKEN=<a long random string>
```

## Windows PC setup

1. Install Python 3.9+ from python.org (tick "Add to PATH").
2. Install the printer driver and note its name in **Devices & Printers**
   (e.g. `POS-80`).
3. In this folder:

   ```
   pip install -r requirements.txt
   copy .env.example .env
   ```

   Edit `.env` — set `SERVER_URL`, `PRINT_AGENT_TOKEN` (must match the server),
   and `PRINTER_NAME`. For bills, also set `FSSAI_NO`, `GST_NO`,
   `SHOP_LEGAL_NAME`, `SHOP_CONTACT`, and `SHOP_ADDRESS` (printed on the bill).

## Run

```
python print_agent.py            # poll forever and print
python print_agent.py --dry-run  # render tickets to the console (no printer)
python print_agent.py --once     # process the current queue once, then exit
python print_agent.py --test      # print one sample KOT on the printer, then exit
python print_agent.py --test-bill # print one sample bill on the printer, then exit
```

`--test` / `--test-bill` print a built-in sample — use them to confirm the
printer and paper work without needing a real order or the server (no token
required). Add `--dry-run` to send the sample to the console instead:

```
python print_agent.py --test            # sample KOT  -> printer
python print_agent.py --test --dry-run  # sample KOT  -> console
python print_agent.py --test-bill --dry-run  # sample bill -> console
```

Then test the full flow with `--dry-run`: accept an order in the admin panel
and confirm the ticket shows up in the console.

## Keep it running on the shop PC

For unattended use you want it to **start on boot** and **restart if it
crashes**. `run.bat` (in this folder) handles the restart part: it runs the
agent in a loop, logs to `print_agent.log`, and relaunches 5s after any exit.
It auto-detects a `.venv` here, otherwise uses the system `python`.

### Recommended: Task Scheduler at logon

A printer installed for the shop user is reliably reachable when the agent runs
in that user's session, so a logon task is better than a SYSTEM service.

1. Set the PC to **auto-login** to the shop user (so it reaches the desktop
   after a reboot) and set power options to **never sleep**.
2. **Task Scheduler → Create Task** (not "Basic"):
   - **General:** "Run only when user is logged on", "Run with highest privileges".
   - **Triggers:** New → *At log on* → the shop user.
   - **Actions:** New → Program = full path to `run.bat`
     (e.g. `C:\sochmat\tools\kot-print-agent\run.bat`).
   - **Settings:** "If the task fails, restart every 1 minute"; uncheck "Stop the
     task if it runs longer than…".
3. Reboot to confirm it comes up by itself.

Simpler alternative: drop a shortcut to `run.bat` in the Startup folder
(`Win+R` → `shell:startup`). `run.bat` still restarts the agent on crash.

### Alternative: Windows service (NSSM)

Runs even with no one logged in, but a SYSTEM service often can't see a
per-user-installed printer — install the printer "for all users", or set the
service to log on as the shop user.

```
nssm install SochmatPrintAgent "C:\path\to\.venv\Scripts\python.exe" "C:\path\to\print_agent.py"
nssm set SochmatPrintAgent AppDirectory "C:\path\to\tools\kot-print-agent"
nssm set SochmatPrintAgent AppExit Default Restart
nssm start SochmatPrintAgent
```

## Behaviour notes

- If a print **fails**, the agent does **not** ack, so the order stays in the
  queue and is retried on the next poll.
- If a print **succeeds but the ack fails** (network blip), the order may print
  once more on the next poll. This is intentionally kept simple.
- KOT numbers are a per-day sequence assigned by the server when the order is
  accepted, and reset each day (Asia/Kolkata).
- Layout targets an **80mm** printer. Both the KOT and the bill are printed as
  **images** so their font sizes are adjustable beyond the printer's built-in
  fonts — tune `KOT_FONT_PX` / `BILL_FONT_PX` (lower = smaller). On the KOT the
  shop name and KOT number scale up automatically. Preview a size without a
  printer:
  `python print_agent.py --save-kot-image sample.png` (or `--save-bill-image`).
  Set `KOT_AS_IMAGE=0` / `BILL_AS_IMAGE=0` for plain text; if an image is cut
  off, try `KOT_IMG_WIDTH=512` / `BILL_IMG_WIDTH=512`.
