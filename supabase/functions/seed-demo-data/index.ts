import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

console.log("seed-demo-data starting");

const DEMO_IMAGE_URL =
  "https://awkwxjkfbcpbtbniljwn.supabase.co/storage/v1/object/public/marketplace-images/originals/17b0ffb0-873a-491c-94ce-64170eef02fd/65453546-f187-4810-88df-2c358aafa7d3/1788034138141.jpg";

const DEMO_PASSWORD = "Demo@12345";

const VENDORS = [
  ["lakshmi.devi", "Lakshmi Devi", "Handloom", "Tamil Nadu", "ta"],
  ["ramesh.kumar", "Ramesh Kumar", "Woodcraft", "Rajasthan", "hi"],
  ["meena.kumari", "Meena Kumari", "Terracotta", "West Bengal", "bn"],
  ["arjun.das", "Arjun Das", "Bamboo Craft", "Assam", "en"],
  ["kavitha.s", "Kavitha Srinivasan", "Kalamkari", "Andhra Pradesh", "te"],
  ["ravi.prasad", "Ravi Prasad", "Metal Craft", "Odisha", "en"],
  ["sita.nair", "Sita Nair", "Handloom", "Kerala", "en"],
  ["mohan.das", "Mohan Das", "Dokra", "West Bengal", "bn"],
  ["anita.verma", "Anita Verma", "Woodcraft", "Karnataka", "en"],
  ["ganesh.rao", "Ganesh Rao", "Bamboo Craft", "Maharashtra", "en"],
] as const;

const BUYERS = [
  ["priya.sharma", "Priya Sharma", "Delhi", "hi"],
  ["rahul.verma", "Rahul Verma", "Uttar Pradesh", "hi"],
  ["ananya.singh", "Ananya Singh", "Karnataka", "en"],
  ["karthik.r", "Karthik Raman", "Tamil Nadu", "ta"],
  ["neha.patel", "Neha Patel", "Gujarat", "en"],
  ["aditya.mehta", "Aditya Mehta", "Maharashtra", "en"],
  ["pooja.iyer", "Pooja Iyer", "Tamil Nadu", "ta"],
  ["vikram.joshi", "Vikram Joshi", "Rajasthan", "hi"],
  ["divya.menon", "Divya Menon", "Kerala", "en"],
  ["rohan.kapoor", "Rohan Kapoor", "Punjab", "en"],
  ["sneha.reddy", "Sneha Reddy", "Telangana", "te"],
  ["aman.khan", "Aman Khan", "Delhi", "hi"],
  ["isha.roy", "Isha Roy", "West Bengal", "bn"],
  ["arvind.nair", "Arvind Nair", "Kerala", "en"],
  ["megha.rao", "Megha Rao", "Maharashtra", "en"],
  ["nikhil.shah", "Nikhil Shah", "Gujarat", "en"],
  ["tanvi.desai", "Tanvi Desai", "Gujarat", "en"],
  ["sanjay.rao", "Sanjay Rao", "Karnataka", "en"],
  ["keerthi.p", "Keerthi Prakash", "Tamil Nadu", "ta"],
  ["yash.malhotra", "Yash Malhotra", "Haryana", "hi"],
] as const;

