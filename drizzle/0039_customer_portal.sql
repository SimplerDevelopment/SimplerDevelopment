-- Customer portal for eCommerce websites

-- Customer portal settings on store_settings
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS enable_customer_accounts BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS enable_guest_checkout BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS enable_wishlist BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS enable_order_tracking BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS enable_customer_support BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS customer_portal_welcome_message TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS support_email VARCHAR(255);
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS return_policy_url VARCHAR(500);
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS shipping_policy_url VARCHAR(500);

-- Customer accounts
CREATE TABLE store_customers (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES client_websites(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(50),
  avatar_url VARCHAR(500),
  default_shipping_address JSON,
  default_billing_address JSON,
  address_book JSON DEFAULT '[]',
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verify_token VARCHAR(100),
  password_reset_token VARCHAR(100),
  password_reset_expires TIMESTAMP,
  last_login_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  order_count INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX store_customers_email_website_idx ON store_customers(email, website_id);

-- Customer sessions (token-based auth)
CREATE TABLE store_customer_sessions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Link orders and carts to customer accounts
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER;
ALTER TABLE carts ADD COLUMN IF NOT EXISTS customer_id INTEGER;

-- Wishlists
CREATE TABLE store_wishlists (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  website_id INTEGER NOT NULL REFERENCES client_websites(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL DEFAULT 'My Wishlist',
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE store_wishlist_items (
  id SERIAL PRIMARY KEY,
  wishlist_id INTEGER NOT NULL REFERENCES store_wishlists(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  added_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Customer support messages
CREATE TABLE store_customer_messages (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES client_websites(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE store_customer_message_replies (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES store_customer_messages(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  author_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Product reviews
CREATE TABLE store_product_reviews (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES client_websites(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES store_customers(id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL,
  title VARCHAR(255),
  body TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
