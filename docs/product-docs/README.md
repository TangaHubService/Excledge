# Excledge ERP Product Documentation Pack

This folder contains a ready-to-edit documentation pack for Excledge ERP.

Included documents:
- `PRODUCT-BROCHURE.md`
- `PRODUCT-WARRANTY-STATEMENT.md`
- `PRODUCT-USER-MANUAL.md`
- `INSTALLATION-GUIDE.md`
- `PROGRAMMING-AND-CONFIGURATION-MANUAL.md`

Notes:
- These documents were drafted from the current repository structure, application routes, Prisma schema, configuration files, and existing EBM/VSDC documentation.
- Legal and commercial information that cannot be confirmed from source code is marked with placeholders such as `[Supplier Legal Name]`, `[Warranty Period]`, and `[Approved By]`.
- Before sharing externally, review the warranty, contact, pricing, and support commitments with your business or legal team.

Technical basis used for this pack:
- Product overview in `README.md`
- Runtime and dependency details in `Backend/package.json` and `Frontend/package.json`
- Configuration usage in `Backend/.env.example`, `Backend/src/config/index.ts`, `Backend/src/index.ts`, and `Frontend/src/lib/api-client.ts`
- Product domain and roles in `Backend/prisma/schema.prisma`
- Rwanda EBM/VSDC references in `docs/ebm-vsdc`
