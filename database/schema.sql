-- ============================================================================
-- StánekOS v1.0 - PostgreSQL schema
-- ============================================================================
-- Samoobslužný kiosový POS systém pro 3 stánky (kožené doplňky)
-- Datum: 17.4.2026
-- ============================================================================

-- Stánky (fyzické prodejní místa)
CREATE TABLE IF NOT EXISTS stalls (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Kategorie produktů (hierarchické)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES categories(id),
    display_order INTEGER DEFAULT 0
);

-- Produkty (master katalog)
-- price_base a price_vat jsou automaticky dopočítávané (GENERATED columns)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES categories(id),
    price_czk NUMERIC(10,2) NOT NULL CHECK (price_czk >= 0),
    vat_rate NUMERIC(5,2) DEFAULT 21.00 CHECK (vat_rate >= 0),
    price_base NUMERIC(10,2) GENERATED ALWAYS AS (price_czk / (1 + vat_rate/100)) STORED,
    price_vat NUMERIC(10,2) GENERATED ALWAYS AS (price_czk - price_czk / (1 + vat_rate/100)) STORED,
    images JSONB DEFAULT '[]'::jsonb,
    attributes JSONB DEFAULT '{}'::jsonb,
    source_url VARCHAR(500) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Zásoby per stánek (aktuální stav)
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    stall_id INTEGER REFERENCES stalls(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    low_stock_threshold INTEGER DEFAULT 3 CHECK (low_stock_threshold >= 0),
    UNIQUE(product_id, stall_id)
);

-- Pohyby skladu (audit log - kompletní historie)
CREATE TABLE IF NOT EXISTS inventory_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    stall_id INTEGER REFERENCES stalls(id),
    quantity_change INTEGER NOT NULL,
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('sale', 'restock', 'transfer', 'adjustment', 'return')),
    reference_id INTEGER,
    note TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Přesuny zboží mezi stánky
CREATE TABLE IF NOT EXISTS stock_transfers (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    from_stall_id INTEGER REFERENCES stalls(id),
    to_stall_id INTEGER REFERENCES stalls(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Objednávky (transakce zákazníka)
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    stall_id INTEGER REFERENCES stalls(id),
    order_number VARCHAR(30) UNIQUE NOT NULL,
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
    stripe_payment_intent_id VARCHAR(100),
    stripe_charge_id VARCHAR(100),
    payment_method VARCHAR(50),
    payment_status VARCHAR(30),
    subtotal_czk NUMERIC(10,2),
    vat_amount_czk NUMERIC(10,2),
    total_czk NUMERIC(10,2) NOT NULL,
    customer_name VARCHAR(255),
    customer_company VARCHAR(255),
    customer_ico VARCHAR(20),
    customer_dic VARCHAR(25),
    customer_address TEXT,
    customer_email VARCHAR(255),
    receipt_type VARCHAR(20) DEFAULT 'simplified' CHECK (receipt_type IN ('simplified', 'invoice', 'none')),
    invoice_number VARCHAR(30),
    receipt_printed BOOLEAN DEFAULT false,
    invoice_pdf_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Položky objednávky
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_czk NUMERIC(10,2) NOT NULL,
    unit_price_base NUMERIC(10,2) NOT NULL,
    unit_vat NUMERIC(10,2) NOT NULL,
    vat_rate NUMERIC(5,2) NOT NULL,
    line_total_czk NUMERIC(10,2) NOT NULL
);

-- Číselníky faktur (per rok)
CREATE TABLE IF NOT EXISTS invoice_sequences (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    last_number INTEGER DEFAULT 0,
    UNIQUE(year)
);

-- Admin uživatelé
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) DEFAULT 'stall_manager' CHECK (role IN ('superadmin', 'stall_manager')),
    stall_id INTEGER REFERENCES stalls(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Refresh tokeny (pro JWT revokaci)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Nastavení systému
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT INTO settings (key, value, description) VALUES
    ('company_name', 'DOPLŇ NÁZEV FIRMY', 'Název firmy na dokladech'),
    ('company_ico', '00000000', 'IČO'),
    ('company_dic', 'CZ00000000', 'DIČ'),
    ('company_address', 'Ulice 1, 100 00 Praha', 'Adresa firmy'),
    ('company_phone', '+420 XXX XXX XXX', 'Telefon'),
    ('receipt_footer', 'Děkujeme za nákup!', 'Patička účtenky'),
    ('low_stock_check_interval', '30', 'Interval kontroly zásob v minutách'),
    ('telegram_chat_id', '', 'Telegram chat ID')
ON CONFLICT (key) DO NOTHING;

INSERT INTO stalls (name, location) VALUES
    ('Stánek 1', 'Doplň lokalitu'),
    ('Stánek 2', 'Doplň lokalitu'),
    ('Stánek 3', 'Doplň lokalitu')
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, display_order) VALUES
    ('Peněženky', 'penezenky', 1),
    ('Kabelky', 'kabelky', 2),
    ('Opasky', 'opasky', 3),
    ('Kožené doplňky', 'kozene-doplnky', 4)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- INDEXY (výkon)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_product_stall ON inventory(product_id, stall_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stall ON inventory(stall_id);
CREATE INDEX IF NOT EXISTS idx_orders_stall_date ON orders(stall_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_stripe ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ============================================================================
-- TRIGGER: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
