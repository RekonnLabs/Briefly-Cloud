create schema if not exists app;

create table if not exists app.apideck_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','dropbox','box','sharepoint')),
  consumer_id text not null,
  connection_id text not null,
  status text not null default 'connected',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, provider)
);

create or replace function app.update_apideck_connections_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger update_apideck_connections_updated_at
  before update on app.apideck_connections
  for each row
  execute function app.update_apideck_connections_updated_at();