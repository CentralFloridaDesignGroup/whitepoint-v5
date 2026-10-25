import type { InvoiceDisposition, InvoiceSplitBasis } from '@whitepoint/types'

export type AllocationValues = {
  disposition: InvoiceDisposition; splitBasis: InvoiceSplitBasis;
  sourceHoursHundredths: number; billedHoursHundredths: number; writeoffHoursHundredths: number;
  sourceChargeCents: number; billedChargeCents: number; writeoffChargeCents: number;
}

export function allocateEntry(hours: number, chargeCents: number, disposition: Exclude<InvoiceDisposition,'hold'>, splitBasis: InvoiceSplitBasis = null, splitValue?: number): AllocationValues {
  const sourceHoursHundredths = Math.round(hours * 100)
  if (!Number.isFinite(hours) || Math.abs(hours * 100 - sourceHoursHundredths) > 0.000001 || sourceHoursHundredths < 1 || !Number.isSafeInteger(chargeCents) || chargeCents < 0) throw new Error('Invalid source hours or charge.')
  let billedHoursHundredths = disposition === 'write-off' ? 0 : sourceHoursHundredths
  let billedChargeCents = disposition === 'write-off' ? 0 : chargeCents
  if (disposition === 'split') {
    if (splitBasis === 'hours') {
      const value = Number(splitValue)
      billedHoursHundredths = Math.round(value * 100)
      if (!Number.isFinite(value) || Math.abs(value * 100 - billedHoursHundredths) > 0.000001) throw new Error('Use hundredths of an hour.')
      billedChargeCents = Math.round(chargeCents * billedHoursHundredths / sourceHoursHundredths)
    } else if (splitBasis === 'charge') {
      billedChargeCents = Number(splitValue)
      if (!Number.isSafeInteger(billedChargeCents) || chargeCents === 0) throw new Error('Enter a whole-cent client charge greater than zero.')
      billedHoursHundredths = Math.round(sourceHoursHundredths * billedChargeCents / chargeCents)
    } else throw new Error('Choose hours or client charge for the split.')
    if (billedHoursHundredths <= 0 || billedHoursHundredths >= sourceHoursHundredths || billedChargeCents < 0 || billedChargeCents > chargeCents || chargeCents > 0 && (billedChargeCents === 0 || billedChargeCents === chargeCents)) throw new Error('A split needs nonzero billed and written off portions.')
  } else if (disposition !== 'billed' && disposition !== 'write-off') throw new Error('Invalid entry decision.')
  return { disposition, splitBasis: disposition === 'split' ? splitBasis : null, sourceHoursHundredths, billedHoursHundredths, writeoffHoursHundredths: sourceHoursHundredths - billedHoursHundredths, sourceChargeCents: chargeCents, billedChargeCents, writeoffChargeCents: chargeCents - billedChargeCents }
}

export function allocateInvoiceDecision(hours:number,chargeCents:number,disposition:InvoiceDisposition,splitBasis:InvoiceSplitBasis=null,splitValue?:number,splitRemainder:'hold'|'write-off'='write-off'){
  if(disposition==='hold'){
    const source=allocateEntry(hours,chargeCents,'billed')
    return {...source,disposition, billedHoursHundredths:0,billedChargeCents:0,writeoffHoursHundredths:0,writeoffChargeCents:0,heldHoursHundredths:source.sourceHoursHundredths,heldChargeCents:chargeCents}
  }
  const value=allocateEntry(hours,chargeCents,disposition,splitBasis,splitValue)
  if(disposition==='split'&&splitRemainder==='hold')return {...value,writeoffHoursHundredths:0,writeoffChargeCents:0,heldHoursHundredths:value.writeoffHoursHundredths,heldChargeCents:value.writeoffChargeCents}
  return {...value,heldHoursHundredths:0,heldChargeCents:0}
}
