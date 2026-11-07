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

-- Create test accounts and administrator-approved roles separately.
-- Create work orders through create_work_order so the initial audit is atomic.
-- Do not insert advanced lifecycle states or hand-written history fixtures.
