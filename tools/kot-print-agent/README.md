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
- Layout targets an **80mm** printer: the KOT prints in **font A** at
  `LINE_WIDTH` (32) columns, and the bill in the smaller **font B** at
  `BILL_WIDTH` (42) columns. Thermal printers only have these two built-in
  fonts, so font size isn't continuously adjustable.
