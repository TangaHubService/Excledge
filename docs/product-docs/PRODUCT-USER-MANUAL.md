# Excledge ERP Product User Manual

## 1. Introduction

Excledge ERP is a web-based business management platform used to manage products, stock, branches, sales, customers, suppliers, reports, subscriptions, and supporting operational records.

This manual is intended for:
- organization owners
- administrators
- branch managers
- accountants
- sellers and operational users

Feature access depends on the user's assigned role and the active subscription plan.

## 2. User roles

Common roles found in the system include:
- `SYSTEM_OWNER`: platform-wide administration
- `ADMIN`: organization-level setup and oversight
- `BRANCH_MANAGER`: branch operations and stock control
- `ACCOUNTANT`: finance, reports, and payment visibility
- `SELLER`: point of sale and day-to-day selling activities

## 3. Getting started

### 3.1 Account access

Users typically start by:
1. opening the application URL in a supported browser
2. signing up or accepting an invitation
3. verifying email, where enabled
4. logging in with email and password
5. selecting an organization when the user belongs to more than one

### 3.2 Create or select an organization

After login, a user may:
- create a new organization
- join an existing organization through invitation
- switch between organizations from the organization selector

Each organization stores its own users, branches, products, sales, reports, and subscription records.

## 4. Dashboard overview

The dashboard provides quick access to:
- total sales
- total products
- low-stock items
- recent sales
- top products
- activity trends
- organization alerts and notifications

Use the sidebar to navigate to operational modules such as inventory, customers, sales, reports, suppliers, and settings.

## 5. Organization and branch setup

### 5.1 Organization configuration

Administrators can maintain organization details such as:
- organization name
- business type
- address and contact details
- logo or avatar
- tax identification details
- branch setup

### 5.2 Branch management

Where branch functionality is enabled, the organization can:
- create business branches
- assign codes and locations
- activate or deactivate branches
- assign users to branches
- track stock, sales, expenses, and activity by branch

## 6. Inventory management

### 6.1 Add a product

To create a product record:
1. open the inventory section
2. select the option to add a new product
3. enter the product name and optional SKU or barcode
4. assign category, supplier, and tax category where applicable
5. define selling price and minimum stock level
6. save the record

### 6.2 Receive stock

Stock can be recorded with batch details such as:
- batch number
- quantity
- unit cost
- expiry date
- branch

This helps the system track stock movements, expiry, and costing history.

### 6.3 Monitor inventory

Users can review:
- all inventory items
- low-stock products
- expiring products
- expired products
- stock movement history
- inventory summary by product and branch

### 6.4 Adjust and transfer stock

Authorized users may:
- increase or decrease stock during adjustments
- record damages or expired stock
- transfer stock from one branch to another
- review ledger entries created by each movement

## 7. Sales and point of sale

### 7.1 Create a sale

To process a sale:
1. open the POS or sales page
2. select or create a customer
3. add one or more products to the sale
4. confirm quantities and prices
5. select the payment method
6. complete the sale and generate a receipt

### 7.2 Payment methods

The platform supports several payment classifications, including:
- cash
- insurance
- debt
- mixed payment
- credit card
- mobile money

Some payment methods may depend on your enabled integrations and internal business process.

### 7.3 Sale review

Users can:
- view sale history
- open detailed sale records
- print or reprint receipts
- review line items and totals
- monitor refund or cancellation status

### 7.4 Refunds and cancellations

Authorized users can refund or cancel sales according to business rules. Always enter a clear reason when prompted and confirm that the original transaction is eligible before proceeding.

If EBM/VSDC is enabled, related fiscal actions may also be submitted through the configured gateway.

## 8. Customer and debt management

The customer module allows users to:
- register walk-in or named customers
- store contact details
- track balances for debt sales
- record debt repayments
- review outstanding debt positions

Recommended practice:
- keep customer phone numbers accurate
- use clear references when recording debt payments
- review outstanding balances regularly

## 9. Supplier and purchasing workflows

Users can manage supplier operations by:
- creating supplier profiles
- raising purchase orders
- tracking order status
- recording supplier payments
- linking products to suppliers where needed

This workflow supports better stock replenishment planning and supplier accountability.

## 10. Reports

Available reports may include:
- sales reports
- inventory reports
- stock movement reports
- cash flow reports
- debt payment reports

Use report filters such as date range, branch, or transaction type to refine results before export or review.

## 11. Users, invitations, and audit trail

Administrators can:
- invite users to the organization
- assign roles
- update or deactivate user access
- review activity logs

Notifications and logs improve traceability and help identify who performed important actions.

## 12. Subscription and billing

Organizations may have subscription plans that determine enabled features and user limits. Depending on the deployment, billing workflows can include:
- plan selection
- payment initiation
- subscription history
- renewals
- cancellation or reactivation

If your organization cannot access a feature, first check the active plan and user role.

## 13. Tips for safe and effective use

- keep user roles limited to actual job responsibilities
- review low-stock and expiry alerts daily
- verify branch selection before entering stock or sales
- back up your database regularly
- test payment and EBM settings in non-production environments first
- log out shared devices after use

## 14. Troubleshooting guide

### Unable to log in
- confirm the correct email and password
- ensure the account is active and verified
- use the password reset feature if necessary

### Data is missing after login
- confirm you selected the correct organization
- check branch filters and date filters
- refresh the page and try again

### Sale cannot be completed
- confirm stock is available
- check required customer or payment fields
- review internet connectivity if payment or EBM integrations are involved

### Feature is unavailable
- check user role permissions
- confirm the organization subscription includes that feature

## 15. Support information

Support contact details should be inserted here before distribution:
- support email: `[Support Email]`
- support phone: `[Support Phone]`
- support hours: `[Support Hours]`
