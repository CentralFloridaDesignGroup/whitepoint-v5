export type Entry = {id:string;projectId:string;projectNumber:string;projectName:string;taskId:string|null;taskName:string|null;entryDate:string;hours:number;note:string;costCents?:number;chargeCents?:number}
export type TimesheetStatus = 'draft'|'submitted'|'approved'|'rejected'
export type Week = {id:string|null;userId:string;userName:string;weekStart:string;status:TimesheetStatus;revision:number;canReview:boolean;canEdit:boolean;canSubmit:boolean;rejectionReason:string|null;entries:Entry[]}
export type WeekSummary = {id:string;user_id:string;week_start:string;status:Week['status'];revision:number;entry_count:number;total_hours:number}
export type RosterUser = {userId:string;displayName:string;firstName:string;lastName:string;managerUserId:string|null;status:TimesheetStatus;hasWeek:boolean}
export type Lookups = {projects:Array<{id:string;project_number:string;name:string}>;tasks:Array<{id:string;project_id:string;task_name:string}>}
export type Review = {id:string;user_id:string;week_start:string;status:Week['status'];display_name:string}
export type PoolEntry = {entry_id:string;user_id:string;week_start:string;project_id:string;entry_date:string;hours:number;note:string;cost_cents:number;charge_cents:number;billing_type:string}

export function shift(start:string,days:number){const d=new Date(`${start}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function selectedMonday(day:string){const d=new Date(`${day}T00:00:00Z`);if(Number.isNaN(d.valueOf()))return day;d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)}
export function currentMonday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).split('-').map(Number);return selectedMonday(`${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`)}
export function todayEastern(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function defaultEntryDate(start:string,today=todayEastern()){return today>=start&&today<=shift(start,6)?today:start}
export function hours(value:number){return Number(value).toFixed(2)}

export const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit" });
