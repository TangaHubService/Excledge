-- UUID to Integer ID Migration Script
-- IMPORTANT: Backup your database before running this script!
-- This script migrates all tables from UUID (String) IDs to Integer IDs

-- Step 1: Create mapping table for UUID to Integer conversions
CREATE TABLE IF NOT EXISTS uuid_to_int_mapping (
  table_name TEXT NOT NULL,
  old_uuid TEXT NOT NULL,
  new_int INTEGER NOT NULL,
  PRIMARY KEY (table_name, old_uuid)
);

-- Step 2: Add temporary integer ID columns to all tables
-- Base tables first (no dependencies)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE features ADD COLUMN IF NOT EXISTS new_id SERIAL;

-- First level dependencies
ALTER TABLE user_organizations ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE user_organizations ADD COLUMN IF NOT EXISTS new_user_id INTEGER;
ALTER TABLE user_organizations ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS new_supplier_id INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE organization_invitations ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE organization_invitations ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE organization_invitations ADD COLUMN IF NOT EXISTS new_invited_by INTEGER;
ALTER TABLE organization_invitations ADD COLUMN IF NOT EXISTS new_invited_user_id INTEGER;
ALTER TABLE plan_features ADD COLUMN IF NOT EXISTS new_plan_id INTEGER;
ALTER TABLE plan_features ADD COLUMN IF NOT EXISTS new_feature_id INTEGER;

-- Second level dependencies
ALTER TABLE sales ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS new_customer_id INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS new_user_id INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS new_original_sale_id INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS new_refunded_by INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS new_cancelled_by INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS new_supplier_id INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS new_user_id INTEGER;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS new_sale_id INTEGER;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS new_product_id INTEGER;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS new_purchase_order_id INTEGER;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS new_product_id INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS new_plan_id INTEGER;

-- Third level dependencies
ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS new_sale_id INTEGER;
ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS new_customer_id INTEGER;
ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS new_recorded_by_id INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS new_subscription_id INTEGER;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS new_product_id INTEGER;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS new_user_id INTEGER;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS new_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS new_id SERIAL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS new_organization_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS new_recipient_id INTEGER;

-- Step 3: Populate integer IDs for base tables and store mappings
-- Organizations
INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'organizations', id, new_id FROM organizations;

-- Users
INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'users', id, new_id FROM users;

-- Subscription Plans
INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'subscription_plans', id, new_id FROM subscription_plans;

-- Features
INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'features', id, new_int FROM features;

-- Step 4: Update foreign keys in first level dependencies
-- User Organizations
UPDATE user_organizations uo
SET new_user_id = (SELECT new_id FROM users WHERE id = uo."userId"),
    new_organization_id = (SELECT new_id FROM organizations WHERE id = uo."organizationId");

-- Suppliers
UPDATE suppliers s
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = s."organizationId");

-- Products
UPDATE products p
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = p."organizationId"),
    new_supplier_id = (SELECT new_id FROM suppliers WHERE id = p."supplierId")
WHERE p."supplierId" IS NOT NULL;

UPDATE products p
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = p."organizationId")
WHERE p."supplierId" IS NULL;

-- Customers
UPDATE customers c
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = c."organizationId");

-- Organization Invitations
UPDATE organization_invitations oi
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = oi."organizationId"),
    new_invited_by = (SELECT new_id FROM users WHERE id = oi."invitedBy"),
    new_invited_user_id = (SELECT new_id FROM users WHERE id = oi."invitedUserId")
WHERE oi."invitedUserId" IS NOT NULL;

UPDATE organization_invitations oi
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = oi."organizationId"),
    new_invited_by = (SELECT new_id FROM users WHERE id = oi."invitedBy")
WHERE oi."invitedUserId" IS NULL;

-- Plan Features
UPDATE plan_features pf
SET new_plan_id = (SELECT new_id FROM subscription_plans WHERE id = pf."planId"),
    new_feature_id = (SELECT new_id FROM features WHERE id = pf."featureId");

-- Step 5: Populate integer IDs for first level dependencies
INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'user_organizations', id, new_id FROM user_organizations;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'suppliers', id, new_id FROM suppliers;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'products', id, new_id FROM products;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'customers', id, new_id FROM customers;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'organization_invitations', id, new_id FROM organization_invitations;

