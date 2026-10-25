import { useEffect, useState } from "react";

const diagramLg = `flowchart LR
  sent["Invoice sent to customer"]
  qbo_inv_post["Invoice posted to QBO"]
  d1_store["Invoice saved to database"]

  payment_entry(["Payment received"])
  payment_manual["Manual Payment
  Check / Cash"]
  payment_stripe["Stripe Payment"]

  qbo_payment_manual["Payment submitted under
    **Payment Deposit Account**"]

  stripe_reconciled_payout["Stripe provided validated payout notice"]
  stripe_clearinghouse["Net invoice cost as transaction to
    **Stripe Clearing Account**"]
  stripe_fee["Fee payment posted to
    **Stripe Fee Expense Account**"]
  stripe_bank["Revenue deposit posted to
    **Stripe Payout Bank Account**"]

  sent --> d1_store
  d1_store --> qbo_inv_post
  qbo_inv_post -.->|time passes| payment_entry
  payment_entry -->payment_manual
  payment_entry -->payment_stripe

  payment_manual -->qbo_payment_manual

  payment_stripe -.->|stripe processes payment| stripe_reconciled_payout
  stripe_reconciled_payout --> stripe_clearinghouse
  stripe_clearinghouse --> stripe_fee
  stripe_clearinghouse --> stripe_bank

  classDef local fill:#eff6ff,stroke:#2563eb,color:#0f172a
  classDef qbo fill:#ecfdf5,stroke:#059669,color:#0f172a
  classDef stripe fill:#f5f3ff,stroke:#7c3aed,color:#0f172a

  class sent,d1_store,payment_manual local
  class qbo_inv_post,qbo_payment_manual,stripe_clearinghouse,stripe_fee,stripe_bank qbo
  class payment_stripe,stripe_reconciled_payout stripe`;

const diagramSm = `flowchart TB
  sent["Invoice sent to customer"]
  qbo_inv_post["Invoice posted to QBO"]
  d1_store["Invoice saved to database"]

  payment_entry(["Payment received"])
  payment_manual["Manual Payment
  Check / Cash"]
  payment_stripe["Stripe Payment"]

  qbo_payment_manual["Payment submitted under
    **Payment Deposit Account**"]

  stripe_reconciled_payout["Stripe provides validated payout notice"]
  stripe_clearinghouse["Net invoice cost as transaction to
    **Stripe Clearing Account**"]
  stripe_fee["Fee payment posted to
    **Stripe Fee Expense Account**"]
  stripe_bank["Revenue deposit posted to
    **Stripe Payout Bank Account**"]

  sent --> d1_store
  d1_store --> qbo_inv_post
  qbo_inv_post -.->|time passes| payment_entry
  payment_entry -->payment_manual
  payment_entry -->payment_stripe

  payment_manual -->qbo_payment_manual

  payment_stripe -.->|stripe processes payment| stripe_reconciled_payout
  stripe_reconciled_payout --> stripe_clearinghouse
  stripe_clearinghouse --> stripe_fee
  stripe_clearinghouse --> stripe_bank

  classDef local fill:#eff6ff,stroke:#2563eb,color:#0f172a
  classDef qbo fill:#ecfdf5,stroke:#059669,color:#0f172a
  classDef stripe fill:#f5f3ff,stroke:#7c3aed,color:#0f172a

  class sent,d1_store,payment_manual local
  class qbo_inv_post,qbo_payment_manual,stripe_clearinghouse,stripe_fee,stripe_bank qbo
  class payment_stripe,stripe_reconciled_payout stripe`;

let renderSequence = 0;
let initialized = false;

export function QboTransactionFlow() {
  const [svgBig, setSvgBig] = useState("");
  const [svgSmall, setSvgSmall] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        if (!initialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            layout: "dagre",
            look: "classic",
          });
          initialized = true;
        }
        const result = await mermaid.render(
          `qbo-transaction-flow-${++renderSequence}`,
          diagramLg,
        );
        if (active) setSvgBig(result.svg);
        const resultSmall = await mermaid.render(
          `qbo-transaction-flow-sm-${++renderSequence}`,
          diagramSm,
        );
        if (active) setSvgSmall(resultSmall.svg);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-3 p-5" aria-labelledby="qbo-flow-title">
      <div>
        <h2 id="qbo-flow-title" className="text-lg font-semibold">
          How transactions reach QuickBooks
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          White Point records invoice balances first. QuickBooks receives the
          accounting transactions at the steps shown below.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-slate-600">
          The flowchart could not be displayed. The transaction steps are
          described below.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-slate-50 p-4">
          { svgBig && (
            <div
              role="img"
              aria-label="Sending an invoice attempts QuickBooks invoice sync. Offline payments credit White Point and post to the selected QuickBooks deposit account. Stripe confirmation credits White Point; a reconciled, paid payout then posts a QuickBooks payment to clearing, any charged fee as a purchase, and a transfer to the payout bank."
              className="hidden md:block min-w-[720px] [&_svg]:mx-auto"
              dangerouslySetInnerHTML={{ __html: svgBig }}
            />
          )}
          { svgSmall && (
            <div
              role="img"
              aria-label="Sending an invoice attempts QuickBooks invoice sync. Offline payments credit White Point and post to the selected QuickBooks deposit account. Stripe confirmation credits White Point; a reconciled, paid payout then posts a QuickBooks payment to clearing, any charged fee as a purchase, and a transfer to the payout bank."
              className="md:hidden [&_svg]:mx-auto"
              dangerouslySetInnerHTML={{ __html: svgSmall }}
            />
          )}
        </div>
      )}
      <p className="text-sm text-slate-600">
        A Stripe payment reduces the White Point balance when confirmed. Its
        QuickBooks payment, any fee, and bank transfer wait for a reconciled,
        paid payout. Offline payments post to QuickBooks when recorded. Sync
        failures remain available for retry; refunds and disputes can require
        finance review and a QuickBooks payment correction.
      </p>
    </section>
  );
}
