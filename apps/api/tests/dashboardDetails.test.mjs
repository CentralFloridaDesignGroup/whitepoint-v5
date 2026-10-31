import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardDetails } from '../src/services/dashboardDetails.ts'

function database(data = {}) {
  const calls=[]
  return { calls, prepare(sql) {
    calls.push(sql)
    let params = []
    const key = sql.includes('FROM projects p JOIN clients c') ? 'projects'
      : sql.includes('LEFT JOIN invoice_lines') ? 'invoices'
        : sql.includes('SELECT ip.invoice_id') ? 'paid'
          : sql.includes('SELECT ip.id,ip.invoice_id') ? 'monthPayments'
            : sql.includes('FROM users_named') ? 'users'
              : sql.includes('e.billing_type NOT IN') ? 'utilizationEntries'
                : sql.includes('SELECT e.id,e.entry_date,e.hours,e.cost_cents') ? 'laborEntries' : ''
    return { bind(...values) { params = values; return this }, async all() {
      let rows=data[key]||[]
      if(key==='utilizationEntries') rows=rows.filter(row=>!['non-billable','project'].includes(row.billing_type))
      if(key==='projects') {
        const stage=sql.match(/p\.stage='([^']+)'/)?.[1]
        if(stage) rows=rows.filter(row=>row.stage===stage)
        if(sql.includes('p.due_date>=?')) rows=rows.filter(row=>row.due_date>=params[0]&&row.due_date<=params[1])
        if(sql.includes('p.due_date<?')) rows=rows.filter(row=>row.due_date<params[0])
      }
      return { results:rows, params }
    } }
  } }
}

const access = { projects: true, invoices: true, utilization: true, multiplier: true }
const now = new Date('2026-10-29T16:00:00Z')

test('project metrics return matching project records and enforce the projects permission', async () => {
  const db = database({ projects: [{ id:'p1',project_number:'P-1',project_name:'New Survey',stage:'opportunity',client_name:'Sample Co',due_date:null }] })
  const result = await dashboardDetails(db,'project-opportunity',access,undefined,now)
  assert.equal(result.title,'Opportunities')
  assert.deepEqual(result.sections[0].rows[0],{id:'p1',kind:'project',label:'P-1 · New Survey',description:'Sample Co',status:'opportunity',date:''})
  await assert.rejects(dashboardDetails(db,'project-active',{...access,projects:false},undefined,now),/FORBIDDEN/)
})

test('project due-date drilldowns use the inclusive seven-day window', async () => {
  const db=database({projects:[
    {id:'today',project_number:'P-1',project_name:'Due today',stage:'active',client_name:'Client',due_date:'2026-10-29'},
    {id:'limit',project_number:'P-2',project_name:'Due at limit',stage:'active',client_name:'Client',due_date:'2026-11-05'},
    {id:'beyond',project_number:'P-3',project_name:'Beyond limit',stage:'active',client_name:'Client',due_date:'2026-11-06'},
    {id:'late',project_number:'P-4',project_name:'Past due',stage:'active',client_name:'Client',due_date:'2026-10-28'},
  ]})
  const due=await dashboardDetails(db,'project-due-soon',access,undefined,now)
  const overdue=await dashboardDetails(db,'project-overdue',access,undefined,now)
  assert.deepEqual(due.sections[0].rows.map(row=>row.id),['today','limit'])
  assert.deepEqual(overdue.sections[0].rows.map(row=>row.id),['late'])
})

test('invoice drilldowns partition partial, paid, late, outstanding, and draft values', async () => {
  const db = database({
    invoices:[
      {id:'late',invoice_number:'I-1',status:'sent',due_date:'2026-10-01',project_id:'p1',project_number:'P-1',project_name:'A',client_name:'Client',total_cents:10000},
      {id:'open',invoice_number:'I-2',status:'sent',due_date:'2026-11-01',project_id:'p1',project_number:'P-1',project_name:'A',client_name:'Client',total_cents:8000},
      {id:'paid',invoice_number:'I-3',status:'paid',due_date:'2026-10-01',project_id:'p1',project_number:'P-1',project_name:'A',client_name:'Client',total_cents:6000},
      {id:'draft',invoice_number:'I-4',status:'draft',due_date:'2026-11-30',project_id:'p1',project_number:'P-1',project_name:'A',client_name:'Client',total_cents:4000},
    ],
    paid:[{invoice_id:'late',net_cents:2000},{invoice_id:'open',net_cents:3000},{invoice_id:'paid',net_cents:7000}],
  })
  const detail = async metric => (await dashboardDetails(db,metric,access,undefined,now)).sections[0].rows
  assert.equal((await detail('invoice-late'))[0].amountCents,8000)
  assert.equal((await detail('invoice-outstanding'))[0].amountCents,5000)
  assert.equal((await detail('invoice-draft'))[0].amountCents,4000)
  assert.equal((await detail('invoice-paid')).reduce((sum,row)=>sum+row.amountCents,0),11000)
  assert.equal((await detail('invoice-all')).length,4)
  await assert.rejects(dashboardDetails(db,'invoice-late',{...access,invoices:false},undefined,now),/FORBIDDEN/)
})

