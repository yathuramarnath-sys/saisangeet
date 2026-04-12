# Test Coverage Matrix

## Backend

| Area | Priority | Test Type |
| --- | --- | --- |
| `utils/api-error.js` | High | Unit |
| `utils/async-handler.js` | High | Unit |
| `middleware/require-auth.js` | High | Unit |
| `middleware/require-permission.js` | High | Unit |
| `middleware/not-found.js` | Medium | Unit |
| `middleware/error-handler.js` | High | Unit |
| `modules/auth/auth.service.js` | High | Unit |
| `modules/auth/auth.repository.js` | Medium | Integration |
| `routes/index.js` | Medium | Integration |
| future pricing/tax modules | Critical | Unit + Integration |
| future shifts and cash modules | Critical | Unit + Integration |
| future reports and closing email modules | Critical | Unit + Integration |

## Owner Web

| Area | Priority | Test Type |
| --- | --- | --- |
| `src/data/navigation.js` | High | Unit |
| `src/data/screens.js` | High | Unit |
| `src/components/layout.js` | Medium | Unit |
| `src/pages/screen-renderer.js` | High | Unit |
| future React page components | High | Component |
| future owner email trigger form | Critical | Component + Integration |

## Future Apps

| App | Critical Areas |
| --- | --- |
| operations POS | pricing, tables, billing, payments, shift close, KOT print |
| waiter mobile | table selection, instructions, send KOT, move table |
| kitchen display | queue state, station filtering, ready status |

## Business Rules That Must Never Ship Untested

- GST calculations
- area-wise and service-wise pricing
- discount approval limits
- shift opening and closing cash
- cash in and cash out validation
- outlet-specific integration mapping
- daily closing report aggregation
