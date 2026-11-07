-- Apply after 008. No roles are promoted from user-editable metadata.
-- Provision app_metadata.role for legitimate users before deploying this change.
begin;

create schema if not exists maintenance_private;
revoke all on schema maintenance_private from public, anon, authenticated;
-- Read the current administrator-approved role so an old JWT cannot retain a
-- removed staff privilege. The caller cannot choose which identity is checked.
create or replace function maintenance_private.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select raw_app_meta_data ->> 'role' from auth.users where id = auth.uid();
$$;
revoke all on function maintenance_private.current_app_role() from public, anon, authenticated, service_role;
grant usage on schema maintenance_private to authenticated;
grant execute on function maintenance_private.current_app_role() to authenticated;

create or replace function public.current_user_is_staff()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(maintenance_private.current_app_role() = 'staff', false);
$$;
revoke all on function public.current_user_is_staff() from public, anon;
grant execute on function public.current_user_is_staff() to authenticated;

alter table public.work_orders add column if not exists partner_source text
  check (partner_source is null or partner_source = 'team12');
update public.work_orders set partner_source = 'team12'
where partner_source is null and (activity_id is not null or idempotency_key is not null);
-- Existing duplicates must be investigated, never silently deleted or relinked.
create unique index if not exists work_orders_activity_id_unique
  on public.work_orders(activity_id) where activity_id is not null;
create unique index if not exists work_orders_idempotency_key_unique
  on public.work_orders(idempotency_key) where idempotency_key is not null;
alter table public.status_history alter column changed_by drop not null;

create or replace function maintenance_private.audit_work_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare audit_note text;
begin
  if tg_op = 'INSERT' then
    audit_note := case when new.partner_source = 'team12' then 'Created via Team 12 partner' else 'Work order created' end;
    insert into public.status_history(work_order_id, changed_by, from_status, to_status, note)
    values(new.id, auth.uid(), null, new.status, audit_note);
  elsif row(new.status, new.title, new.description, new.category_id, new.location_id, new.resolution_notes, new.archived_at)
    is distinct from row(old.status, old.title, old.description, old.category_id, old.location_id, old.resolution_notes, old.archived_at) then
    audit_note := case
      when new.archived_at is distinct from old.archived_at then 'Work order archived'
      when new.status = 'RESOLVED' and old.status <> new.status then new.resolution_notes
      when old.status = new.status then 'Work-order details updated'
      else 'Work-order status advanced' end;
    insert into public.status_history(work_order_id, changed_by, from_status, to_status, note)
    values(new.id, auth.uid(), old.status, new.status, audit_note);
  end if;
  return new;
end;
$$;
revoke all on function maintenance_private.audit_work_order() from public, anon, authenticated, service_role;
drop trigger if exists work_order_audit on public.work_orders;
create trigger work_order_audit after insert or update on public.work_orders
for each row execute function maintenance_private.audit_work_order();

create or replace function maintenance_private.protect_history()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Audit history is immutable' using errcode = '42501'; end;
$$;
revoke all on function maintenance_private.protect_history() from public, anon, authenticated, service_role;
drop trigger if exists immutable_status_history on public.status_history;
create trigger immutable_status_history before update or delete on public.status_history
for each row execute function maintenance_private.protect_history();
drop policy if exists status_history_create on public.status_history;
revoke insert, update, delete on public.status_history from anon, authenticated, service_role;
revoke update, delete on public.partner_webhook_events from anon, authenticated, service_role;
drop trigger if exists immutable_partner_webhook_events on public.partner_webhook_events;
create trigger immutable_partner_webhook_events before update or delete on public.partner_webhook_events
for each row execute function maintenance_private.protect_history();

create or replace function maintenance_private.protect_work_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Work orders must be soft archived' using errcode = '42501';
  elsif tg_op = 'INSERT' then
    if new.status <> 'OPEN' or new.archived_at is not null or new.resolution_notes is not null then
      raise exception 'New work orders must start OPEN' using errcode = '23514';
    end if;
  else
    if row(new.id, new.reporter_id, new.created_at, new.activity_id, new.idempotency_key, new.partner_source)
      is distinct from row(old.id, old.reporter_id, old.created_at, old.activity_id, old.idempotency_key, old.partner_source) then
      raise exception 'Work-order identity is immutable' using errcode = '42501';
    end if;
    if old.archived_at is not null then
      raise exception 'Archived work orders are immutable' using errcode = '23514';
    end if;
    if new.status = 'ASSIGNED' and old.status <> new.status and not exists (
      select 1 from public.assignments where work_order_id = new.id
    ) then raise exception 'Assignment is required' using errcode = '23514'; end if;
    if new.status in ('RESOLVED', 'CLOSED') and coalesce(btrim(new.resolution_notes), '') = '' then
      raise exception 'Resolution notes are required' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function maintenance_private.protect_work_order() from public, anon, authenticated, service_role;