-- Step 6: Update foreign keys in second level dependencies
-- Sales
UPDATE sales s
SET new_customer_id = (SELECT new_id FROM customers WHERE id = s."customerId"),
    new_user_id = (SELECT new_id FROM users WHERE id = s."userId"),
    new_organization_id = (SELECT new_id FROM organizations WHERE id = s."organizationId"),
    new_original_sale_id = (SELECT new_id FROM sales WHERE id = s."original_sale_id")
WHERE s."original_sale_id" IS NOT NULL;

UPDATE sales s
SET new_customer_id = (SELECT new_id FROM customers WHERE id = s."customerId"),
    new_user_id = (SELECT new_id FROM users WHERE id = s."userId"),
    new_organization_id = (SELECT new_id FROM organizations WHERE id = s."organizationId")
WHERE s."original_sale_id" IS NULL;

UPDATE sales s
SET new_refunded_by = (SELECT new_id FROM users WHERE id = s."refunded_by")
WHERE s."refunded_by" IS NOT NULL;

UPDATE sales s
SET new_cancelled_by = (SELECT new_id FROM users WHERE id = s."cancelled_by")
WHERE s."cancelled_by" IS NOT NULL;

-- Purchase Orders
UPDATE purchase_orders po
SET new_supplier_id = (SELECT new_id FROM suppliers WHERE id = po."supplierId"),
    new_organization_id = (SELECT new_id FROM organizations WHERE id = po."organizationId"),
    new_user_id = (SELECT new_id FROM users WHERE id = po."userId");

-- Sale Items
UPDATE sale_items si
SET new_sale_id = (SELECT new_id FROM sales WHERE id = si."saleId"),
    new_product_id = (SELECT new_id FROM products WHERE id = si."productId");

-- Purchase Order Items
UPDATE purchase_order_items poi
SET new_purchase_order_id = (SELECT new_id FROM purchase_orders WHERE id = poi."purchaseOrderId"),
    new_product_id = (SELECT new_id FROM products WHERE id = poi."productId")
WHERE poi."productId" IS NOT NULL;

UPDATE purchase_order_items poi
SET new_purchase_order_id = (SELECT new_id FROM purchase_orders WHERE id = poi."purchaseOrderId")
WHERE poi."productId" IS NULL;

-- Subscriptions
UPDATE subscriptions sub
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = sub."organizationId"),
    new_plan_id = (SELECT new_id FROM subscription_plans WHERE id = sub."planId");

-- Step 7: Populate integer IDs for second level dependencies
INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'sales', id, new_id FROM sales;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'purchase_orders', id, new_id FROM purchase_orders;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'sale_items', id, new_id FROM sale_items;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'purchase_order_items', id, new_id FROM purchase_order_items;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'subscriptions', id, new_id FROM subscriptions;

-- Step 8: Update foreign keys in third level dependencies
-- Debt Payments
UPDATE debt_payments dp
SET new_sale_id = (SELECT new_id FROM sales WHERE id = dp."saleId"),
    new_customer_id = (SELECT new_id FROM customers WHERE id = dp."customerId"),
    new_organization_id = (SELECT new_id FROM organizations WHERE id = dp."organizationId"),
    new_recorded_by_id = (SELECT new_id FROM users WHERE id = dp."recordedById");

-- Payments
UPDATE payments p
SET new_subscription_id = (SELECT new_id FROM subscriptions WHERE id = p."subscriptionId");

-- Stock Movements
UPDATE stock_movements sm
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = sm."organizationId"),
    new_product_id = (SELECT new_id FROM products WHERE id = sm."productId"),
    new_user_id = (SELECT new_id FROM users WHERE id = sm."userId");

-- Activity Logs
UPDATE activity_logs al
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = al."organizationId"),
    new_user_id = (SELECT new_id FROM users WHERE id = al."userId");

-- Notifications
UPDATE notifications n
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = n."organizationId"),
    new_recipient_id = (SELECT new_id FROM users WHERE id = n."recipientId")
WHERE n."recipientId" IS NOT NULL;

UPDATE notifications n
SET new_organization_id = (SELECT new_id FROM organizations WHERE id = n."organizationId")
WHERE n."recipientId" IS NULL;

-- Step 9: Populate integer IDs for third level dependencies
INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'debt_payments', id, new_id FROM debt_payments;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'payments', id, new_id FROM payments;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'stock_movements', id, new_id FROM stock_movements;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'activity_logs', id, new_id FROM activity_logs;

INSERT INTO uuid_to_int_mapping (table_name, old_uuid, new_int)
SELECT 'notifications', id, new_id FROM notifications;

-- Note: The actual column replacement will be done in a separate migration
-- after verifying the data integrity. This script prepares the data.
