export function checkoutIdentity(token: string, invoice: { id: string; balanceCents: number }): string {
  return JSON.stringify([token, invoice.id, invoice.balanceCents]);
}

type Confirmation = { type: string; error?: { message?: string } };

export async function confirmCheckout(confirm: () => Promise<Confirmation>, onComplete: () => void): Promise<string> {
  try {
    const result = await confirm();
    if (result.type === 'error') return result.error?.message || 'Payment could not be completed.';
    onComplete();
    return 'Payment submitted. The balance will update when Stripe confirms it.';
  } catch (cause) {
    return cause instanceof Error ? cause.message : 'Payment could not be completed.';
  }
}