const PRODUCTS = [
  ["Handwoven Cotton Saree", "Handloom", "cotton", 2200],
  ["Traditional Silk Saree", "Handloom", "silk", 4800],
  ["Block Print Dupatta", "Handloom", "cotton", 950],
  ["Handloom Table Runner", "Handloom", "cotton", 650],
  ["Carved Teak Bowl", "Woodcraft", "teak wood", 2400],
  ["Wooden Elephant", "Woodcraft", "rosewood", 1800],
  ["Handcrafted Spice Box", "Woodcraft", "wood", 1250],
  ["Wooden Jewellery Box", "Woodcraft", "sheesham wood", 2100],
  ["Terracotta Horse", "Terracotta", "terracotta", 1400],
  ["Terracotta Vase", "Terracotta", "terracotta", 1100],
  ["Clay Decorative Pot", "Terracotta", "clay", 850],
  ["Terracotta Wall Art", "Terracotta", "terracotta", 1650],
  ["Bamboo Storage Basket", "Bamboo", "bamboo", 750],
  ["Bamboo Lamp", "Bamboo", "bamboo", 1450],
  ["Bamboo Serving Tray", "Bamboo", "bamboo", 900],
  ["Bamboo Planter", "Bamboo", "bamboo", 650],
  ["Kalamkari Wall Hanging", "Kalamkari", "cotton", 1750],
  ["Kalamkari Dupatta", "Kalamkari", "cotton", 1350],
  ["Hand Painted Kalamkari Panel", "Kalamkari", "cotton", 2800],
  ["Kalamkari Cushion Cover", "Kalamkari", "cotton", 700],
  ["Dokra Elephant Figurine", "Dokra", "brass", 2200],
  ["Dokra Tribal Horse", "Dokra", "brass", 1900],
  ["Dokra Dancing Couple", "Dokra", "brass", 2600],
  ["Dokra Decorative Bowl", "Dokra", "brass", 1750],
  ["Brass Diya Set", "Metal Craft", "brass", 900],
  ["Handcrafted Brass Bell", "Metal Craft", "brass", 1200],
  ["Brass Peacock Figurine", "Metal Craft", "brass", 2400],
  ["Traditional Brass Lamp", "Metal Craft", "brass", 3200],
  ["Kerala Cotton Saree", "Handloom", "cotton", 2600],
  ["Handloom Cushion Set", "Handloom", "cotton", 850],
  ["Natural Dye Scarf", "Handloom", "cotton", 750],
  ["Handwoven Shawl", "Handloom", "wool", 2300],
  ["Carved Wooden Ganesha", "Woodcraft", "wood", 2100],
  ["Wooden Serving Board", "Woodcraft", "mango wood", 1000],
  ["Wooden Pen Stand", "Woodcraft", "wood", 550],
  ["Wooden Jewelry Stand", "Woodcraft", "wood", 1300],
  ["Bamboo Bottle", "Bamboo", "bamboo", 700],
  ["Bamboo Desk Organizer", "Bamboo", "bamboo", 600],
  ["Bamboo Fruit Basket", "Bamboo", "bamboo", 850],
  ["Bamboo Flower Vase", "Bamboo", "bamboo", 950],
] as const;

const REVIEW_TEXT = [
  "Beautiful craftsmanship and excellent finish.",
  "Looks even better in person. Very happy with the purchase.",
  "The quality is excellent for the price.",
  "A beautiful traditional piece. Highly recommended.",
  "The detailing is impressive.",
  "Good quality and arrived safely.",
  "Really happy to support an artisan-made product.",
  "The colours and finishing are excellent.",
];

function deterministicUuid(index: number, prefix: number): string {
  const hex =
    `${prefix.toString(16).padStart(8, "0")}${index
      .toString(16)
      .padStart(24, "0")}`.slice(0, 32);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function findOrCreateUser(
  admin: any,
  email: string,
  name: string,
  role: "vendor" | "consumer",
  metadata: Record<string, unknown>,
) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(
      `Unable to list Auth users: ${JSON.stringify(error)}`,
    );
  }

  const existing = data.users.find(
    (user: any) => user.email === email,
  );

  if (existing) {
    return existing;
  }

  const result = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: name,
      role,
      ...metadata,
    },
  });

  if (result.error) {
    throw new Error(
      `Unable to create Auth user ${email}: ${JSON.stringify(
        result.error,
      )}`,
    );
  }

  return result.data.user;
}

