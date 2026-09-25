<?php

// Local provisioning only. Never prints passwords, SQL statements or PDO errors.
require __DIR__.'/../backend/vendor/autoload.php';

try {
    $env = Dotenv\Dotenv::parse(file_get_contents(__DIR__.'/../backend/.env'));
    foreach (['APP_ENV' => 'local', 'DB_CONNECTION' => 'pgsql', 'DB_HOST' => '127.0.0.1', 'DB_PORT' => '5432', 'DB_DATABASE' => 'iranti_local', 'DB_USERNAME' => 'iranti'] as $key => $expected) {
        if (($env[$key] ?? null) !== $expected) {
            throw new RuntimeException('Select the native environment profile first.');
        }
    }
    $password = $env['DB_PASSWORD'] ?? '';
    if ($password === '') {
        throw new RuntimeException('A private local database password is required.');
    }
    $admin = getenv('IRANTI_PG_ADMIN') ?: posix_getpwuid(posix_geteuid())['name'];
    $pdo = new PDO('pgsql:host=/tmp;port=5432;dbname=postgres', $admin, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $prefix = trim(shell_exec('brew --prefix') ?? '');
    $directory = $pdo->query('SHOW data_directory')->fetchColumn();
    if ($prefix === '' || realpath($directory) !== realpath($prefix.'/var/postgresql@18')) {
        throw new RuntimeException('Refusing to provision a cluster other than Homebrew PostgreSQL 18.');
    }
    if (! $pdo->query("SELECT 1 FROM pg_roles WHERE rolname='iranti'")->fetchColumn()) {
        $pdo->exec('CREATE ROLE iranti LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION');
    }
    $pdo->exec("SET password_encryption='scram-sha-256'");
    $pdo->exec('ALTER ROLE iranti LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '.$pdo->quote($password));
    if (! $pdo->query("SELECT 1 FROM pg_database WHERE datname='iranti_local'")->fetchColumn()) {
        $pdo->exec('CREATE DATABASE iranti_local OWNER iranti');
    }
    $pdo->exec('ALTER DATABASE iranti_local OWNER TO iranti');
    $pdo->exec('REVOKE ALL ON DATABASE iranti_local FROM PUBLIC');
    $pdo->exec('GRANT CONNECT, TEMPORARY, CREATE ON DATABASE iranti_local TO iranti');
    $local = new PDO('pgsql:host=/tmp;port=5432;dbname=iranti_local', $admin, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $local->exec('ALTER SCHEMA public OWNER TO iranti');
    $local->exec('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    $local->exec('GRANT USAGE, CREATE ON SCHEMA public TO iranti');
    // Scope password enforcement to this project role, preserving other local applications.
    $hbaPath = $pdo->query('SHOW hba_file')->fetchColumn();
    $hba = file_get_contents($hbaPath);
    $marker = '# IRANTI native development password authentication';
    if (! str_contains($hba, $marker)) {
        if (! file_exists($hbaPath.'.before-iranti')) {
            copy($hbaPath, $hbaPath.'.before-iranti');
        }
        file_put_contents($hbaPath, $marker."\nhost all iranti 127.0.0.1/32 scram-sha-256\nhost all iranti ::1/128 scram-sha-256\n".$hba);
    }
    if ((int) $pdo->query('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')->fetchColumn() !== 0) {
        throw new RuntimeException('PostgreSQL authentication configuration needs review.');
    }
    $pdo->query('SELECT pg_reload_conf()');
    echo "Native development role, password, database ownership and scoped TCP authentication configured. No migrations run.\n";
} catch (Throwable $exception) {
    fwrite(STDERR, "Native database setup failed. Check the local profile, Homebrew service, administrator and file permissions. No credentials printed.\n");
    exit(1);
}
