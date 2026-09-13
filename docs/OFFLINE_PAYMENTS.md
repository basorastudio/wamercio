# Manual and offline payment policy

WAMERCIO does not process electronic payments inside a business in this release. It records the method used and preserves business traceability, but it does not capture card data, authorize transactions, or confirm bank deposits automatically.

## Supported methods

- **Cash:** physically received by the business.
- **Manual bank transfer:** completed outside WAMERCIO and verified by the business.
- **External card terminal:** charged through an independent Verifone or bank terminal and then recorded in WAMERCIO.
- **Store credit:** creates an account receivable linked to the customer and supports later manual installments.

## Operating rules

1. Never request or store full card numbers, CVV values, banking passwords, or customer credentials.
2. Transfer and terminal references are informational and are not bank reconciliation.
3. Only cash automatically changes the expected cash drawer balance; transfers and external-terminal payments remain classified by method.
4. Refunds must describe the real offline action: cash, manual transfer, external reversal, or store credit.
5. Voids, returns, and credit payments are audited and must not be physically deleted.
6. The UI must not present these methods as a payment gateway or promise automatic confirmation.
