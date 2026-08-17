"use client";

import { useEffect, useState } from "react";
import { Button, DatePicker, Modal, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { downloadBlob, filenameFromResponse } from "@/lib/downloadBlob";
import { salesReportFilename } from "@/lib/reportFilename";

const { RangePicker } = DatePicker;

interface Props {
  /**
   * The range the surrounding page is showing, used to pre-fill the picker.
   * The export still asks before downloading — this only means the common case
   * ("what I'm looking at") is one confirm away rather than a re-pick.
   */
  defaultRange: [Dayjs, Dayjs];
}

/**
 * Downloads the category-wise sales report for a chosen date range.
 *
 * The server builds the workbook and names it, so the timestamp in the filename
 * is the one the sheet was actually generated at.
 */
export default function ExportSalesReport({ defaultRange }: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange);
  const [downloading, setDownloading] = useState(false);

  // Re-sync on open, not on every prop change: once the modal is up the picker
  // owns the range, and a background refresh shouldn't move it under the user.
  useEffect(() => {
    if (open) setRange(defaultRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleExport() {
    const [from, to] = range;
    setDownloading(true);
    try {
      const params = new URLSearchParams({
        from: from.format("YYYY-MM-DD"),
        to: to.format("YYYY-MM-DD"),
      });
      const res = await fetch(`/api/admin/reports/category-sales?${params}`);
      if (!res.ok) {
        message.error("Could not build the sales report");
        return;
      }
      downloadBlob(
        await res.blob(),
        filenameFromResponse(res) ?? salesReportFilename(new Date()),
      );
      setOpen(false);
    } catch {
      message.error("Could not build the sales report");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Button icon={<DownloadOutlined />} onClick={() => setOpen(true)}>
        Export sales report
      </Button>
      <Modal
        title="Export sales report"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleExport}
        okText="Download Excel"
        confirmLoading={downloading}
        destroyOnHidden
      >
        <p className="text-sm text-gray-500 mb-3">
          Category-wise sales for the selected dates, as an Excel file. Counts
          paid orders only; revenue is pre-tax and before discounts.
        </p>
        <RangePicker
          value={range}
          onChange={(value) => {
            if (value?.[0] && value[1]) setRange([value[0], value[1]]);
          }}
          allowClear={false}
          format="D MMM YY"
          maxDate={dayjs()}
          style={{ width: "100%" }}
        />
      </Modal>
    </>
  );
}
