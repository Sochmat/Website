# Petpooja Online Ordering APIs

**Version 2.1.0**

Petpooja Integration Platform API enables restaurant partners to manage store, menus and orders received/placed from online order aggregators. Integrating with a restaurant partner's PoS system improves efficiency for menu management and order management of online orders.

All API methods use **POST**.

Access to developer account of staging/production: https://developerapi.petpooja.com/

Credentials for both staging and production environment will be provided by the Petpooja team.

---

## Servers

| Environment | URL |
|-------------|-----|
| Production | `https://internal_or_external_URL_Address.com` |
| Developer/Staging | `https://developerapi.petpooja.com` |

## Authentication

| Header | Description |
|--------|-------------|
| `app-key` | Unique application key [32 characters] |
| `app-secret` | Unique application secret [40 characters] |
| `access-token` | Unique access token [40 characters] |

---

## Menu

APIs for menu synchronization between Petpooja and integration partners

### POST `/pushmenu_endpoint` — Push Menu

This API helps an online order aggregator get a brand's menu items, choices and availability. Petpooja calls this integrator-provided endpoint whenever the merchant makes changes to the menu.

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| success | string | optional | 1=success, 0=failure |
| restaurants | array\<Restaurant\> | optional | |
| └ restaurantid | string | optional | |
| └ active | string | optional | |
| └ details | RestaurantDetails | optional | |
| └ menusharingcode | string | optional | Unique mapped Id for third-party restaurant |
| └ currency_html | string | optional | Currency HTML symbol |
| └ country | string | optional | |
| └ images | array\<string\> | optional | |
| └ restaurantname | string | optional | |
| └ address | string | optional | |
| └ contact | string | optional | |
| └ latitude | string | optional | |
| └ longitude | string | optional | |
| └ landmark | string | optional | |
| └ city | string | optional | |
| └ state | string | optional | |
| └ minimumorderamount | string | optional | |
| └ minimumdeliverytime | string | optional | |
| └ minimum_prep_time | string | optional | Minimum preparation time in minutes |
| └ deliverycharge | string | optional | |
| └ deliveryhoursfrom1 | string | optional | |
| └ deliveryhoursto1 | string | optional | |
| └ deliveryhoursfrom2 | string | optional | |
| └ deliveryhoursto2 | string | optional | |
| └ sc_applicable_on | string | optional | Service charge applicable on DineIn, Parcel & Home Delivery orders. Values: D, P, H |
| └ sc_type | string | optional | Service charge type. 1=Fixed, 2=Percentage |
| └ sc_calculate_on | string | optional | Service charge calculated on. 1=CORE, 2=TOTAL |
| └ sc_value | string | optional | Service charge value |
| └ tax_on_sc | string | optional | Tax applicable on service charge. 1=Applicable, 0=Not Applicable |
| └ calculatetaxonpacking | integer | optional | Calculate tax on packing. 0 or 1 |
| └ pc_taxes_id | string | optional | Tax ids applicable on packing charges |
| └ calculatetaxondelivery | integer | optional | Calculate tax on delivery. 0 or 1 |
| └ dc_taxes_id | string | optional | Tax ids applicable on delivery charges |
| └ packaging_applicable_on | string | optional | Packing charge applicable on. Values: NONE, ITEM, ORDER |
| └ packaging_charge | string | optional | |
| └ packaging_charge_type | string | optional | Packing charge type. Values: PERCENTAGE, FIXED |
| ordertypes | array\<OrderType\> | optional | |
| └ ordertypeid | integer | optional | Order type id |
| └ ordertype | string | optional | Order type name (Delivery, PickUp, DineIn) |
| categories | array\<Category\> | optional | |
| └ categoryid | string | optional | Category id |
| └ active | string | optional | Category status (boolean string) |
| └ categoryrank | string | optional | Category rank for ordering |
| └ parent_category_id | string | optional | Parent category id |
| └ categoryname | string | optional | Category name |
| └ categorytimings | string | optional | Active schedule days and time slot |
| └ category_image_url | string | optional | Category image URL |
| └ group_category_id | string | optional | ID of the group category this category belongs to |
| parentcategories | array\<ParentCategory\> | optional | |
| └ id | string | optional | |
| └ name | string | optional | |
| └ rank | string | optional | |
| └ image_url | string | optional | |
| └ status | string | optional | |
| group_categories | array\<GroupCategory\> | optional | Groups of categories (optional) |
| └ id | string | optional | Unique id of a group category |
| └ name | string | optional | Name of the group category |
| └ status | string | optional | Group category status (boolean string) |
| └ rank | string | optional | Rank for ordering/stacking |
| items | array\<MenuItem\> | optional | |
| └ itemid | string | optional | Item id |
| └ itemallowvariation | string | optional | Whether item allows variations. 1=yes, 0=no |
| └ itemrank | string | optional | Item rank for ordering/stacking |
| └ item_categoryid | string | optional | Category id from category object |
| └ item_ordertype | string | optional | Order types for this item (1=Home Delivery, 2=Parcel, 3=Dine In), comma-separated |
| └ item_tags | array\<string\> | optional | Optional tags. Possible values: vegan, chef-special, new |
| └ item_info | object | optional | |
| └ spice_level | enum | optional | Spice level. Default is not-applicable |
| └ item_packingcharges | string | optional | Item-level packing charge |
| └ itemallowaddon | string | optional | Whether item allows addons. 1=yes, 0=no |
| └ itemaddonbasedon | string | optional | Addon based on item or variations. 0=item, 1=variation |
| └ item_favorite | string | optional | Whether item is a favourite (boolean string) |
| └ ignore_taxes | string | optional | 0=include in tax calculation, 1=ignore |
| └ ignore_discounts | string | optional | 0=include in discount calculation, 1=ignore |
| └ in_stock | string | optional | Stock status |
| └ cuisine | array\<string\> | optional | Cuisine tags (can be multiple) |
| └ variation_groupname | string | optional | |
| └ variation | array\<ItemVariation\> | optional | |
|   └ id | string | optional | Variation item id |
|   └ variationid | string | optional | Variation master id |
|   └ name | string | optional | Variation name |
|   └ groupname | string | optional | Variation group (Size, Quantity, Volume, etc.) |
|   └ price | string | optional | Variation price |
|   └ markup_price | string | optional | Strike-through display price |
|   └ active | string | optional | Active status (boolean string) |
|   └ item_packingcharges | string | optional | Item-level packing charges for this variation |
|   └ variationrank | string | optional | Rank for ordering |
|   └ addon | array\<AddonGroupRef\> | optional | |
|     └ addon_group_id | string | optional | Addon group id |
|     └ addon_item_selection_min | string | optional | Minimum addon items to select |
|     └ addon_item_selection_max | string | optional | Maximum addon items to select |
|   └ variationallowaddon | integer | optional | Whether variation allows addons |
|   └ addon | array\<AddonGroupRef\> | optional | |
|     └ addon_group_id | string | optional | Addon group id |
|     └ addon_item_selection_min | string | optional | Minimum addon items to select |
|     └ addon_item_selection_max | string | optional | Maximum addon items to select |
| └ is_combo | string | optional | 1 if item is a combo item |
| └ combo_items | array\<ComboItem\> | optional | Details of items in a combo. Present only if is_combo=1 |
|   └ item_id | string | optional | Item id included in this combo |
|   └ is_variation | string | optional | 1 if item is a variation |
|   └ variation_item_id | string | optional | Exact variation id from the item |
|   └ name | string | optional | Item or variation name |
|   └ quantity | string | optional | Quantity included in this combo |
|   └ is_recommend | string | optional | 1=Restaurant recommended item |
| └ itemname | string | optional | Item name |
| └ item_attributeid | string | optional | Item attribute. 1=Veg, 2=Non-Veg, 5=Other, 24=Egg |
| └ itemdescription | string | optional | Item description |
| └ minimumpreparationtime | string | optional | Minimum preparation time (optional) |
| └ price | string | optional | Item price |
| └ markup_price | string | optional | Strike-through display price (optional) |
| └ active | string | optional | Item status (boolean string) |
| └ item_image_url | string | optional | Item image URL. Expires 24 hours after menu push. |
| └ item_tax | string | optional | Comma-separated tax master ids applicable to this item |
| └ tax_inclusive | boolean | optional | true if item price is inclusive of taxes. Default false |
| └ gst_type | enum | optional | GST liability. services=aggregator collects and pays GST to Gov; goods=aggregator collects and settles to restaurant |
| └ nutrition | Nutrition | optional | |
|   └ foodAmount | NutritionAmount | optional | Amount of food. Provide in g, kg, ml or l |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ calories | NutritionAmount | optional | Amount of calories. Unit is kcal |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ protien | NutritionAmount | optional | Amount of protein. Unit is g |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ minerals | array\<NutritionNamedAmount\> | optional | Amount of minerals. Units can be g or mg |
|     └ name | string | optional | |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ sodium | NutritionAmount | optional | Amount of sodium in mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ carbohydrate | NutritionAmount | optional | Amount of carbohydrate. Units can be g or mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ totalSugar | NutritionAmount | optional | Total sugar. Units can be g or mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ addedSugar | NutritionAmount | optional | Added sugar. Units can be g or mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ totalFat | NutritionAmount | optional | Total fat. Units can be g or mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ saturatedFat | NutritionAmount | optional | Saturated fat. Units can be g or mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ transFat | NutritionAmount | optional | Trans fat. Units can be g or mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ cholesterol | NutritionAmount | optional | Cholesterol. Units can be g or mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ vitamins | array\<NutritionNamedAmount\> | optional | Vitamins. Units can be g or mg |
|     └ name | string | optional | |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ fiber | NutritionAmount | optional | Fiber. Units can be g or mg |
|     └ amount | number | optional | |
|     └ unit | string | optional | |
|   └ additionalInfo | object | optional | Additional declaration from the restaurant |
|     └ info | string | optional | |
|     └ remark | string | optional | |
|   └ servingInfo | enum | optional | Serving size information |
|   └ additiveMap | object | optional | Additives. Supported keys: Polyols, Polydextrose, Caffeine, ArtificialSweetener, MSG. Units: g or mg |
|   └ allergens | array\<object\> | optional | Allergens present in the food |
|     └ allergen | string | optional | |
|     └ allergenDesc | string | optional | |
| variations | array\<object\> | optional | Deprecated. Variation data is now embedded in each item object. |
| └ variationid | string | optional | |
| └ name | string | optional | |
| └ groupname | string | optional | |
| └ status | string | optional | |
| addongroups | array\<AddonGroup\> | optional | |
| └ addongroupid | string | optional | |
| └ addongroup_name | string | optional | |
| └ addongroup_rank | string | optional | |
| └ active | string | optional | |
| └ addongroupitems | array\<AddonItem\> | optional | |
|   └ addonitemid | string | optional | |
|   └ addonitem_name | string | optional | |
|   └ addonitem_price | string | optional | |
|   └ active | string | optional | |
|   └ attributes | string | optional | Addon item attribute (veg, non-veg, egg) |
|   └ addonitem_rank | string | optional | |
| attributes | array\<Attribute\> | optional | |
| └ attributeid | string | optional | |
| └ attribute | string | optional | Attribute name (veg, non-veg, egg) |
| └ active | string | optional | |
| discounts | array\<Discount\> | optional | |
| └ discountid | string | optional | |
| └ discountname | string | optional | |
| └ discounttype | string | optional | Discount type. 1=Percentage, 2=Fixed, 3=BOGO/BXGY, 7=Freebie |
| └ discount | string | optional | Discount value. For BOGO/BXGY default is 100 (percentage) |
| └ bogobuyqty | string | optional | BOGO/BXGY BUY quantity |
| └ bogogetqty | string | optional | BOGO/BXGY GET quantity |
| └ bogotype | integer | optional | BOGO type. Default 1=Percentage |
| └ bogoapplicableonpurchase | string | optional | BOGO BUY applicable on: All, Items |
| └ bogoapplicableonpurchaseitemids | string | optional | |
| └ bogoapplicableon | string | optional | BOGO GET applicable on: All, Items |
| └ bogoapplicableonitemids | string | optional | |
| └ bogoitemamountlimit | integer | optional | |
| └ discountordertype | string | optional | |
| └ discountapplicableon | string | optional | Applicable on: All, Categories, Items |
| └ discountdays | string | optional | Days: Sun,Mon,Tue,Wed,Thu,Fri,Sat or All |
| └ discountontotal | string | optional | Apply on. 1=Total, 0=Core |
| └ discountstarts | string | optional | |
| └ discountends | string | optional | |
| └ discounttimefrom | string | optional | |
| └ discounttimeto | string | optional | |
| └ discountminamount | string | optional | |
| └ discountmaxamount | string | optional | |
| └ discounthascoupon | string | optional | |
| └ discountcategoryitemids | string | optional | |
| └ active | string | optional | |
| └ discountmaxlimit | string | optional | |
| └ rank | string | optional | |
| └ freebie_item_count | string | optional | Number of items for discounttype=7 (Freebie) |
| └ freebie_item_ids | string | optional | Comma-separated item ids for freebie discount |
| taxes | array\<Tax\> | optional | |
| └ taxid | string | optional | Tax id |
| └ taxname | string | optional | Tax name |
| └ tax | string | optional | Tax amount |
| └ taxtype | string | optional | Tax type. 1=Percentage, 2=Fixed |
| └ tax_ordertype | string | optional | Order types for this tax. 1=Delivery, 2=Pick Up, 3=Dine In |
| └ active | string | optional | |
| └ tax_coreortotal | string | optional | Tax applied on. 1=Total, 2=Core |
| └ tax_taxtype | string | optional | Tax type. 1=forward tax, 2=backward tax |
| └ rank | string | optional | |
| └ consider_in_core_amount | string | optional | |
| └ description | string | optional | |
| serverdatetime | string | optional | |
| db_version | string | optional | |
| application_version | string | optional | |
| http_code | integer | optional | |