drop trigger if exists work_order_security_guard on public.work_orders;
create trigger work_order_security_guard before insert or update or delete on public.work_orders
for each row execute function maintenance_private.protect_work_order();

-- The trigger may inspect auth.users solely to validate an assigned staff identity.
create or replace function maintenance_private.validate_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id = new.staff_id and raw_app_meta_data ->> 'role' = 'staff') then
    raise exception 'Assignee must be an administrator-approved staff user' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function maintenance_private.validate_assignment() from public, anon, authenticated, service_role;
drop trigger if exists assignment_staff_guard on public.assignments;
create trigger assignment_staff_guard before insert or update on public.assignments
for each row execute function maintenance_private.validate_assignment();

drop policy if exists work_orders_read on public.work_orders;
create policy work_orders_read on public.work_orders for select to authenticated
using(public.current_user_is_staff() or (maintenance_private.current_app_role() = 'reporter' and reporter_id = auth.uid()));
drop policy if exists work_orders_create on public.work_orders;
create policy work_orders_create on public.work_orders for insert to authenticated
with check(reporter_id = auth.uid() and maintenance_private.current_app_role() in ('reporter', 'staff')
  and status = 'OPEN' and archived_at is null and resolution_notes is null
  and activity_id is null and idempotency_key is null and partner_source is null);
revoke insert, update, delete on public.work_orders from anon, authenticated;
grant insert(reporter_id, location_id, category_id, title, description) on public.work_orders to authenticated;
grant update(title, description, location_id, category_id, status, resolution_notes, archived_at) on public.work_orders to authenticated;

-- History is now written by the audit trigger in the mutation's own transaction.
create or replace function public.create_work_order(
  p_reporter_id uuid, p_location_id uuid, p_description text, p_category_id uuid, p_title varchar
) returns public.work_orders language plpgsql security invoker set search_path = '' as $$
declare result public.work_orders;
begin
  if auth.uid() is null or p_reporter_id is distinct from auth.uid()
    or coalesce(maintenance_private.current_app_role(), '') not in ('reporter', 'staff') then
    raise exception 'Invalid reporter identity' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = '' then
    raise exception 'Title and description are required' using errcode = '22023';
  end if;
  insert into public.work_orders(reporter_id, location_id, description, category_id, title)
  values(p_reporter_id, p_location_id, btrim(p_description), p_category_id, btrim(p_title)) returning * into result;
  return result;
end;
$$;

create or replace function public.assign_work_order(p_work_order_id uuid, p_staff_id uuid)
returns public.work_orders language plpgsql security invoker set search_path = '' as $$
declare item public.work_orders;
begin
  if auth.uid() is null or not public.current_user_is_staff() then raise exception 'Staff required' using errcode = '42501'; end if;
  select * into item from public.work_orders where id = p_work_order_id and archived_at is null for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if item.status <> 'OPEN' then raise exception 'Only OPEN work orders can be assigned' using errcode = '23514'; end if;
  insert into public.assignments(work_order_id, staff_id) values(p_work_order_id, p_staff_id);
  update public.work_orders set status = 'ASSIGNED' where id = p_work_order_id returning * into item;
  return item;
end;
$$;

create or replace function public.start_work_order(p_work_order_id uuid)
returns public.work_orders language plpgsql security invoker set search_path = '' as $$
declare item public.work_orders;
begin
  if auth.uid() is null or not public.current_user_is_staff() then raise exception 'Staff required' using errcode = '42501'; end if;
  select * into item from public.work_orders where id = p_work_order_id and archived_at is null for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if item.status <> 'ASSIGNED' then raise exception 'Only ASSIGNED work orders can start' using errcode = '23514'; end if;
  update public.work_orders set status = 'IN_PROGRESS' where id = p_work_order_id returning * into item;
  return item;
end;
$$;

create or replace function public.resolve_work_order(p_work_order_id uuid, p_resolution_notes text)
returns public.work_orders language plpgsql security invoker set search_path = '' as $$
declare item public.work_orders;
begin
  if auth.uid() is null or not public.current_user_is_staff() then raise exception 'Staff required' using errcode = '42501'; end if;
  if coalesce(btrim(p_resolution_notes), '') = '' then raise exception 'Resolution notes required' using errcode = '22023'; end if;
  select * into item from public.work_orders where id = p_work_order_id and archived_at is null for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if item.status <> 'IN_PROGRESS' then raise exception 'Only IN_PROGRESS work orders can be resolved' using errcode = '23514'; end if;
  update public.work_orders set status = 'RESOLVED', resolution_notes = btrim(p_resolution_notes) where id = p_work_order_id returning * into item;
  return item;
