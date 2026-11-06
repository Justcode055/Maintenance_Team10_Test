-- Seed data for local Supabase testing.
-- This file creates realistic fixtures for the full work-order lifecycle.
-- It is safe to run multiple times because the inserts use ON CONFLICT.

insert into public.locations (id, building, floor_room)
values
  ('11111111-1111-4111-8111-111111111111', 'Laboratory Wing', 'Second Floor - Lab 204'),
  ('33333333-3333-4333-8333-333333333333', 'Administration Block', 'Ground Floor - Admin 001'),
  ('44444444-4444-4444-8444-444444444444', 'Engineering Studio', 'Third Floor - Studio 305')
on conflict (id) do update
set building = excluded.building,
    floor_room = excluded.floor_room;

insert into public.categories (id, name, sla_hours)
values
  ('22222222-2222-4222-8222-222222222222', 'Plumbing', 12),
  ('55555555-5555-4555-8555-555555555555', 'Electrical', 8),
  ('66666666-6666-4666-8666-666666666666', 'HVAC', 18),
  ('77777777-7777-4777-8777-777777777777', 'Safety', 24)
on conflict (id) do update
set name = excluded.name,
    sla_hours = excluded.sla_hours;

with reporter as (
  select id from auth.users where email = 'reporter1@gmail.com' limit 1
),
loc as (
  select id from public.locations where building = 'Laboratory Wing' and floor_room = 'Second Floor - Lab 204' limit 1
),
cat as (
  select id from public.categories where name = 'Plumbing' limit 1
)
insert into public.work_orders (id, reporter_id, location_id, category_id, title, description, status)
select
  '88888888-8888-4888-8888-888888888888',
  reporter.id,
  loc.id,
  cat.id,
  'Leaking pipe under sink',
  'Water is leaking from the sink cabinet and needs inspection before further damage occurs.',
  'OPEN'
from reporter, loc, cat
on conflict (id) do nothing;

with reporter as (
  select id from auth.users where email = 'reporter1@gmail.com' limit 1
),
loc as (
  select id from public.locations where building = 'Administration Block' and floor_room = 'Ground Floor - Admin 001' limit 1
),
cat as (
  select id from public.categories where name = 'Electrical' limit 1
)
insert into public.work_orders (id, reporter_id, location_id, category_id, title, description, status)
select
  '99999999-9999-4999-8999-999999999999',
  reporter.id,
  loc.id,
  cat.id,
  'Faulty power outlet',
  'The power outlet in the admin office is not responding and needs a staff inspection.',
  'ASSIGNED'
from reporter, loc, cat
on conflict (id) do nothing;

with reporter as (
  select id from auth.users where email = 'reporter1@gmail.com' limit 1
),
loc as (
  select id from public.locations where building = 'Engineering Studio' and floor_room = 'Third Floor - Studio 305' limit 1
),
cat as (
  select id from public.categories where name = 'HVAC' limit 1
)
insert into public.work_orders (id, reporter_id, location_id, category_id, title, description, status)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  reporter.id,
  loc.id,
  cat.id,
  'Air conditioning not cooling',
  'The studio air-conditioner is running but there is no cooling effect in the room.',
  'IN_PROGRESS'
from reporter, loc, cat
on conflict (id) do nothing;

with reporter as (
  select id from auth.users where email = 'reporter1@gmail.com' limit 1
),
loc as (
  select id from public.locations where building = 'Laboratory Wing' and floor_room = 'Second Floor - Lab 204' limit 1
),
cat as (
  select id from public.categories where name = 'Safety' limit 1
)
insert into public.work_orders (id, reporter_id, location_id, category_id, title, description, status, resolution_notes)
select
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reporter.id,
  loc.id,
  cat.id,
  'Emergency exit sign issue',
  'The emergency exit sign flickers intermittently and needs a permanent fix.',
  'RESOLVED',
  'LED panel replaced and the circuit checked for stability.'
from reporter, loc, cat
on conflict (id) do nothing;