#### Responses

**200 — Menu items successfully received**

```json
{
  "success": "1",
  "message": "Menu items are successfully listed."
}
```

**400 — Menu sync failed (e.g. invalid restaurant ID)**

```json
{
  "success": "0",
  "message": "Menu sync failed"
}
```

---

### POST `/fetchmenu` — Fetch Menu

In this method the integrator fetches the menu from the Petpooja endpoint on demand. Every time the integrator calls this endpoint, the current menu state is returned.

**Dev URL:** `https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/mapped_restaurant_menus`

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| app-key | string | required | Application key for authentication |
| app-secret | string | required | Application secret for authentication |
| access-token | string | required | Access token for authentication |
| restID | string | required | Unique restaurant mapping id |

#### Request

```json
{
  "restID": "xxxxxx"
}
```

#### Responses

**200 — Menu data fetched successfully**

*No example payload.*

**400 — Menu not available for this outlet**

```json
{
  "success": "0",
  "message": "Menu is not available for this outlet."
}
```

---

### POST `/item_stock` — Update Item/Addon In Stock

This API endpoint must be provided by the integrator. Petpooja calls this endpoint for toggling the item stock status (in-stock) in the menu on the integrator platform for items already synced via menu sync APIs.

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| restID | string | required | Mapped restaurant id for which item stock is toggled |
| type | enum | required | Type of stock update request |
| inStock | boolean | required | true=in-stock, false=out-of-stock |
| itemID | array\<string\> | required | List of Item or AddonItem IDs to toggle |

