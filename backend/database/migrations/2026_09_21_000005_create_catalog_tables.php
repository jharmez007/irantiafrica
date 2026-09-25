<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE categories (
 id uuid PRIMARY KEY, parent_id uuid REFERENCES categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 name varchar(160) NOT NULL, slug varchar(180) NOT NULL UNIQUE,
 status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(parent_id <> id), CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE INDEX categories_parent_idx ON categories(parent_id);
CREATE INDEX categories_status_idx ON categories(status);
CREATE TABLE products (
 id uuid PRIMARY KEY, name varchar(200) NOT NULL, slug varchar(220) NOT NULL UNIQUE,
 description text NOT NULL DEFAULT '', kind varchar(16) NOT NULL CHECK(kind IN ('simple','variant')),
 status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 tax_category_code varchar(64) NOT NULL, content_version integer NOT NULL DEFAULT 1 CHECK(content_version > 0),
 published_at timestamptz, archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE INDEX products_publication_idx ON products(status,published_at,id);
CREATE INDEX products_search_idx ON products USING gin(to_tsvector('simple', name || ' ' || slug));
CREATE TABLE product_categories (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON UPDATE RESTRICT ON DELETE CASCADE,
 category_id uuid NOT NULL REFERENCES categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_id,category_id)
);
CREATE INDEX product_categories_category_idx ON product_categories(category_id,product_id);
CREATE TABLE product_options (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 name varchar(100) NOT NULL, position integer NOT NULL DEFAULT 0 CHECK(position>=0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,name), UNIQUE(id,product_id)
);
CREATE INDEX product_options_position_idx ON product_options(product_id,position);
CREATE TABLE option_values (
 id uuid PRIMARY KEY, product_id uuid NOT NULL, option_id uuid NOT NULL, value varchar(120) NOT NULL,
 position integer NOT NULL DEFAULT 0 CHECK(position>=0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(option_id,product_id) REFERENCES product_options(id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 UNIQUE(option_id,value), UNIQUE(id,option_id,product_id)
);
CREATE INDEX option_values_product_idx ON option_values(product_id);
CREATE INDEX option_values_position_idx ON option_values(option_id,position);
CREATE TABLE product_variants (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 sku varchar(100) NOT NULL UNIQUE, option_signature text NOT NULL, unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
 currency char(3) NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 price_version integer NOT NULL DEFAULT 1 CHECK(price_version>0), archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,option_signature), UNIQUE(id,product_id), CHECK(length(btrim(sku))>0 AND sku=upper(btrim(sku)))
);
CREATE INDEX product_variants_status_idx ON product_variants(product_id,status);
CREATE TABLE variant_option_values (
 id uuid PRIMARY KEY, product_id uuid NOT NULL, variant_id uuid NOT NULL, option_id uuid NOT NULL, option_value_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(variant_id,product_id) REFERENCES product_variants(id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(option_value_id,option_id,product_id) REFERENCES option_values(id,option_id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 UNIQUE(variant_id,option_id)
);
CREATE INDEX variant_option_values_value_idx ON variant_option_values(option_value_id,option_id,product_id);
CREATE INDEX variant_option_values_product_idx ON variant_option_values(product_id);
CREATE TABLE product_media (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 variant_id uuid, object_key text NOT NULL UNIQUE, derivatives jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(derivatives)='object'),
 status varchar(20) NOT NULL DEFAULT 'quarantined' CHECK(status IN ('quarantined','processing','ready','rejected','retired')),
 mime_type varchar(80), byte_size bigint CHECK(byte_size>0), width integer CHECK(width>0), height integer CHECK(height>0),
 checksum char(64), alt_text varchar(500) NOT NULL DEFAULT '', position integer NOT NULL DEFAULT 0 CHECK(position>=0), retired_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(variant_id,product_id) REFERENCES product_variants(id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX product_media_position_idx ON product_media(product_id,position);
CREATE INDEX product_media_variant_idx ON product_media(variant_id,product_id);
CREATE INDEX product_media_status_idx ON product_media(status,created_at);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE product_media, variant_option_values, product_variants, option_values, product_options, product_categories, products, categories');
    }
};
