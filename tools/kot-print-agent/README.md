# KOT Print Agent

Runs on the shop's **Windows PC** next to the thermal printer. It polls the
Sochmat server for **confirmed** orders that haven't been printed yet, prints a
KOT for each via ESC/POS, then tells the server it's done so the order isn't
printed twice.

```
Admin clicks "Accept"  ->  order.status = confirmed + KOT number assigned
                           |
   this agent polls  GET  /api/print/kot   (every POLL_INTERVAL seconds)
                           |
   prints ticket  ->  POST /api/print/kot { id }  (marks kotPrinted)
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
   and `PRINTER_NAME`.

## Run

```
python print_agent.py            # poll forever and print
python print_agent.py --dry-run  # render tickets to the console (no printer)
python print_agent.py --once     # process the current queue once, then exit
python print_agent.py --test     # print one sample KOT on the printer, then exit
```

`--test` prints a built-in sample ticket — use it to confirm the printer and
paper work without needing a real order or the server (no token required). Add
`--dry-run` to send the sample to the console instead:

```
python print_agent.py --test            # sample -> printer
python print_agent.py --test --dry-run  # sample -> console
```

Then test the full flow with `--dry-run`: accept an order in the admin panel
and confirm the ticket shows up in the console.

## Run on boot (optional)

Use **Task Scheduler** → Create Task → Trigger: *At log on* → Action:
`python` with argument `C:\path\to\print_agent.py`, "Start in" set to this
folder. Set it to restart on failure.

## Behaviour notes

- If a print **fails**, the agent does **not** ack, so the order stays in the
  queue and is retried on the next poll.
- If a print **succeeds but the ack fails** (network blip), the order may print
  once more on the next poll. This is intentionally kept simple.
- KOT numbers are a per-day sequence assigned by the server when the order is
  accepted, and reset each day (Asia/Kolkata).