#### Request

```json
{
  "restID": "xxxx",
  "type": "item",
  "inStock": true,
  "itemID": [
    "7778660",
    "7778659"
  ]
}
```

#### Responses

**200 — Stock status updated successfully**

```json
{
  "code": 200,
  "status": "success",
  "message": "Stock status updated successfully"
}
```

**400 — Stock status update failed**

```json
{
  "code": 400,
  "status": "failed",
  "message": "Stock status not updated successfully"
}
```

---

### POST `/item_stock_off` — Update Item/Addon Out of Stock

Endpoint to mark items or addons as out-of-stock. Note: It is recommended to use the same endpoint as `item_stock` and differentiate using the `inStock` field.

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| restID | string | required | Mapped restaurant id |
| type | enum | required | |
| inStock | boolean | required | Should be false for out-of-stock |
| itemID | array\<string\> | required | List of Item or AddonItem IDs |
| autoTurnOnTime | string | required | When to auto turn on. Value: custom |
| customTurnOnTime | string | optional | Datetime to turn item back on (local restaurant timezone). Required if autoTurnOnTime=custom. Format: yyyy-MM-dd HH:mm |

#### Request

```json
{
  "restID": "xxxx",
  "type": "item",
  "inStock": false,
  "itemID": [
    "7532306",
    "7865402"
  ],
  "autoTurnOnTime": "custom",
  "customTurnOnTime": "2020-02-24 18:00"
}
```