with reporter as (
  select id from auth.users where email = 'reporter1@gmail.com' limit 1
),
loc as (
  select id from public.locations where building = 'Administration Block' and floor_room = 'Ground Floor - Admin 001' limit 1
),
cat as (
  select id from public.categories where name = 'Plumbing' limit 1
)
insert into public.work_orders (id, reporter_id, location_id, category_id, title, description, status, resolution_notes)
select
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  reporter.id,
  loc.id,
  cat.id,
  'Blocked restroom drain',
  'The restroom drain is slow and blocking water flow for staff use.',
  'CLOSED',
  'Drain cleared and final inspection passed.'
from reporter, loc, cat
on conflict (id) do nothing;

with staff as (
  select id from auth.users where email = 'staff1@gmail.com' limit 1
),
wo as (
  select id from public.work_orders where title = 'Faulty power outlet' limit 1
)
insert into public.assignments (id, work_order_id, staff_id)
select
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  wo.id,
  staff.id
from staff, wo
on conflict (work_order_id) do nothing;

with staff as (
  select id from auth.users where email = 'staff1@gmail.com' limit 1
),
wo as (
  select id from public.work_orders where title = 'Air conditioning not cooling' limit 1
)
insert into public.assignments (id, work_order_id, staff_id)
select
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  wo.id,
  staff.id
from staff, wo
on conflict (work_order_id) do nothing;

with staff as (
  select id from auth.users where email = 'staff1@gmail.com' limit 1
),
wo as (
  select id from public.work_orders where title = 'Emergency exit sign issue' limit 1
)
insert into public.assignments (id, work_order_id, staff_id)
select
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  wo.id,
  staff.id
from staff, wo
on conflict (work_order_id) do nothing;

with staff as (
  select id from auth.users where email = 'staff1@gmail.com' limit 1
),
wo as (
  select id from public.work_orders where title = 'Blocked restroom drain' limit 1
)
insert into public.assignments (id, work_order_id, staff_id)
select
  '12121212-1212-4121-8121-121212121212',
  wo.id,
  staff.id
from staff, wo
on conflict (work_order_id) do nothing;

with staff as (
  select id from auth.users where email = 'staff1@gmail.com' limit 1
),
wo as (
  select id from public.work_orders where title = 'Faulty power outlet' limit 1
)
insert into public.status_history (id, work_order_id, changed_by, from_status, to_status, note)
select
  '13131313-1313-4131-8131-131313131313',
  wo.id,
  staff.id,
  'OPEN',
  'ASSIGNED',
  'Maintenance staff assigned to inspect the outlet.'
from staff, wo
on conflict do nothing;

with staff as (
  select id from auth.users where email = 'staff1@gmail.com' limit 1
),
wo as (
  select id from public.work_orders where title = 'Air conditioning not cooling' limit 1
)
insert into public.status_history (id, work_order_id, changed_by, from_status, to_status, note)
select
  '14141414-1414-4141-8141-141414141414',
  wo.id,
  staff.id,
  'ASSIGNED',
  'IN_PROGRESS',
  'Technician started inspection and confirmed reduced airflow.'
from staff, wo
on conflict do nothing;

with staff as (
  select id from auth.users where email = 'staff1@gmail.com' limit 1
),
wo as (
  select id from public.work_orders where title = 'Emergency exit sign issue' limit 1
)
insert into public.status_history (id, work_order_id, changed_by, from_status, to_status, note)
select
  '15151515-1515-4151-8151-151515151515',
  wo.id,
  staff.id,
  'IN_PROGRESS',
  'RESOLVED',
  'Exit sign was repaired and tested after replacement.'
from staff, wo
on conflict do nothing;

with staff as (
  select id from auth.users where email = 'staff1@gmail.com' limit 1
),
wo as (
  select id from public.work_orders where title = 'Blocked restroom drain' limit 1
)
insert into public.status_history (id, work_order_id, changed_by, from_status, to_status, note)
select
  '16161616-1616-4161-8161-161616161616',
  wo.id,
  staff.id,
  'RESOLVED',
  'CLOSED',
  'Final drainage inspection completed after cleaning.'
from staff, wo
on conflict do nothing;
