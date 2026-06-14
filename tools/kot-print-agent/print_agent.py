"""
Sochmat KOT print agent.

Runs on the shop's Windows PC next to the thermal printer. Polls the server for
confirmed orders that have not been printed yet, prints a KOT for each via
ESC/POS, then acks the server so the order is not printed again.

Setup:
    pip install -r requirements.txt
    copy .env.example .env   # then edit values

Run:
    python print_agent.py            # normal: prints to the configured printer
    python print_agent.py --dry-run  # render tickets to the console, no printer
    python print_agent.py --once     # process the current queue once, then exit
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone, timedelta

import requests

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    # python-dotenv is optional; env vars can also be set in the shell.
    pass

SERVER_URL = os.environ.get("SERVER_URL", "http://localhost:3000").rstrip("/")
TOKEN = os.environ.get("PRINT_AGENT_TOKEN", "")
PRINTER_NAME = os.environ.get("PRINTER_NAME", "POS-80")
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "5"))
SHOP_NAME = os.environ.get("SHOP_NAME", "SOCHMAT")

# Shop local time (Asia/Kolkata = UTC+5:30) for the printed timestamp.
IST = timezone(timedelta(hours=5, minutes=30))

LINE_WIDTH = 32  # characters for an 80mm printer at font A


def fmt_local(iso_value):
    """Format a server ISO timestamp into shop-local dd/mm/yy HH:MM."""
    if not iso_value:
        return datetime.now(IST).strftime("%d/%m/%y %H:%M")
    try:
        # Accept both "...Z" and offset-aware ISO strings.
        cleaned = str(iso_value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(IST).strftime("%d/%m/%y %H:%M")
    except Exception:
        return datetime.now(IST).strftime("%d/%m/%y %H:%M")


def render_lines(ticket):
    """Return the KOT as a list of (text, attrs) tuples for ESC/POS rendering.

    attrs is a dict the printer backend understands: {align, bold, double}.
    The same structure is reused by --dry-run to print to the console.
    """
    lines = []

    def center(text, **attrs):
        lines.append((text, {"align": "center", **attrs}))

    def left(text, **attrs):
        lines.append((text, {"align": "left", **attrs}))

    kot_no = ticket.get("kotNumber")
    kot_label = f"KOT - {kot_no}" if kot_no is not None else "KOT"

    center(SHOP_NAME, bold=True, double=True)
    center(fmt_local(ticket.get("createdAt")))
    center(kot_label, bold=True, double=True)
    center(ticket.get("orderNumber", ""))
    center("Delivery")
    left("-" * LINE_WIDTH)
    left(f"{'Item':<{LINE_WIDTH - 4}}{'Qty':>4}")
    left("-" * LINE_WIDTH)

    for item in ticket.get("items", []):
        qty = str(item.get("quantity", 0))
        name = str(item.get("name", ""))
        # Wrap long item names across lines; qty sits on the first line.
        name_width = LINE_WIDTH - 4
        chunks = [name[i : i + name_width] for i in range(0, len(name), name_width)] or [""]
        left(f"{chunks[0]:<{name_width}}{qty:>4}", bold=True)
        for extra in chunks[1:]:
            left(extra, bold=True)

    left("-" * LINE_WIDTH)
    payment = ticket.get("paymentStatus", "")
    method = ticket.get("paymentMethod", "")
    pay_line = f"Payment : {method} ({payment})" if method else f"Payment : {payment}"
    left(pay_line)

    receiver = ticket.get("receiver", {}) or {}
    cust = receiver.get("name", "")
    phone = receiver.get("phone", "")
    left(f"Customer: {cust} {phone}".rstrip())
    addr = receiver.get("address", "")
    if addr:
        left("Address :")
        for i in range(0, len(addr), LINE_WIDTH - 2):
            left("  " + addr[i : i + LINE_WIDTH - 2])

    left("-" * LINE_WIDTH)
    total = ticket.get("totalAmount", 0)
    left(f"Total   : Rs. {total}", bold=True)
    return lines


def print_to_console(ticket):
    print("=" * LINE_WIDTH)
    for text, attrs in render_lines(ticket):
        prefix = ""
        if attrs.get("align") == "center":
            text = text.center(LINE_WIDTH)
        if attrs.get("bold"):
            prefix = "*"
        print(prefix + text)
    print("=" * LINE_WIDTH)
    print()


def print_to_printer(ticket):
    from escpos.printer import Win32Raw

    p = Win32Raw(PRINTER_NAME)
    for text, attrs in render_lines(ticket):
        p.set(
            align=attrs.get("align", "left"),
            bold=bool(attrs.get("bold")),
            double_height=bool(attrs.get("double")),
            double_width=bool(attrs.get("double")),
        )
        p.text(text + "\n")
    p.set(align="left", bold=False, double_height=False, double_width=False)
    p.text("\n")
    p.cut()


def fetch_queue():
    resp = requests.get(
        f"{SERVER_URL}/api/print/kot",
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("tickets", []) if data.get("success") else []


def ack(order_id):
    resp = requests.post(
        f"{SERVER_URL}/api/print/kot",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        json={"id": order_id},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("success", False)


def process_once(dry_run):
    tickets = fetch_queue()
    if not tickets:
        return 0
    printed = 0
    for ticket in tickets:
        try:
            if dry_run:
                print_to_console(ticket)
            else:
                print_to_printer(ticket)
        except Exception as exc:
            # Printing failed -> do NOT ack, so it is retried next poll.
            print(f"[error] print failed for {ticket.get('orderNumber')}: {exc}")
            continue
        try:
            ack(ticket["id"])
            printed += 1
            print(f"[ok] printed KOT {ticket.get('kotNumber')} ({ticket.get('orderNumber')})")
        except Exception as exc:
            # Printed but ack failed -> may reprint once next poll. Acceptable.
            print(f"[warn] printed but ack failed for {ticket.get('orderNumber')}: {exc}")
    return printed


SAMPLE_TICKET = {
    "id": "sample",
    "orderNumber": "SO-TEST-0001",
    "kotNumber": 1,
    "createdAt": None,
    "paymentMethod": "upi",
    "paymentStatus": "paid",
    "totalAmount": 449,
    "receiver": {
        "name": "Test Customer",
        "phone": "9876543210",
        "address": "12 MG Road, Indiranagar, Bengaluru 560038",
    },
    "items": [
        {"name": "Veg Beetroot Burger", "quantity": 1, "price": 199},
        {"name": "Diet Coke (300ml)", "quantity": 1, "price": 50},
        {"name": "Chole Masala Rice Bowl (large)", "quantity": 1, "price": 200},
    ],
}


def main():
    parser = argparse.ArgumentParser(description="Sochmat KOT print agent")
    parser.add_argument("--dry-run", action="store_true", help="render to console, no printer")
    parser.add_argument("--once", action="store_true", help="process queue once and exit")
    parser.add_argument(
        "--test",
        action="store_true",
        help="print one sample KOT (to the printer, or console with --dry-run) and exit; no server/token needed",
    )
    args = parser.parse_args()

    # --test verifies the printer/render only; it does not touch the server.
    if args.test:
        if args.dry_run:
            print_to_console(SAMPLE_TICKET)
        else:
            print_to_printer(SAMPLE_TICKET)
            print(f"[ok] sample KOT sent to printer '{PRINTER_NAME}'")
        return

    if not TOKEN:
        print("[fatal] PRINT_AGENT_TOKEN is not set (see .env.example)")
        sys.exit(1)

    mode = "dry-run" if args.dry_run else f"printer '{PRINTER_NAME}'"
    print(f"KOT agent -> {SERVER_URL} | {mode} | poll {POLL_INTERVAL}s")

    if args.once:
        process_once(args.dry_run)
        return

    while True:
        try:
            process_once(args.dry_run)
        except Exception as exc:
            print(f"[error] poll failed: {exc}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