#### Responses

**200 — Stock status updated successfully**

```json
{
  "code": 200,
  "status": "success",
  "message": "Stock status updated successfully"
}
```

**400 — Stock status update failed**

```json
{
  "code": 400,
  "status": "failed",
  "message": "Stock status not updated successfully"
}
```

---

## Orders

APIs for order management

### POST `/saveorder` — Save Order

Once a new order is placed by the end user, push the order to the Petpooja PoS application. On arrival, the order will be in Pending State until the restaurant partner responds (Accept/Reject).

**Dev URL:** `https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order`

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| app_key | string | required | Unique application key [32 characters] |
| app_secret | string | required | Unique application secret [40 characters] |
| access_token | string | required | Unique access token [40 characters] |
| orderinfo | object | required | |
| └ OrderInfo | object | optional | |
|   └ Restaurant | object | optional | |
|     └ details | object | optional | |
|       └ res_name | string | optional | Name of third party restaurant |
|       └ address | string | optional | Address of third party restaurant |
|       └ contact_information | string | optional | |
|       └ restID | string | optional | Unique Petpooja RestaurantID/MappingID |
|   └ Customer | object | optional | |
|     └ details | object | optional | |
|       └ email | string | optional | |
|       └ name | string | optional | |
|       └ address | string | optional | |
|       └ phone | string | optional | 10 digit mobile number |
|       └ latitude | string | optional | |
|       └ longitude | string | optional | |
|   └ Order | object | optional | |
|     └ details | OrderDetails | optional | |
|       └ orderID | string | required | Unique third-party order id |
|       └ preorder_date | string | required | Order creation date. Format: yyyy-mm-dd |
|       └ preorder_time | string | required | Order creation time. Format: HH:mm:ss |
|       └ service_charge | string | required | Service charge at order level |
|       └ sc_tax_amount | string | required | Tax calculated on service charge |
|       └ delivery_charges | string | optional | |
|       └ dc_tax_percentage | string | required | Tax percentage on delivery charges |
|       └ dc_tax_amount | string | required | Tax amount on delivery charges |
|       └ dc_gst_details | array\<GstDetail\> | optional | Delivery charge GST breakdown. Required for Ecomm. |
|       └ packing_charges | string | optional | |
|       └ pc_tax_amount | string | required | Tax amount on packing charges |
|       └ pc_tax_percentage | string | required | Tax percentage on packing charges |
|       └ pc_gst_details | array\<GstDetail\> | optional | Packing charge GST breakdown. Required for Ecomm. |
|       └ order_type | string | required | H=Home Delivery, P=Parcel, D=Dine In |
|       └ ondc_bap | string | optional | Buyer app name if order is from ONDC (optional) |
|       └ advanced_order | string | optional | Y or N |
|       └ urgent_order | boolean | optional | Whether order is urgent |
|       └ urgent_time | integer | optional | Urgent order time in minutes (if urgent_order=true) |
|       └ payment_type | string | required | COD, CARD, CREDIT, ONLINE, OTHER |
|       └ table_no | string | optional | Table number for Dine In orders |
|       └ no_of_persons | string | optional | Number of persons for Dine In |
|       └ discount_total | string | optional | |
|       └ tax_total | string | optional | |
|       └ discount_type | string | optional | P=Percentage, F=Fixed |
|       └ total | string | optional | Order total including GST |
|       └ description | string | optional | Special instructions |
|       └ created_on | string | required | Order creation datetime. Format: yyyy-mm-dd H:i:s |
|       └ enable_delivery | integer | optional | 0=Third-party rider, 1=Self delivery |
|       └ min_prep_time | integer | optional | Kitchen preparation time in minutes (optional) |
|       └ callback_url | string | optional | URL for Petpooja to send order status updates |
|       └ collect_cash | string | optional | Cash to collect (only for COD + self-delivery). Optional. |
|       └ otp | string | optional | Pickup OTP for order verification (optional) |
|   └ OrderItem | object | optional | |
|     └ details | array\<OrderItem\> | optional | |
|       └ id | string | required | Unique PetPooja item id or variation item id |
|       └ name | string | required | Name of item |
|       └ tax_inclusive | boolean | optional | true if item amount is inclusive of tax |
|       └ gst_liability | string | optional | GST liability. vendor or restaurant. Required for Ecomm. |
|       └ item_tax | array\<OrderItemTax\> | required | Tax calculated at item level after discount |
|       └ item_discount | string | required | Discount amount at item level |
|       └ price | string | required | Unit price including addons/variation price |
|       └ final_price | string | required | Item price after discount |
|       └ quantity | string | required | |
|       └ description | string | optional | Special instruction for item |
|       └ variation_name | string | optional | Variation name (required if item has variations) |
|       └ variation_id | string | optional | Variation ID (required if item has variations) |
|       └ AddonItem | object | optional | |
|       └ Tax | object | optional | |
|         └ details | array\<OrderTax\> | optional | |
|           └ id | string | required | Unique PetPooja tax id |
|           └ title | string | required | Tax title |
|           └ type | string | optional | P=Percentage, F=Fixed. Default P |
|           └ price | string | required | Tax percentage rate |
|           └ tax | string | optional | Total tax amount |
|           └ restaurant_liable_amt | string | optional | Tax amount restaurant is liable to pay. Required for Ecomm. |
|       └ Discount | object | optional | |
|         └ details | array\<OrderDiscount\> | optional | |
|           └ id | string | optional | Unique PetPooja discount id |
|           └ title | string | required | Discount title |
|           └ type | string | optional | P=Percentage, F=Fixed |
|           └ price | string | required | Discount amount |
| udid | string | optional | Unique device number for mobile orders |
| device_type | string | required | Type of device. Default: Web (case sensitive) |

