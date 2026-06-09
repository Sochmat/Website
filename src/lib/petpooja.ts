import { ObjectId, Db } from "mongodb";
import { Order } from "@/lib/types";

/**
 * Outbound integration with Petpooja's `/saveorder` endpoint.
 *
 * Pushes a placed order to the Petpooja POS. This is fire-and-forget from the
 * caller's perspective: `pushOrderToPetpooja` never throws. It returns a result
 * the caller persists on the order (`petpoojaStatus`/`petpoojaError`/...), so a
 * push failure never blocks the customer.
 *
 * Scope is the push only — `/callback` (inbound status) and `/orderstatus`
 * (cancel) are not implemented here.
 */

const DEFAULT_SAVE_ORDER_URL =
  "https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order";

// Restaurant identity sent with every order. The restID is the only field
// Petpooja matches on; the rest are descriptive.
const RES_NAME = "Sochmat";
const RES_ADDRESS = "";
const RES_CONTACT = "";

export type PetpoojaPushResult = {
  status: "success" | "failed" | "skipped";
  petpoojaOrderId?: string;
  error?: string;
};

type PetpoojaConfig = {
  appKey: string;
  appSecret: string;
  accessToken: string;
  restID: string;
  saveOrderUrl: string;
};

function getConfig(): PetpoojaConfig | null {
  const appKey = process.env.PETPOOJA_APP_KEY;
  const appSecret = process.env.PETPOOJA_APP_SECRET;
  const accessToken = process.env.PETPOOJA_ACCESS_TOKEN;
  const restID = process.env.PETPOOJA_REST_ID;
  if (!appKey || !appSecret || !accessToken || !restID) {
    return null;
  }
  return {
    appKey,
    appSecret,
    accessToken,
    restID,
    saveOrderUrl: process.env.PETPOOJA_SAVE_ORDER_URL || DEFAULT_SAVE_ORDER_URL,
  };
}

// Petpooja wants payment_type as COD / ONLINE etc. Our model stores how the
// customer paid; cash is the only COD case.
function mapPaymentType(method: Order["paymentMethod"]): string {
  return method === "cash" ? "COD" : "ONLINE";
}

// Format a Date into Petpooja's separate date / time / datetime fields using the
// restaurant's local timezone (IST).
function formatDateParts(d: Date): {
  date: string;
  time: string;
  dateTime: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  // hour12:false can yield "24" at midnight in some runtimes; normalize.
  const hour = get("hour") === "24" ? "00" : get("hour");
  const time = `${hour}:${get("minute")}:${get("second")}`;
  return { date, time, dateTime: `${date} ${time}` };
}

/**
 * Build the menu-item lookup for an order and verify every line maps to a
 * Petpooja item id. Returns either the resolved items or the list of unmapped
 * product ids.
 */
async function resolveItems(
  order: Order,
  db: Db,
): Promise<
  | { ok: true; items: Array<{ petpoojaItemId: string; name: string; price: number; quantity: number }> }
  | { ok: false; unmapped: string[] }
> {
  const objectIds: ObjectId[] = [];
  for (const item of order.orderItems) {
    try {
      objectIds.push(new ObjectId(String(item.productId)));
    } catch {
      // Non-ObjectId productId — treated as unmapped below.
    }
  }

  const menuDocs = await db
    .collection("menuItems")
    .find({ _id: { $in: objectIds } })
    .toArray();
  const byId = new Map(menuDocs.map((m) => [m._id.toString(), m]));

  const items: Array<{
    petpoojaItemId: string;
    name: string;
    price: number;
    quantity: number;
  }> = [];
  const unmapped: string[] = [];

  for (const line of order.orderItems) {
    const menu = byId.get(String(line.productId));
    const petpoojaItemId = menu?.petpoojaItemId;
    if (!menu || !petpoojaItemId) {
      unmapped.push(String(line.productId));
      continue;
    }
    items.push({
      petpoojaItemId: String(petpoojaItemId),
      name: String(menu.name ?? ""),
      price: Number(line.price) || 0,
      quantity: Number(line.quantity) || 0,
    });
  }

  if (unmapped.length > 0) {
    return { ok: false, unmapped };
  }
  return { ok: true, items };
}

