import type { Context } from 'hono';
import type { HonoEnv } from '../types/apiTypes';

type Row = Record<string, unknown>;

export async function projectTimeEntries(c: Context<HonoEnv>) {
  if(!c.get('permissions').hasPermission('projects.view'))return c.json({error:'Permission denied.'},403);
  const projectId=c.req.param('id'),page=Number(c.req.query('page')||0);
  if(!Number.isSafeInteger(page)||page<0||page>100000)return c.json({error:'Page must be a nonnegative integer.'},400);
  if(!await c.env.DB.prepare('SELECT id FROM projects WHERE id=?').bind(projectId).first())return c.json({error:'Project not found.'},404);
  const [rows,summary]=await Promise.all([
    c.env.DB.prepare(`SELECT e.id,e.entry_date,e.hours,e.note,e.cost_cents,e.charge_cents,w.week_start,w.status AS week_status,u.display_name AS employee_name,t.task_name
      FROM user_timesheet_entries e
      JOIN user_timesheets w ON w.id=e.timesheet_id
      JOIN users_named u ON u.id=w.user_id
      LEFT JOIN project_tasks t ON t.id=e.project_task_id
      WHERE e.project_id=? ORDER BY e.entry_date DESC,e.id DESC LIMIT 101 OFFSET ?`).bind(projectId,page*100).all<Row>(),
    c.env.DB.prepare('SELECT COUNT(*) AS entry_count,COALESCE(SUM(hours),0) AS total_hours FROM user_timesheet_entries WHERE project_id=?').bind(projectId).first<{entry_count:number;total_hours:number}>(),
  ]);
  const permission=c.get('permissions'),financial=permission.hasPermission('projects.view.financials')&&permission.hasPermission('timesheets.rates.view');
  const entries=(rows.results||[]).slice(0,100).map(row=>({id:row.id,entryDate:row.entry_date,hours:row.hours,note:row.note,weekStart:row.week_start,weekStatus:row.week_status,employeeName:row.employee_name,taskName:row.task_name,...financial?{costCents:row.cost_cents,chargeCents:row.charge_cents}:{}}));
  return c.json({items:entries,entryCount:Number(summary?.entry_count||0),totalHours:Number(summary?.total_hours||0),hasMore:(rows.results||[]).length>100,nextPage:page+1});
}