#### Responses

**200 — Order saved successfully**

```json
{
  "success": "1",
  "message": "Your order is saved.",
  "restID": "xxxxxx",
  "clientOrderID": "A-1",
  "orderID": "26"
}
```

**400 — Validation error in order details**

*Order ID not provided:*

```json
{
  "success": "0",
  "message": "There were some error in order details.",
  "errorCode": "SO_105",
  "validation_errors": {
    "orderID": [
      "Please provide order id."
    ]
  }
}
```

*Item name not provided:*

```json
{
  "success": "0",
  "message": "There were some error in order item details.",
  "errorCode": "SO_106",
  "validation_errors": {
    "name": [
      "Please enter item name."
    ]
  }
}
```

*Preorder date invalid:*

```json
{
  "success": "0",
  "message": "There were some error in order details.",
  "errorCode": "SO_105",
  "validation_errors": {
    "preorder_date": [
      "Preorder date is greater than current date.[Format:Y-m-d]"
    ]
  }
}
```

---

### POST `/callback` — Order Callback

Online order integration partner must implement this endpoint to allow the PoS partner to notify about order status updates after a successful order relay. The integration partner passes this endpoint URL in every save order request via the `callback_url` field.

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| restID | string | optional | Unique Petpooja Restaurant ID |
| orderID | string | optional | Unique client order id |
| status | string | optional | Order status. -1=Cancelled, 1/2/3=Accepted, 4=Dispatch, 5=Food Ready, 10=Delivered |
| cancel_reason | string | optional | Reason for cancellation |
| minimum_prep_time | integer | optional | Kitchen preparation time in minutes |
| minimum_delivery_time | string | optional | Delivery time. Can be ignored for platforms with logistics. |
| rider_name | string | optional | Rider name (for self-delivery, status 4) |
| rider_phone_number | string | optional | Rider phone (for self-delivery, status 4) |
| is_modified | string | optional | Whether order was modified at restaurant |