test('month drilldown returns the selected month sent invoices and receipts', async () => {
  const db = database({
    invoices:[{id:'i1',invoice_number:'I-1',status:'sent',sent_at:'2026-10-15 14:00:00',due_date:'2026-11-15',project_id:'p1',project_number:'P-1',project_name:'A',client_name:'Client',total_cents:10000}],
    paid:[],
    monthPayments:[
      {id:'pay1',invoice_id:'i1',invoice_number:'I-1',paid_at:'2026-10-20 15:00:00',method:'check',net_cents:3000,project_id:'p1',project_number:'P-1',project_name:'A',client_name:'Client'},
      {id:'pay2',invoice_id:'i1',invoice_number:'I-1',paid_at:'2026-11-01 05:00:00',method:'card',net_cents:2000,project_id:'p1',project_number:'P-1',project_name:'A',client_name:'Client'},
    ],
  })
  const result = await dashboardDetails(db,'month',access,'2026-10',now)
  assert.equal(result.sections[0].rows.length,1)
  assert.equal(result.sections[1].rows.length,1)
  assert.equal(result.sections[1].rows[0].amountCents,3000)
  await assert.rejects(dashboardDetails(db,'month',access,'2025-01',now),/INVALID_MONTH/)
})

test('utilization and missing-target drilldowns preserve dashboard target rules', async () => {
  const db = database({
    users:[
      {id:'default',display_name:'Default Staff',email:'d@example.test',weekly_hours:null},
      {id:'part',display_name:'Part Time',email:'p@example.test',weekly_hours:20},
      {id:'missing',display_name:'Missing Target',email:'m@example.test',weekly_hours:0},
      {id:'exempt',display_name:'Exempt',email:'e@example.test',weekly_hours:-1},
    ],
    utilizationEntries:[
      {user_id:'default',hours:10,billing_type:'fixed-fee'},
      {user_id:'part',hours:12,billing_type:'time-and-materials'},
      {user_id:'part',hours:3,billing_type:'non-billable'},
    ],
  })
  const utilization = await dashboardDetails(db,'utilization',access,undefined,now)
  assert.deepEqual(utilization.sections[0].rows.map(row=>[row.label,row.hours,row.targetHours]),[['Default Staff',10,160],['Part Time',12,80]])
  assert.ok(db.calls.some(sql=>sql.includes("w.status='approved'")&&sql.includes("e.billing_type NOT IN ('non-billable','project')")))
  const missing = await dashboardDetails(db,'missing-targets',access,undefined,now)
  assert.deepEqual(missing.sections[0].rows.map(row=>row.label),['Missing Target'])
  await assert.rejects(dashboardDetails(db,'utilization',{...access,utilization:false},undefined,now),/FORBIDDEN/)
})

test('income multiplier detail requires both financial permissions', async () => {
  const db = database({
    invoices:[{id:'sent',invoice_number:'I-1',status:'sent',sent_at:'2026-10-15 14:00:00',due_date:'2026-11-15',project_id:'p1',project_number:'P-1',project_name:'A',client_name:'Client',total_cents:10000}],
    paid:[],
    laborEntries:[{id:'cost',entry_date:'2026-10-20',hours:5,cost_cents:5000,project_id:'p1',project_number:'P-1',project_name:'A',display_name:'Staff'}],
  })
  await assert.rejects(dashboardDetails(db,'income-multiplier',{...access,multiplier:false},undefined,now),/FORBIDDEN/)
  const detail=await dashboardDetails(db,'income-multiplier',access,undefined,now)
  assert.equal(detail.sections[0].rows[0].amountCents,10000)
  assert.equal(detail.sections[1].rows[0].amountCents,5000)
  await assert.rejects(dashboardDetails(db,'unknown',access,undefined,now),/INVALID_METRIC/)
})
