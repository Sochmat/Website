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
import textwrap
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
ORDER_SOURCE = os.environ.get("ORDER_SOURCE", "Website")
FSSAI_NO = os.environ.get("FSSAI_NO", "")
GST_NO = os.environ.get("GST_NO", "")

# Used on the customer bill only.
SHOP_LEGAL_NAME = os.environ.get("SHOP_LEGAL_NAME", "Sochmat - by fitfuel")
SHOP_CONTACT = os.environ.get("SHOP_CONTACT", "")
SHOP_ADDRESS = os.environ.get("SHOP_ADDRESS", "")
CASHIER = os.environ.get("CASHIER", "biller")

# Vertical line spacing (in dots) used for the bill only, to make it more
# compact. The printer default is ~30; lower = tighter lines. Font B glyphs are
# 17 dots tall, so keep this above ~18 to avoid overlapping text.
BILL_LINE_SPACING = int(os.environ.get("BILL_LINE_SPACING", "22"))

# The bill is rendered as an image so its font can be smaller than the printer's
# built-in font B. Lower BILL_FONT_PX = smaller text. BILL_IMG_WIDTH is the
# printer's printable width in dots (576 for most 80mm heads). Set
# BILL_AS_IMAGE=0 to fall back to plain text (font B) printing.
BILL_AS_IMAGE = os.environ.get("BILL_AS_IMAGE", "1") not in ("0", "false", "False")
BILL_FONT_PX = int(os.environ.get("BILL_FONT_PX", "17"))
BILL_IMG_WIDTH = int(os.environ.get("BILL_IMG_WIDTH", "576"))

# Shop local time (Asia/Kolkata = UTC+5:30) for the printed timestamp.
IST = timezone(timedelta(hours=5, minutes=30))

LINE_WIDTH = 32  # characters for an 80mm printer at font A
BILL_WIDTH = 42  # characters at the smaller font B (used for the bill)