#### Request

```json
{
  "restID": "xxxxxx",
  "orderID": "A-1",
  "status": "1",
  "cancel_reason": "",
  "minimum_prep_time": 20,
  "minimum_delivery_time": "",
  "rider_name": "",
  "rider_phone_number": "",
  "is_modified": "No"
}
```

#### Responses

**200 — Callback received successfully**

*No example payload.*

---

### POST `/orderstatus` — Update Order Status

Integration partner can send updated order status to the PoS partner by calling this endpoint. Currently supports sending cancel order (-1) status only.

**Dev URL:** `https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/update_order_status`

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| app_key | string | required | Unique application key [32 characters] |
| app_secret | string | required | Unique application secret [40 characters] |
| access_token | string | required | Unique access token [40 characters] |
| restID | string | required | Unique Petpooja Restaurant ID |
| orderID | string | optional | Unique PetPooja order id (deprecated, pass blank) |
| clientorderID | string | required | Unique integrator partner order id |
| cancelReason | string | required | Reason for cancelling order |
| status | string | required | -1=Cancelled |

#### Request

```json
{
  "app_key": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "app_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "restID": "xxxxxx",
  "orderID": "26",
  "clientorderID": "A-1",
  "cancelReason": "Please cancel my order.",
  "status": "-1"
}
```

