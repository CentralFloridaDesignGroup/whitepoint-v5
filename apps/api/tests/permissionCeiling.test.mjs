import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { registerHooks } from 'node:module'
import { Hono } from 'hono'

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context) }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) for (const extension of ['.js', '.ts']) try { return nextResolve(`${specifier}${extension}`, context) } catch { /* continue */ }
    throw error
  }
}, load(url, context, nextLoad) {
  if (url.endsWith('.json') && !url.includes('/node_modules/')) return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` }
  return nextLoad(url, context)
} })

const { createIdentityApi } = await import('../src/routes/identityApi.ts')
const { createRolesApi } = await import('../src/routes/rolesApi.ts')
const actorPermissions = ['users.manage', 'users.create', 'company.roles.manage', 'company.roles.create', 'company.roles.delete', 'clients.view']

function database() {
  const sqlite = new DatabaseSync(':memory:')
  for (const migration of ['0001_company_initialization.sql', '0002_roles_permissions.sql', '0003_user_init_auth_seed.sql', '0004_client_init.sql', '0005_project_init.sql', '0006_timesheet_init.sql', '0007_invoice_init.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  const addRole = sqlite.prepare('INSERT INTO roles(id,name,permissions,built_in) VALUES(?,?,?,0)')
  addRole.run('delegated', 'Delegated', JSON.stringify(actorPermissions))
  addRole.run('lower', 'Lower', JSON.stringify(['clients.view']))
  addRole.run('higher', 'Higher', JSON.stringify(['clients.view', 'projects.manage']))
  const addUser = sqlite.prepare("INSERT INTO users(id,email,first_name,last_name,user_type,active) VALUES(?,?,?,?, 'internal',1)")
  addUser.run('actor', 'actor@example.test', 'Actor', 'Admin')
  addUser.run('low-user', 'low@example.test', 'Low', 'User')
  addUser.run('high-user', 'high@example.test', 'High', 'User')
  const addUserRole = sqlite.prepare('INSERT INTO user_roles(user_id,role_id,updated_by) VALUES(?,?,?)')
  addUserRole.run('actor', 'delegated', '1'); addUserRole.run('low-user', 'lower', '1'); addUserRole.run('high-user', 'higher', '1')
  sqlite.prepare("INSERT INTO user_credentials(user_id,password_hash) VALUES('1','configured')").run()
  const statement = (sql, args = []) => ({ bind: (...values) => statement(sql, values), first: async () => sqlite.prepare(sql).get(...args) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }) })
  return { prepare: sql => statement(sql), batch: async statements => { sqlite.exec('BEGIN'); try { const results=[]; for (const item of statements) results.push(await item.run()); sqlite.exec('COMMIT'); return results } catch (error) { sqlite.exec('ROLLBACK'); throw error } }, sqlite }
}

function application(db) {
  const app = new Hono()
  app.use('*', async (c, next) => { c.set('auth', { mode: 'session', subject: 'actor', internalUserId: 'actor', permissions: actorPermissions }); c.set('permissions', { hasPermission: key => actorPermissions.includes(key), hasPermissions: keys => keys.every(key => actorPermissions.includes(key)) }); await next() })
  app.route('/identity', createIdentityApi()); app.route('/identity', createRolesApi())
  return { request: (path, body) => app.request(`http://local${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { DB: db }) }
}

const user = (id, email, roleId) => ({ id, email, firstName: id === 'actor' ? 'Actor' : id === 'high-user' ? 'High' : 'Low', lastName: id === 'actor' ? 'Admin' : 'User', roleId, active: true })

test('delegated user administration cannot self-promote, assign super-admin, or alter a higher user', async () => {
  const db = database(), { request } = application(db)
  assert.equal((await request('/identity/users/bulk', { users: [user('actor', 'actor@example.test', 'super-administrator')] })).status, 403)
  assert.equal((await request('/identity/users/bulk', { users: [user('low-user', 'low@example.test', 'super-administrator')] })).status, 403)
  assert.equal((await request('/identity/users/bulk', { users: [user('high-user', 'high@example.test', 'higher')] })).status, 403)
  assert.equal((await request('/identity/users/bulk', { users: [user('low-user', 'low@example.test', 'lower')] })).status, 200)
  db.sqlite.close()
})

test('delegated role administration cannot expand, edit, delete, or replace above its ceiling', async () => {
  const db = database(), { request } = application(db)
  const role = (id, name, permissions) => ({ id, name, permissions })
  assert.equal((await request('/identity/roles/bulk', { roles: [role('higher', 'Higher', ['clients.view', 'projects.manage'])], removed: [] })).status, 403)
  assert.equal((await request('/identity/roles/bulk', { roles: [role('lower', 'Lower', ['clients.view', 'projects.manage'])], removed: [] })).status, 403)
  assert.equal((await request('/identity/roles/bulk', { roles: [], removed: [{ id: 'lower', replacementRoleId: 'higher' }] })).status, 403)
  assert.equal((await request('/identity/roles/bulk', { roles: [role('lower', 'Lower team', ['clients.view'])], removed: [] })).status, 200)
  db.sqlite.close()
})
