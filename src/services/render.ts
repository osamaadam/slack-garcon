import { GarconReply, computeSplit } from "./reply";

type Block = Record<string, unknown>;

const money = (n: number) => n.toFixed(2);
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

// Sortable, full-width table; Slack requires a caption and only plain-text cells
// here (raw_number is rejected), and the first row is the header.
function dataTable(caption: string, head: string[], rows: string[][]): Block {
  const cell = (text: string) => ({ type: "raw_text", text: text || "—" });
  // page_size defaults to 5, which would hide people behind a pager.
  return { type: "data_table", caption, page_size: 100, rows: [head.map(cell), ...rows.map((r) => r.map(cell))] };
}

const md = (text: string): Block => ({ type: "markdown", text });

const itemLabel = (i: { item_ar: string; qty: number; notes_ar: string }) =>
  `${qty(i.qty)} × ${i.item_ar}${i.notes_ar ? ` (${i.notes_ar})` : ""}`;

function orderBlocks(reply: GarconReply): Block[] {
  const people = reply.orders.filter((o) => o.items.length);
  if (!people.length) return [];

  const totals = new Map<string, { qty: number; notes: string[] }>();
  for (const o of people) {
    for (const i of o.items) {
      const t = totals.get(i.item_ar) ?? { qty: 0, notes: [] };
      t.qty += i.qty;
      if (i.notes_ar) t.notes.push(`${qty(i.qty)} ${i.notes_ar}`);
      totals.set(i.item_ar, t);
    }
  }

  return [
    dataTable("📋 الطلبات", ["الاسم", "الطلب"], people.map((o) => [o.person, o.items.map(itemLabel).join("، ")])),
    dataTable(
      "🛵 الأوردر للمطعم",
      ["الصنف", "العدد", "ملاحظات"],
      [...totals].map(([name, t]) => [name, qty(t.qty), t.notes.join("، ")])
    ),
  ];
}

function splitBlocks(reply: GarconReply): Block[] {
  const receipt = reply.receipt;
  if (!receipt || !receipt.lines.length) return [];
  const split = computeSplit(receipt);
  const estimate = reply.kind === "estimate";

  const itemsOf = (person: string) =>
    receipt.lines
      .flatMap((l) => l.shares.filter((s) => s.person === person).map((s) => `${qty(s.qty)} × ${l.item_ar}`))
      .join("، ");

  const out: Block[] = [
    dataTable(
      estimate ? "💭 تقدير الحساب (قبل الإيصال)" : "💰 تقسيم الحساب",
      ["الاسم", "الأصناف", "الأكل", ...split.feeLabels, "الإجمالي"],
      split.people.map((p) => [
        p.coveredBy ? `${p.person} (على ${p.coveredBy})` : p.person,
        itemsOf(p.person),
        money(p.items),
        ...p.fees.map(money),
        money(p.total),
      ])
    ),
  ];

  const lines: string[] = [];
  if (split.people.some((p) => p.coveredBy)) {
    const owed = new Map<string, number>();
    for (const p of split.people) {
      const who = p.coveredBy ?? p.person;
      owed.set(who, (owed.get(who) ?? 0) + p.total);
    }
    lines.push("👥 بعد التحويلات: " + [...owed].map(([who, n]) => `**${who}** ${money(n)}`).join(" • "));
  }
  if (receipt.paid_by) lines.push(`💸 **${receipt.paid_by}** دفع الفاتورة، الكل يحوّل له نصيبه.`);

  if (estimate) {
    lines.push("⚠️ ده تقدير بأسعار تقريبية، الإيصال الحقيقي هو اللي يحكم.");
  } else {
    const ok = Math.abs(split.sum - receipt.total) < 0.01;
    lines.push(
      ok
        ? `🧾 مجموع الحصص ${money(split.sum)} = إجمالي الإيصال ${money(receipt.total)} ج.م ✅`
        : `⚠️ مجموع الحصص ${money(split.sum)} مش زي إجمالي الإيصال ${money(receipt.total)}، راجعوا الإيصال.`
    );
    if (split.roundingFix) {
      lines.push(`فرق تقريب ${money(split.roundingFix.amount)} اتضاف على ${split.roundingFix.person}.`);
    }
  }
  out.push(md(lines.join("\n")));
  return out;
}

export function renderReply(reply: GarconReply): { text: string; blocks: Block[] } {
  const blocks: Block[] = [md(reply.intro)];
  if (reply.kind === "orders") blocks.push(...orderBlocks(reply));
  if (reply.kind === "split" || reply.kind === "estimate") blocks.push(...splitBlocks(reply));
  if (reply.notes.length) blocks.push(md(reply.notes.map((n) => `> ${n}`).join("\n")));

  if (reply.kind !== "chat") {
    blocks.push({
      type: "context_actions",
      elements: [
        {
          type: "feedback_buttons",
          action_id: "garcon_feedback",
          positive_button: { text: { type: "plain_text", text: "👍" }, value: "good" },
          negative_button: { text: { type: "plain_text", text: "👎" }, value: "bad" },
        },
      ],
    });
  }
  return { text: reply.intro, blocks };
}
