import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { userDetail } from '../src/routes/userDetail.ts';

test('user detail redacts pay unless the viewer has rate visibility', async () => {
  const row = {
    id: 'staff', email: 'staff@example.com', display_name: 'Staff M. Member Jr.', first_name:'Staff',middle_name:'M.',last_name:'Member',suffix:'Jr.', user_type: 'internal',
    active: 1, archived_at: null, created_at: '2026-10-21 10:00:00', updated_at: '2026-10-21 10:00:00',
    role_id: 'employee', role_name: 'Employee', manager_user_id: 'manager', manager_name: 'Manager',
    billing_position_id: 'surveyor', billing_position_name: 'Surveyor', pay_basis: 'salary', pay_amount_cents: 10400000, weekly_hours: 32,
  };
  const db = { prepare: () => ({ bind: id => ({ first: async () => id === row.id ? row : null }) }) };
  const app = new Hono();
  app.use('*', async (c, next) => {
    const level = c.req.header('X-Test-Level');
    c.set('permissions', { hasPermission: key => level === 'admin' || level === 'viewer' && key === 'users.view' });
    await next();
  });
  app.get('/users/:id', userDetail);
  const read = async (level, id = 'staff') => {
    const response = await app.request(`/users/${id}`, { headers: { 'X-Test-Level': level } }, { DB: db });
    return { status: response.status, body: await response.json() };
  };
  const basic = await read('viewer');
  assert.equal(basic.status, 200);
  assert.equal(basic.body.manager.name, 'Manager');
  assert.equal(basic.body.firstName,'Staff');
  assert.equal(basic.body.lastName,'Member');
  assert.equal(basic.body.middleName,'M.');
  assert.equal(basic.body.suffix,'Jr.');
  assert.equal('compensation' in basic.body, false);
  assert.equal(JSON.stringify(basic.body).includes('10400000'), false);
  assert.equal(JSON.stringify(basic.body).includes('weeklyHours'), false);
  const sensitive = await read('admin');
  assert.equal(sensitive.body.compensation.payAmountCents, 10400000);
  assert.equal(sensitive.body.compensation.weeklyHours, 32);
  assert.equal(sensitive.body.compensation.billingPosition.name, 'Surveyor');
  assert.equal((await read('none')).status, 403);
  assert.equal((await read('viewer', 'missing')).status, 404);
});
