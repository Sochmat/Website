/**
 * Serialized browser printing for the shop's print station.
 *
 * Each job writes a full receipt HTML document into a hidden same-origin
 * iframe, calls the iframe window's print(), then runs its onPrinted callback
 * (used to ack the server). Jobs run strictly one at a time so print dialogs /
 * spooled jobs never overlap or interleave.
 */

type Job = { html: string; onPrinted: () => Promise<void> | void };

const queue: Job[] = [];
let running = false;

export function enqueuePrint(
  html: string,
  onPrinted: () => Promise<void> | void,
): void {
  queue.push({ html, onPrinted });
  void drain();
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      try {
        await printHtml(job.html);
      } finally {
        // Ack even if the print promise resolved via the fallback timer; a
        // failed ack is the caller's concern (it re-enqueues next poll).
        await job.onPrinted();
      }
    }
  } finally {
    running = false;
  }
}

function printHtml(html: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      // Delay removal so the print job is fully spooled first.
      setTimeout(() => iframe.remove(), 1000);
      resolve();
    };

    win.onafterprint = finish;
    doc.open();
    doc.write(html);
    doc.close();

    // Receipts are printed as a bitmap <img> whose data URL decodes async, so
    // wait for images to finish loading (capped) before printing — otherwise a
    // blank page spools. The fallback timer covers browsers (e.g. Chrome
    // --kiosk-printing) that never fire onafterprint.
    const images = Array.from(doc.images ?? []);
    const imagesReady = Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((res) => {
              img.onload = () => res();
              img.onerror = () => res();
            }),
      ),
    );
    const readyOrTimeout = Promise.race([
      imagesReady,
      new Promise<void>((res) => setTimeout(res, 3000)),
    ]);

    void readyOrTimeout.then(() => {
      try {
        win.focus();
        win.print();
      } catch {
        // ignore; the fallback timer resolves the job
      }
      setTimeout(finish, 1500);
    });
  });
}
