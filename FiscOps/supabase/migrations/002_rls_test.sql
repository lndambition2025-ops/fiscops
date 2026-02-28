alter table centers enable row level security;
alter table ifus enable row level security;
alter table taxpayers enable row level security;
alter table actions enable row level security;
alter table week_plans enable row level security;

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'ifu',
  center_id text not null default 'OWENDO'
);

alter table profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, role, center_id)
  values (new.id, 'ifu', 'OWENDO')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create policy "profiles self read"
on profiles for select
using (auth.uid() = user_id);

create policy "centers by profile center"
on centers for select
using (id = (select center_id from profiles where user_id = auth.uid()));

create policy "ifus by profile center"
on ifus for select
using (center_id = (select center_id from profiles where user_id = auth.uid()));

create policy "taxpayers by profile center"
on taxpayers for select
using (center_id = (select center_id from profiles where user_id = auth.uid()));

create policy "taxpayers insert by profile center"
on taxpayers for insert
with check (center_id = (select center_id from profiles where user_id = auth.uid()));

create policy "taxpayers update by profile center"
on taxpayers for update
using (center_id = (select center_id from profiles where user_id = auth.uid()))
with check (center_id = (select center_id from profiles where user_id = auth.uid()));

create policy "actions by profile center"
on actions for select
using (center_id = (select center_id from profiles where user_id = auth.uid()));

create policy "actions insert by profile center"
on actions for insert
with check (center_id = (select center_id from profiles where user_id = auth.uid()));

create policy "week_plans by profile center"
on week_plans for select
using (center_id = (select center_id from profiles where user_id = auth.uid()));

create policy "week_plans insert by profile center"
on week_plans for insert
with check (center_id = (select center_id from profiles where user_id = auth.uid()));

create policy "week_plans update by profile center"
on week_plans for update
using (center_id = (select center_id from profiles where user_id = auth.uid()))
with check (center_id = (select center_id from profiles where user_id = auth.uid()));