end;
$$;

create or replace function public.close_work_order(p_work_order_id uuid)
returns public.work_orders language plpgsql security invoker set search_path = '' as $$
declare item public.work_orders;
begin
  if auth.uid() is null or not public.current_user_is_staff() then raise exception 'Staff required' using errcode = '42501'; end if;
  select * into item from public.work_orders where id = p_work_order_id and archived_at is null for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if item.status <> 'RESOLVED' then raise exception 'Only RESOLVED work orders can be closed' using errcode = '23514'; end if;
  update public.work_orders set status = 'CLOSED' where id = p_work_order_id returning * into item;
  return item;
end;
$$;

revoke all on function public.create_work_order(uuid,uuid,text,uuid,varchar), public.assign_work_order(uuid,uuid),
  public.start_work_order(uuid), public.resolve_work_order(uuid,text), public.close_work_order(uuid) from public, anon;
grant execute on function public.create_work_order(uuid,uuid,text,uuid,varchar), public.assign_work_order(uuid,uuid),
  public.start_work_order(uuid), public.resolve_work_order(uuid,text), public.close_work_order(uuid) to authenticated;

create or replace function public.create_partner_work_order(
  p_title text, p_description text, p_category_id uuid, p_location_id uuid,
  p_activity_id text, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.work_orders; lock_key text; matches integer;
begin
  if current_user <> 'service_role' then raise exception 'Partner service required' using errcode = '42501'; end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = '' then
    raise exception 'Title and description are required' using errcode = '22023';
  end if;
  for lock_key in select distinct value from unnest(array[p_activity_id, p_idempotency_key]) value
    where value is not null order by value loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('team12:' || lock_key, 0));
  end loop;
  select count(*) into matches from public.work_orders
    where (p_activity_id is not null and activity_id = p_activity_id)
      or (p_idempotency_key is not null and idempotency_key = p_idempotency_key);
  if matches > 1 then raise exception 'Conflicting correlation keys' using errcode = 'P0003'; end if;
  if matches = 1 then
    select * into item from public.work_orders
      where (p_activity_id is not null and activity_id = p_activity_id)
        or (p_idempotency_key is not null and idempotency_key = p_idempotency_key);
    if item.partner_source is distinct from 'team12'
      or (p_activity_id is not null and item.activity_id is distinct from p_activity_id) then
      raise exception 'Correlation belongs to another request' using errcode = 'P0003';
    end if;
    return jsonb_build_object('duplicate', true, 'work_order', to_jsonb(item));
  end if;
  insert into public.work_orders(title, description, category_id, location_id, activity_id, idempotency_key, partner_source)
  values(btrim(p_title), btrim(p_description), p_category_id, p_location_id, p_activity_id, p_idempotency_key, 'team12') returning * into item;
  return jsonb_build_object('duplicate', false, 'work_order', to_jsonb(item));
end;
$$;

create or replace function public.modify_partner_work_order(
  p_work_order_id uuid, p_activity_id text, p_cancel boolean, p_title text,
  p_description text, p_category_id uuid, p_location_id uuid
) returns public.work_orders language plpgsql security invoker set search_path = '' as $$
declare item public.work_orders;
begin
  if current_user <> 'service_role' then raise exception 'Partner service required' using errcode = '42501'; end if;
  if p_work_order_id is null and p_activity_id is null then raise exception 'Target required' using errcode = '22023'; end if;
  select * into item from public.work_orders where partner_source = 'team12' and archived_at is null
    and (p_work_order_id is null or id = p_work_order_id)
    and (p_activity_id is null or activity_id = p_activity_id) for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if not p_cancel and p_title is null and p_description is null and p_category_id is null and p_location_id is null then
    raise exception 'Update required' using errcode = '22023';
  end if;
  if (p_title is not null and btrim(p_title) = '') or (p_description is not null and btrim(p_description) = '') then
    raise exception 'Fields cannot be empty' using errcode = '22023';
  end if;
  update public.work_orders set title = coalesce(btrim(p_title), title), description = coalesce(btrim(p_description), description),
    category_id = coalesce(p_category_id, category_id), location_id = coalesce(p_location_id, location_id),
    archived_at = case when p_cancel then now() else archived_at end where id = item.id returning * into item;
  return item;
end;
$$;

revoke all on function public.create_partner_work_order(text,text,uuid,uuid,text,text),
  public.modify_partner_work_order(uuid,text,boolean,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_partner_work_order(text,text,uuid,uuid,text,text),
  public.modify_partner_work_order(uuid,text,boolean,text,text,uuid,uuid) to service_role;

commit;