function buildPayload(
  order: Order,
  config: PetpoojaConfig,
  items: Array<{ petpoojaItemId: string; name: string; price: number; quantity: number }>,
) {
  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const { date, time, dateTime } = formatDateParts(createdAt);

  const total = Number(order.netAmount ?? order.totalAmount) || 0;
  const receiver = order.receiver;

  return {
    app_key: config.appKey,
    app_secret: config.appSecret,
    access_token: config.accessToken,
    orderinfo: {
      OrderInfo: {
        Restaurant: {
          details: {
            res_name: RES_NAME,
            address: RES_ADDRESS,
            contact_information: RES_CONTACT,
            restID: config.restID,
          },
        },
        Customer: {
          details: {
            email: receiver?.email ?? "",
            name: receiver?.name ?? "",
            address: order.address ?? receiver?.address ?? "",
            phone: String(receiver?.phone ?? "").replace(/\D/g, ""),
            latitude: receiver?.lat != null ? String(receiver.lat) : "",
            longitude: receiver?.lng != null ? String(receiver.lng) : "",
          },
        },
        Order: {
          details: {
            orderID: order.orderNumber ?? "",
            preorder_date: date,
            preorder_time: time,
            service_charge: "0",
            sc_tax_amount: "0",
            delivery_charges: String(order.deliveryFee ?? 0),
            dc_tax_percentage: "0",
            dc_tax_amount: "0",
            packing_charges: "0",
            pc_tax_amount: "0",
            pc_tax_percentage: "0",
            order_type: "H",
            payment_type: mapPaymentType(order.paymentMethod),
            table_no: "",
            no_of_persons: "0",
            discount_total: String(order.discountAmount ?? 0),
            tax_total: String(order.tax ?? 0),
            discount_type: "F",
            total: String(total),
            description: "",
            created_on: dateTime,
            enable_delivery: 1,
            min_prep_time: 0,
            callback_url: "",
            collect_cash:
              order.paymentMethod === "cash" ? String(total) : "",
            otp: "",
          },
        },
        OrderItem: {
          details: items.map((item) => ({
            id: item.petpoojaItemId,
            name: item.name,
            gst_liability: "restaurant",
            item_tax: [],
            item_discount: "0",
            price: String(item.price),
            final_price: String(item.price),
            quantity: String(item.quantity),
            description: "",
          })),
        },
      },
      udid: "",
      device_type: "Web",
    },
  };
}

export async function pushOrderToPetpooja(
  order: Order,
  db: Db,
): Promise<PetpoojaPushResult> {
  const config = getConfig();
  if (!config) {
    return { status: "skipped", error: "Petpooja is not configured" };
  }

  if (!order.orderItems?.length) {
    return { status: "skipped", error: "Order has no items" };
  }

  try {
    const resolved = await resolveItems(order, db);
    if (!resolved.ok) {
      return {
        status: "skipped",
        error: `Unmapped items (no petpoojaItemId): ${resolved.unmapped.join(", ")}`,
      };
    }

    const payload = buildPayload(order, config, resolved.items);

    const response = await fetch(config.saveOrderUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data: {
      success?: string;
      orderID?: string | number;
      message?: string;
    } | null = null;
    try {
      data = await response.json();
    } catch {
      // Non-JSON response — fall through to failure with status text.
    }

    if (response.ok && data?.success === "1") {
      return {
        status: "success",
        petpoojaOrderId: data.orderID ? String(data.orderID) : undefined,
      };
    }

    const message =
      data?.message ||
      `Petpooja save_order failed (HTTP ${response.status})`;
    return { status: "failed", error: String(message) };
  } catch (error) {
    return {
      status: "failed",
      error:
        error instanceof Error
          ? error.message
          : "Petpooja save_order request error",
    };
  }
}

/**
 * Persist a push result onto the order document. Centralizes the `$set` shape so
 * both trigger points (COD creation, online verify) stay consistent.
 */
export async function recordPushResult(
  db: Db,
  orderId: ObjectId,
  result: PetpoojaPushResult,
): Promise<void> {
  await db.collection("orders").updateOne(
    { _id: orderId },
    {
      $set: {
        petpoojaStatus: result.status,
        petpoojaOrderId: result.petpoojaOrderId,
        petpoojaError: result.error,
        petpoojaPushedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
}
