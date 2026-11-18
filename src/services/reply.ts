// Structured reply: the model extracts who ordered what and how the receipt maps
// to people; code does the arithmetic and builds the Slack blocks, so the money
// never depends on the model's math.

export interface ReplyItem {
  item_ar: string;
  qty: number;
  notes_ar: string;
}

export interface ReceiptLine {
  item_ar: string;
  qty: number;
  amount: number;
  shares: { person: string; qty: number }[];
}

export interface Fee {
  label_ar: string;
  amount: number;
  split: "equal" | "proportional";
  people: string[];
}

export interface GarconReply {
  intro: string;
  outro: string;
  kind: "orders" | "split" | "estimate" | "chat";
  orders: { person: string; items: ReplyItem[] }[];
  receipt: {
    lines: ReceiptLine[];
    fees: Fee[];
    total: number;
    paid_by: string | null;
    pays_for: { payer: string; for_person: string }[];
  } | null;
  menu_source: {
    kind: "talabat" | "web" | "guess";
    restaurant: string;
    branch: string;
    url: string;
  } | null;
  notes: string[];
}

const item = {
  type: "object",
  additionalProperties: false,
  required: ["item_ar", "qty", "notes_ar"],
  properties: {
    item_ar: { type: "string" },
    qty: { type: "number" },
    notes_ar: { type: "string" },
  },
};

export const replySchema = {
  type: "object",
  additionalProperties: false,
  required: ["intro", "outro", "kind", "orders", "receipt", "menu_source", "notes"],
  properties: {
    intro: { type: "string" },
    outro: { type: "string" },
    kind: { type: "string", enum: ["orders", "split", "estimate", "chat"] },
    orders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["person", "items"],
        properties: {
          person: { type: "string" },
          items: { type: "array", items: item },
        },
      },
    },
    receipt: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["lines", "fees", "total", "paid_by", "pays_for"],
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item_ar", "qty", "amount", "shares"],
            properties: {
              item_ar: { type: "string" },
              qty: { type: "number" },
              amount: { type: "number" },
              shares: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["person", "qty"],
                  properties: {
                    person: { type: "string" },
                    qty: { type: "number" },
                  },
                },
              },
            },
          },
        },
        fees: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label_ar", "amount", "split", "people"],
            properties: {
              label_ar: { type: "string" },
              amount: { type: "number" },
              split: { type: "string", enum: ["equal", "proportional"] },
              people: { type: "array", items: { type: "string" } },
            },
          },
        },
        total: { type: "number" },
        paid_by: { type: ["string", "null"] },
        pays_for: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["payer", "for_person"],
            properties: {
              payer: { type: "string" },
              for_person: { type: "string" },
            },
          },
        },
      },
    },
    menu_source: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["kind", "restaurant", "branch", "url"],
      properties: {
        kind: { type: "string", enum: ["talabat", "web", "guess"] },
        restaurant: { type: "string" },
        branch: { type: "string" },
        url: { type: "string" },
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

export interface PersonShare {
  person: string;
  items: number;
  fees: number[];
  total: number;
  coveredBy?: string;
}

export interface Split {
  people: PersonShare[];
  feeLabels: string[];
  sum: number;
  receiptTotal: number;
  linesPlusFees: number;
  roundingFix: { person: string; amount: number } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeSplit(receipt: NonNullable<GarconReply["receipt"]>): Split {
  const items = new Map<string, number>();
  for (const line of receipt.lines) {
    const sharedQty = line.shares.reduce((n, s) => n + s.qty, 0) || 1;
    for (const s of line.shares) {
      items.set(s.person, (items.get(s.person) ?? 0) + (line.amount * s.qty) / sharedQty);
    }
  }
  const everyone = [...items.keys()];
  const fees = receipt.fees.filter((f) => f.amount !== 0);
  const raw = everyone.map((person) => {
    const own = items.get(person)!;
    const feeShares = fees.map((f) => {
      const group = f.people.length ? f.people.filter((p) => items.has(p)) : everyone;
      if (!group.includes(person)) return 0;
      if (f.split === "equal") return f.amount / group.length;
      const base = group.reduce((n, p) => n + items.get(p)!, 0);
      return base ? (f.amount * own) / base : 0;
    });
    return { person, items: own, fees: feeShares, total: own + feeShares.reduce((a, b) => a + b, 0) };
  });

  const people: PersonShare[] = raw.map((r) => ({
    person: r.person,
    items: round2(r.items),
    fees: r.fees.map(round2),
    total: round2(r.total),
  }));

  const linesPlusFees = round2(
    receipt.lines.reduce((n, l) => n + l.amount, 0) + fees.reduce((n, f) => n + f.amount, 0)
  );
  // Rounded shares can miss the exact total by a few piasters; the largest share absorbs it.
  let roundingFix: Split["roundingFix"] = null;
  const diff = round2(linesPlusFees - people.reduce((n, p) => n + p.total, 0));
  if (diff !== 0 && Math.abs(diff) <= 0.05 && people.length) {
    const largest = people.reduce((a, b) => (b.total > a.total ? b : a));
    largest.total = round2(largest.total + diff);
    roundingFix = { person: largest.person, amount: diff };
  }

  for (const { payer, for_person } of receipt.pays_for) {
    const p = people.find((x) => x.person === for_person);
    if (p && payer !== for_person) p.coveredBy = payer;
  }

  return {
    people,
    feeLabels: fees.map((f) => f.label_ar),
    sum: round2(people.reduce((n, p) => n + p.total, 0)),
    receiptTotal: receipt.total,
    linesPlusFees,
    roundingFix,
  };
}
