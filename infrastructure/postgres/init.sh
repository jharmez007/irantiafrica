#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=app_password="$POSTGRES_APP_PASSWORD" --set=test_password="$POSTGRES_TEST_PASSWORD" <<'SQL'
CREATE ROLE iranti_app LOGIN PASSWORD :'app_password';
CREATE ROLE iranti_test LOGIN PASSWORD :'test_password';
CREATE DATABASE iranti_local OWNER iranti_app;
CREATE DATABASE iranti_test OWNER iranti_test;
REVOKE CONNECT ON DATABASE iranti_local FROM PUBLIC;
REVOKE CONNECT ON DATABASE iranti_test FROM PUBLIC;
GRANT CONNECT ON DATABASE iranti_local TO iranti_app;
GRANT CONNECT ON DATABASE iranti_test TO iranti_test;
SQL
