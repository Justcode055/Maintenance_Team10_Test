-- Consolidate the API-test-only category into the standard Plumbing category.
update public.work_orders
set category_id = '22222222-2222-4222-8222-222222222222'
where category_id = '22222222-2222-2222-2222-222222222222';

delete from public.categories
where id = '22222222-2222-2222-2222-222222222222';

update public.categories
set name = 'Plumbing'
where id = '22222222-2222-4222-8222-222222222222'
  and name = 'Plumbing API Test';
