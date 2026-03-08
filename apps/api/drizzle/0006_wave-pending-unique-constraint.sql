-- Custom SQL migration file, put your code below! --
CREATE UNIQUE INDEX waves_pending_unique ON waves ("from_user_id", "to_user_id") WHERE status = 'pending';