export function reminderWindow(timestamp:number){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]))
  if(parts.weekday!=='Mon'||!['09','16'].includes(parts.hour||''))return null
  const day=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`)
  if(Number.isNaN(day.valueOf()))return null
  day.setUTCDate(day.getUTCDate()-7)
  return {weekStart:day.toISOString().slice(0,10),kind:parts.hour==='09'?'missing' as const:'report' as const}
}