def line_width(attrs):
    """Columns available for a line given its font."""
    return BILL_WIDTH if attrs.get("font") == "b" else LINE_WIDTH


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

    Rendered in font A on an 80mm printer (LINE_WIDTH columns).
    attrs is a dict the backend understands: {align, font, bold, double}.
    The same structure is reused by --dry-run to print to the console.
    """
    w = LINE_WIDTH
    lines = []

    def center(text, **attrs):
        lines.append((text, {"align": "center", **attrs}))

    def left(text, **attrs):
        lines.append((text, {"align": "left", **attrs}))

    kot_no = ticket.get("kotNumber")
    kot_label = f"KOT - {kot_no}" if kot_no is not None else "KOT"

    center(f"From: {ORDER_SOURCE}", bold=True)
    center(SHOP_NAME, bold=True, double=True)
    center(fmt_local(ticket.get("createdAt")))
    center(kot_label, bold=True, double=True)
    center(f"Order ID: {ticket.get('orderNumber', '')}")
    center(f"Method: {ticket.get('method', 'Delivery')}", bold=True)
    left("-" * w)
    left(f"{'Item':<{w - 4}}{'Qty':>4}")
    left("-" * w)

    for item in ticket.get("items", []):
        qty = str(item.get("quantity", 0))
        name = str(item.get("name", ""))
        # Wrap long item names across lines; qty sits on the first line.
        name_width = w - 4
        chunks = [name[i : i + name_width] for i in range(0, len(name), name_width)] or [""]
        left(f"{chunks[0]:<{name_width}}{qty:>4}", bold=True)
        for extra in chunks[1:]:
            left(extra, bold=True)

    left("-" * w)
    payment = ticket.get("paymentStatus", "")
    method = ticket.get("paymentMethod", "")
    pay_line = f"Payment : {method} ({payment})" if method else f"Payment : {payment}"
    left(pay_line)

    receiver = ticket.get("receiver", {}) or {}
    cust = receiver.get("name", "")
    phone = receiver.get("phone", "")
    left(f"Customer: {cust} {phone}".rstrip())

    left("-" * w)
    total = ticket.get("totalAmount", 0)
    left(f"Total   : Rs. {total}", bold=True)

    if FSSAI_NO or GST_NO:
        left("-" * w)
        if FSSAI_NO:
            center(f"FSSAI No: {FSSAI_NO}")
        if GST_NO:
            center(f"GST No: {GST_NO}")
    return lines


def render_bill_lines(bill):
    """Return the customer bill as a list of (text, attrs) tuples.

    Rendered in the printer's smaller font B (BILL_WIDTH columns).
    """
    w = BILL_WIDTH
    lines = []

    def center(text, **attrs):
        lines.append((text, {"align": "center", "font": "b", **attrs}))

    def left(text, **attrs):
        lines.append((text, {"align": "left", "font": "b", **attrs}))

    def row(label, value, **attrs):
        # label on the left, value right-aligned within the line width
        space = max(1, w - len(label) - len(value))
        left(label + " " * space + value, **attrs)

    paid = str(bill.get("paymentStatus", "")).lower() == "paid"

    center("PAID" if paid else "UNPAID", bold=True)
    center("Duplicate")
    center(SHOP_LEGAL_NAME, bold=True)
    if GST_NO:
        center(f"GST No:-{GST_NO}")
    if FSSAI_NO:
        center(f"FSSAI:-{FSSAI_NO}")

    left("-" * w)
    left(f"From {ORDER_SOURCE}[{bill.get('orderNumber', '')}]")
    left(f"Name: {(bill.get('receiver') or {}).get('name', '')}")

    left("-" * w)
    date_part, _, time_part = fmt_local(bill.get("createdAt")).partition(" ")
    row(f"Date: {date_part}", str(bill.get("method", "Delivery")))
    left(time_part)
    bill_no = bill.get("billNumber")
    row(f"Cashier: {CASHIER}", f"Bill No.: {bill_no if bill_no is not None else '-'}")

    left("-" * w)
    row("Item", "Qty x Price   Amount")
    left("-" * w)

    total_qty = 0
    for item in bill.get("items", []):
        qty = int(item.get("quantity", 0))
        price = float(item.get("price", 0))
        amount = price * qty
        total_qty += qty
        name = str(item.get("name", ""))
        for i in range(0, len(name), w):
            left(name[i : i + w], bold=True)
        row(f"  {qty} x {price:.2f}", f"{amount:.2f}")

    left("-" * w)
    sub = float(bill.get("subTotal", 0))
    discount = float(bill.get("discountAmount", 0))
    delivery_fee = float(bill.get("deliveryFee", 0))
    tax = float(bill.get("tax", 0))
    cgst = round(tax / 2, 2)
    sgst = round(tax - cgst, 2)
    grand = float(bill.get("totalAmount", 0))

    row("Sub Total", f"{sub:.2f}")
    if discount:
        row("Discount", f"({discount:.2f})")
    if delivery_fee:
        row("Delivery Charge", f"{delivery_fee:.2f}")
    if cgst:
        row("CGST @2.5%", f"{cgst:.2f}")
    if sgst:
        row("SGST @2.5%", f"{sgst:.2f}")

    round_off = grand - (sub - discount + delivery_fee + cgst + sgst)
    if abs(round_off) >= 0.01:
        row("Round off", f"{round_off:+.2f}")

    left("-" * w)
    row("Grand Total", f"Rs. {grand:.2f}", bold=True)
    left(f"Total Qty: {total_qty}")
    method = str(bill.get("paymentMethod", "")).title()
    left(f"Paid via {method}" if paid else f"Payment: {bill.get('paymentStatus', '')}")

    if SHOP_CONTACT or SHOP_ADDRESS:
        left("-" * w)
        if SHOP_CONTACT:
            center(f"Contact:- {SHOP_CONTACT}")
        for chunk in textwrap.wrap(SHOP_ADDRESS, w):
            center(chunk)
    center("Thanks for Ordering....!!")
    return lines


def print_to_console(lines):
    border = max((line_width(a) for _, a in lines), default=LINE_WIDTH)
    print("=" * border)
    for text, attrs in lines:
        prefix = ""
        if attrs.get("align") == "center":
            text = text.center(line_width(attrs))
        if attrs.get("bold"):
            prefix = "*"
        print(prefix + text)
    print("=" * border)
    print()


def print_to_printer(lines, line_spacing=None):
    from escpos.printer import Win32Raw

    p = Win32Raw(PRINTER_NAME)
    if line_spacing is not None:
        # ESC 3 n -> set line spacing to n dots (tighter than default).
        p._raw(b"\x1b\x33" + bytes([max(0, min(255, int(line_spacing)))]))
    for text, attrs in lines:
        p.set(
            align=attrs.get("align", "left"),
            font=attrs.get("font", "a"),
            bold=bool(attrs.get("bold")),
            double_height=bool(attrs.get("double")),
            double_width=bool(attrs.get("double")),
        )
        p.text(text + "\n")
    p.set(
        align="left", font="a", bold=False, double_height=False, double_width=False
    )
    if line_spacing is not None:
        p._raw(b"\x1b\x32")  # ESC 2 -> restore default line spacing
    p.text("\n")
    p.cut()


def _load_mono_font(px):
    from PIL import ImageFont

    # Prefer a real monospace TTF; fall back to Pillow's scalable default.
    for path in (
        "consola.ttf",
        "cour.ttf",
        r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\cour.ttf",
    ):
        try:
            return ImageFont.truetype(path, px)
        except Exception:
            continue
    return ImageFont.load_default(size=px)


def render_image(lines, font_px=BILL_FONT_PX, width=BILL_IMG_WIDTH):
    """Render text lines to a 1-bit-ish bitmap so the font can be any size."""
    from PIL import Image, ImageDraw

    pad = 6
    font = _load_mono_font(font_px)
    ascent, descent = font.getmetrics()
    line_h = ascent + descent + 2

    height = pad * 2 + line_h * len(lines)
    img = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(img)

    y = pad
    for text, attrs in lines:
        stroke = 1 if attrs.get("bold") else 0
        try:
            bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke)
            tw = bbox[2] - bbox[0]
        except Exception:
            tw = int(len(text) * font_px * 0.6)
        if attrs.get("align") == "center":
            x = max(0, (width - tw) // 2)
        else:
            x = pad
        draw.text((x, y), text, font=font, fill=0, stroke_width=stroke, stroke_fill=0)
        y += line_h
    return img


def print_image(lines):
    from escpos.printer import Win32Raw

    img = render_image(lines)
    p = Win32Raw(PRINTER_NAME)
    p.image(img)
    p.text("\n")
    p.cut()


def emit(lines, dry_run, line_spacing=None, as_image=False):
    if dry_run:
        print_to_console(lines)
        return
    if as_image:
        try:
            print_image(lines)
            return
        except Exception as exc:
            # Pillow missing or render error -> degrade to text-mode font B.
            print(f"[warn] image print failed ({exc}); using text mode")
    print_to_printer(lines, line_spacing=line_spacing)


def fetch_json(path, key):
    resp = requests.get(
        f"{SERVER_URL}{path}",
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get(key, []) if data.get("success") else []


def ack(path, order_id):
    resp = requests.post(
        f"{SERVER_URL}{path}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        json={"id": order_id},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("success", False)


def process_queue(
    path, key, render_fn, label_fn, dry_run, line_spacing=None, as_image=False
):
    """Fetch one queue, print each item, then ack. Returns count printed."""
    items = fetch_json(path, key)
    if not items:
        return 0
    printed = 0
    for item in items:
        try:
            emit(
                render_fn(item),
                dry_run,
                line_spacing=line_spacing,
                as_image=as_image,
            )
        except Exception as exc:
            # Printing failed -> do NOT ack, so it is retried next poll.
            print(f"[error] print failed for {item.get('orderNumber')}: {exc}")
            continue
        try:
            ack(path, item["id"])
            printed += 1
            print(f"[ok] {label_fn(item)}")
        except Exception as exc:
            # Printed but ack failed -> may reprint once next poll. Acceptable.
            print(f"[warn] printed but ack failed for {item.get('orderNumber')}: {exc}")
    return printed


def process_once(dry_run):
    printed = process_queue(
        "/api/print/kot",
        "tickets",
        render_lines,
        lambda t: f"printed KOT {t.get('kotNumber')} ({t.get('orderNumber')})",
        dry_run,
    )
    printed += process_queue(
        "/api/print/bill",
        "bills",
        render_bill_lines,
        lambda b: f"printed Bill {b.get('billNumber')} ({b.get('orderNumber')})",
        dry_run,
        line_spacing=BILL_LINE_SPACING,
        as_image=BILL_AS_IMAGE,
    )
    return printed


SAMPLE_TICKET = {
    "id": "sample",
    "orderNumber": "SO-TEST-0001",
    "kotNumber": 1,
    "createdAt": None,
    "method": "Delivery",
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

SAMPLE_BILL = {
    "id": "sample",
    "orderNumber": "SO-TEST-0001",
    "billNumber": 2770,
    "createdAt": None,
    "method": "Delivery",
    "paymentMethod": "upi",
    "paymentStatus": "paid",
    "receiver": {
        "name": "Test Customer",
        "phone": "9876543210",
        "address": "12 MG Road, Indiranagar, Bengaluru 560038",
    },
    "items": [
        {"name": "Veg Beetroot Burger", "quantity": 1, "price": 180},
        {"name": "Chole Masala Rice Bowl (large)", "quantity": 1, "price": 150},
    ],
    "subTotal": 330,
    "discountAmount": 31,
    "deliveryFee": 0,
    "tax": 16,
    "totalAmount": 315,
}


def main():
    parser = argparse.ArgumentParser(description="Sochmat KOT / bill print agent")
    parser.add_argument("--dry-run", action="store_true", help="render to console, no printer")
    parser.add_argument("--once", action="store_true", help="process queues once and exit")
    parser.add_argument(
        "--test",
        action="store_true",
        help="print one sample KOT (to the printer, or console with --dry-run) and exit; no server/token needed",
    )
    parser.add_argument(
        "--test-bill",
        action="store_true",
        help="print one sample bill (to the printer, or console with --dry-run) and exit; no server/token needed",
    )
    parser.add_argument(
        "--save-bill-image",
        metavar="PATH",
        help="render the sample bill image to PATH (e.g. sample.png) to preview the font size, then exit",
    )
    args = parser.parse_args()

    # Preview the actual bill bitmap (what the printer receives) to a file.
    if args.save_bill_image:
        render_image(render_bill_lines(SAMPLE_BILL)).save(args.save_bill_image)
        print(f"[ok] sample bill image saved to {args.save_bill_image} (font px {BILL_FONT_PX})")
        return

    # --test / --test-bill verify the printer/render only; no server access.
    if args.test or args.test_bill:
        lines = render_bill_lines(SAMPLE_BILL) if args.test_bill else render_lines(SAMPLE_TICKET)
        what = "bill" if args.test_bill else "KOT"
        spacing = BILL_LINE_SPACING if args.test_bill else None
        emit(
            lines,
            args.dry_run,
            line_spacing=spacing,
            as_image=BILL_AS_IMAGE if args.test_bill else False,
        )
        if not args.dry_run:
            print(f"[ok] sample {what} sent to printer '{PRINTER_NAME}'")
        return

    if not TOKEN:
        print("[fatal] PRINT_AGENT_TOKEN is not set (see .env.example)")
        sys.exit(1)

    mode = "dry-run" if args.dry_run else f"printer '{PRINTER_NAME}'"
    print(f"Print agent -> {SERVER_URL} | {mode} | poll {POLL_INTERVAL}s")

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