#### Responses

**200 — Order status updated successfully**

```json
{
  "success": "1",
  "message": "Order status updated successfully.",
  "restID": "xxxxxxx",
  "orderID": "26",
  "status": "-1"
}
```

**400 — Error updating order status (e.g. order already modified by restaurant)**

```json
{
  "success": "0",
  "message": "There were some error in update order status.",
  "errorCode": "UOS_105",
  "validation_errors": ""
}
```

---

## Delivery

APIs for delivery and rider management

### POST `/rider_info_webhook` — Rider Info Webhook

Webhook to update the rider information for Petpooja POS in order to update order delivery status without continuously polling. This endpoint must be provided by the third party.

**Dev URL:** `https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/rider_status_update`

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| app_key | string | required | |
| app_secret | string | required | |
| access_token | string | required | |
| order_id | integer | required | Unique third-party order id / Client Order ID |
| outlet_id | string | required | |
| status | enum | required | Rider status |
| rider_data | RiderData | required | |
| └ rider_name | string | required | Delivery executive name |
| └ rider_phone_number | string | required | Delivery executive phone number |
| external_order_id | string | optional | PetPooja Order Id (pass blank) |

#### Request

```json
{
  "app_key": "xxxxxxxxxxxxxxxxxxxx",
  "app_secret": "xxxxxxxxxxxxxxxxxxxxxxxxx",
  "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxx",
  "order_id": 101010527,
  "outlet_id": "xxxxx",
  "status": "rider-assigned",
  "rider_data": {
    "rider_name": "RIDER",
    "rider_phone_number": "9999999999"
  },
  "external_order_id": ""
}
```

#### Responses

**200 — Rider status saved successfully**

```json
{
  "code": "200",
  "message": "Rider status saved successfully.",
  "success": "success"
}
```

**400 — Order not found or invalid rider status**

```json
{
  "code": "400",
  "message": "Order Id not found./Invalid Rider status.",
  "success": "failed"
}
```

---

## Store

APIs for store status management

### POST `/get_store_status` — Get Store Status

This API endpoint must be provided by the integration partner. The merchant at the restaurant can check the current status of the store at the integrator platform end.

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| restID | string | required | Unique mapped Id for third party restaurant |

#### Request

```json
{
  "restID": "xxxx"
}
```

#### Responses

**200 — Store status fetched successfully**

```json
{
  "http_code": 200,
  "status": "success",
  "store_status": "1",
  "message": "Store Delivery Status fetched successfully"
}
```

### POST `/update_store_status` — Update Store Status

This API endpoint must be provided by the integration partner. Used by the merchant to tell the integration partner to turn on/off the store for online orders within their set working hours.

#### Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| restID | string | required | Unique mapped Id for third party restaurant |
| store_status | integer | required | 1=Open, 0=Closed |
| turn_on_time | string | required | Next opening time. Required when turning off the store. |
| reason | string | optional | Required when store_status=0 |

#### Request

```json
{
  "restID": "xxxx",
  "store_status": 0,
  "turn_on_time": "2023-02-17 00:00:00",
  "reason": ""
}
```

#### Responses

**200 — Store status updated successfully**

```json
{
  "http_code": 200,
  "status": "success",
  "message": "Store Status updated successfully for store restID"
}
```
