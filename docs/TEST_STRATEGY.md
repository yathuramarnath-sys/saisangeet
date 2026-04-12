# Test Strategy

## 1. Goal

The platform should be built with automated tests from the start so it remains safe to change as it grows into a multi-app restaurant product.

The main goal is:

- protect billing logic
- protect pricing and tax logic
- protect permissions and cash controls
- protect integrations and reporting rules

## 2. Testing Layers

### Unit tests

Use unit tests for:

- pricing calculations
- tax calculations
- permission checks
- discount rule validation
- shift cash calculations
- KOT routing rules
- report summary builders
- integration mapping logic

These should be the largest test layer.

### Integration tests

Use integration tests for:

- backend route and service interaction
- database repository behavior
- auth and permission middleware flow
- device link flow
- order to KOT flow
- shift close flow
- daily closing report generation flow

### Component tests

Use component tests for:

- owner web screen components
- reusable cards, forms, and tables
- pricing matrix UI
- receipt preview UI
- discount approval panels

### End-to-end tests

Use end-to-end tests for:

- owner setup flow
- outlet creation to device linking
- menu creation to POS use
- cashier opening shift to closing shift
- waiter order to kitchen to billing
- daily closing report email trigger

## 3. Current Repo Test Priorities

### Backend

Must test first:

- middleware
- utility helpers
- auth service
- permission enforcement
- route response shape

### Owner web

Must test first:

- screen registry and navigation configuration
- page rendering contracts
- reusable layout behavior
- report trigger form logic

### Future POS and mobile apps

Must test first:

- pricing resolution
- KOT generation
- table movement
- split bill
- shift cash calculations
- offline sync state transitions

## 4. High-Risk Business Areas

These areas need especially strong coverage:

- GST calculations
- item pricing by area and order type
- manual discount limits
- deleted bill and override tracking
- opening and closing cash mismatch logic
- outlet mapping for integrations
- KOT print or display routing by station

## 5. Recommended Tooling

### Backend

- use Node built-in test runner first
- later add `supertest` for route integration tests when dependencies are available

### Owner web

- use `vitest` and component tests after React conversion
- use React Testing Library after React conversion

### End-to-end

- use Playwright after the real apps are runnable

## 6. Coverage Expectations

Initial target:

- business logic and middleware above 80%

Stricter target later:

- pricing, tax, permissions, shifts, discounts, and reports above 90%

## 7. Daily Closing Report Coverage

The closing report flow should be tested for:

- unresolved shift blocks or warnings
- sales and payment totals
- outlet aggregation
- cash mismatch inclusion
- owner email trigger conditions
- scheduled versus manual send logic

## 8. Rule for New Features

Every new feature should add:

- at least one unit test for business logic
- integration tests when backend behavior changes
- component tests when owner web UI changes

This should be a standing engineering rule for the product.