export default {
  fetch: withSupabase(
    { auth: ["secret"] },
    async (_req, ctx) => {
      try {
        const admin = ctx.supabaseAdmin;

        const vendorUsers: Array<{
          id: string;
          name: string;
          craft: string;
          state: string;
        }> = [];

        for (const [
          username,
          name,
          craft,
          state,
          language,
        ] of VENDORS) {
          const user = await findOrCreateUser(
            admin,
            `${username}@demo.artisan.market`,
            name,
            "vendor",
            {
              craft_type: craft,
              gi_certified: false,
              preferred_language: language,
              location_state: state,
            },
          );

          vendorUsers.push({
            id: user.id,
            name,
            craft,
            state,
          });

          const { error } = await admin
            .from("profiles")
            .update({
              role: "vendor",
              full_name: name,
              preferred_language: language,
              location_state: state,
            })
            .eq("id", user.id);

          if (error) {
            throw new Error(
              `Profile update failed for ${username}: ${JSON.stringify(
                error,
              )}`,
            );
          }

          const vendorIndex = VENDORS.findIndex(
            (vendor) => vendor[0] === username,
          );

          const { error: vendorError } = await admin
            .from("vendors")
            .upsert(
              {
                id: user.id,
                craft_type: craft,
                gi_certified: vendorIndex % 2 === 0,
                verification_status: "verified",
              },
              { onConflict: "id" },
            );

          if (vendorError) {
            throw new Error(
              `Vendor record failed for ${username}: ${JSON.stringify(
                vendorError,
              )}`,
            );
          }
        }

        const buyerUsers: Array<{
          id: string;
          name: string;
        }> = [];

        for (const [
          username,
          name,
          state,
          language,
        ] of BUYERS) {
          const user = await findOrCreateUser(
            admin,
            `${username}@demo.artisan.market`,
            name,
            "consumer",
            {
              preferred_language: language,
              location_state: state,
            },
          );

          buyerUsers.push({
            id: user.id,
            name,
          });

          const { error } = await admin
            .from("profiles")
            .update({
              role: "consumer",
              full_name: name,
              preferred_language: language,
              location_state: state,
            })
            .eq("id", user.id);

          if (error) {
            throw new Error(
              `Buyer profile update failed for ${username}: ${JSON.stringify(
                error,
              )}`,
            );
          }
        }

        const productRows = PRODUCTS.map(
          ([title, category, material, price], index) => {
            const vendor =
              vendorUsers[index % vendorUsers.length];

            return {
              id: deterministicUuid(
                index + 1,
                0x10000000,
              ),
              vendor_id: vendor.id,
              original_image_url: DEMO_IMAGE_URL,
              studio_image_url: DEMO_IMAGE_URL,
              enhanced_image_url: DEMO_IMAGE_URL,
              language_used: "en",
              title_en: title,
              title_hi: title,
              description_en:
                `Traditional ${title.toLowerCase()} handcrafted by ${vendor.name}.`,
              description_hi:
                `पारंपरिक रूप से तैयार किया गया ${title}।`,
              category,
              materials_cost: Math.round(price * 0.35),
              labor_days: 2 + (index % 8),
              suggested_price: price,
              final_price: price,
              stock_count: 100,
              status: "published",
              title: `[DEMO] ${title}`,
              material,
              raw_description:
                `Handcrafted ${title.toLowerCase()}.`,
              quantity: 100,
              material_cost: Math.round(price * 0.35),
              labour_days: 2 + (index % 8),
              enhancement_status: "completed",
              conversation_state: {},
              catalog_status: "complete",
            };
          },
        );

        const { error: productError } = await admin
          .from("products")
          .upsert(productRows, {
            onConflict: "id",
          });

        if (productError) {
          throw new Error(
            `Product seed failed: ${JSON.stringify(
              productError,
            )}`,
          );
        }

        const orderRows: any[] = [];
        const orderItemRows: any[] = [];
        const paymentRows: any[] = [];

        for (let i = 0; i < 150; i++) {
          const buyer =
            buyerUsers[i % buyerUsers.length];

          const orderId = deterministicUuid(
            i + 1,
            0x20000000,
          );

          const itemCount = 1 + (i % 3);
          let orderTotal = 0;

          for (let j = 0; j < itemCount; j++) {
            const productIndex =
              (i * 3 + j * 7) %
              productRows.length;

            const product =
              productRows[productIndex];

            const quantity =
              i % 11 === 0
                ? 4
                : i % 5 === 0
                  ? 2
                  : 1;

            const unitPrice =
              Number(product.final_price);

            const subtotal =
              unitPrice * quantity;

            orderTotal += subtotal;

            orderItemRows.push({
              id: deterministicUuid(
                i * 10 + j + 1,
                0x30000000,
              ),
              order_id: orderId,
              product_id: product.id,
              vendor_id: product.vendor_id,
              quantity,
              unit_price: unitPrice,
            });
          }

          const orderStatus =
            i % 17 === 0
              ? "cancelled"
              : i % 23 === 0
                ? "processing"
                : i % 7 === 0
                  ? "shipped"
                  : "delivered";

          orderRows.push({
            id: orderId,
            buyer_id: buyer.id,
            total_amount: orderTotal,
            status: orderStatus,
            shipping_address:
              `${buyer.name}, India`,
          });

          const paymentStatus =
            orderStatus === "cancelled"
              ? "cancelled"
              : i % 29 === 0
                ? "failed"
                : i % 31 === 0
                  ? "pending"
                  : "success";

          paymentRows.push({
            id: deterministicUuid(
              i + 1,
              0x40000000,
            ),
            order_id: orderId,
            buyer_id: buyer.id,
            payment_method: "upi",
            upi_app: [
              "Google Pay",
              "PhonePe",
              "Paytm",
              "BHIM",
            ][i % 4],
            transaction_id:
              `DEMO-UPI-${String(i + 1).padStart(
                6,
                "0",
              )}`,
            amount: orderTotal,
            status: paymentStatus,
          });
        }

        const { error: ordersError } =
          await admin
            .from("orders")
            .upsert(orderRows, {
              onConflict: "id",
            });

        if (ordersError) {
          throw new Error(
            `Order seed failed: ${JSON.stringify(
              ordersError,
            )}`,
          );
        }

        const { error: itemsError } =
          await admin
            .from("order_items")
            .upsert(orderItemRows, {
              onConflict: "id",
            });

        if (itemsError) {
          throw new Error(
            `Order item seed failed: ${JSON.stringify(
              itemsError,
            )}`,
          );
        }

        const { error: paymentsError } =
          await admin
            .from("payments")
            .upsert(paymentRows, {
              onConflict: "id",
            });

        if (paymentsError) {
          throw new Error(
            `Payment seed failed: ${JSON.stringify(
              paymentsError,
            )}`,
          );
        }

        const reviewRows: any[] = [];
        const reviewedPairs = new Set<string>();

        for (let i = 0; i < orderRows.length; i++) {
          const order = orderRows[i];

          if (order.status !== "delivered") {
            continue;
          }

          const items = orderItemRows.filter(
            (item) =>
              item.order_id === order.id,
          );

          for (const item of items) {
            const pairKey =
              `${order.buyer_id}:${item.product_id}`;

            if (reviewedPairs.has(pairKey)) {
              continue;
            }

            reviewedPairs.add(pairKey);

            reviewRows.push({
              id: deterministicUuid(
                reviewRows.length + 1,
                0x50000000,
              ),
              vendor_id: item.vendor_id,
              product_id: item.product_id,
              consumer_id: order.buyer_id,
              order_id: order.id,
              rating:
                reviewRows.length % 13 === 0
                  ? 3
                  : reviewRows.length % 19 === 0
                    ? 4
                    : 5,
              comment:
                REVIEW_TEXT[
                  reviewRows.length %
                    REVIEW_TEXT.length
                ],
            });

            if (reviewRows.length >= 75) {
              break;
            }
          }

          if (reviewRows.length >= 75) {
            break;
          }
        }

        const { error: reviewsError } =
          await admin
            .from("customer_reviews")
            .upsert(reviewRows, {
              onConflict: "id",
            });

        if (reviewsError) {
          throw new Error(
            `Review seed failed: ${JSON.stringify(
              reviewsError,
            )}`,
          );
        }

        for (const product of productRows) {
          const sold =
            orderItemRows
              .filter((item) => {
                const order =
                  orderRows.find(
                    (o) =>
                      o.id === item.order_id,
                  );

                return (
                  item.product_id ===
                    product.id &&
                  order?.status ===
                    "delivered"
                );
              })
              .reduce(
                (sum, item) =>
                  sum +
                  Number(item.quantity),
                0,
              );

          const remaining = Math.max(
            0,
            100 - sold,
          );

          const { error } =
            await admin
              .from("products")
              .update({
                stock_count: remaining,
                quantity: remaining,
              })
              .eq("id", product.id);

          if (error) {
            throw new Error(
              `Stock update failed for product ${product.id}: ${JSON.stringify(
                error,
              )}`,
            );
          }
        }

        return Response.json({
          success: true,
          message:
            "Demo marketplace dataset seeded successfully.",
          counts: {
            vendors: vendorUsers.length,
            buyers: buyerUsers.length,
            products: productRows.length,
            orders: orderRows.length,
            order_items:
              orderItemRows.length,
            payments: paymentRows.length,
            reviews: reviewRows.length,
          },
          demo_password: DEMO_PASSWORD,
        });
      } catch (error) {
        console.error(
          "seed-demo-data failed:",
          error,
        );

        let errorDetails: unknown;

        if (error instanceof Error) {
          errorDetails = error.message;
        } else if (
          typeof error === "object" &&
          error !== null
        ) {
          errorDetails = error;
        } else {
          errorDetails = String(error);
        }

        return Response.json(
          {
            success: false,
            error: errorDetails,
          },
          { status: 500 },
        );
      }
    },
  ),
};