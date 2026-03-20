CREATE TABLE IF NOT EXISTS location_pings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES companies(id),
  employee_id   integer NOT NULL REFERENCES employees(id),
  time_clock_id integer NOT NULL REFERENCES time_clock(id) ON DELETE CASCADE,
  lat           numeric NOT NULL,
  lng           numeric NOT NULL,
  accuracy      numeric,
  pinged_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_pings_time_clock_id ON location_pings(time_clock_id);
CREATE INDEX IF NOT EXISTS idx_location_pings_employee_day ON location_pings(employee_id, pinged_at);
