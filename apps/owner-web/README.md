# Owner Web App

This folder is the real scaffold for the owner dashboard application.

## Current state

- Framework-ready static scaffold
- Reusable layout and page modules
- Shared data source for prototype rendering
- Screen coverage for:
  - overview
  - outlets
  - menu
  - staff
  - integrations
  - devices
  - taxes and receipts
  - shifts and cash control
  - discount rules
  - reports

## Why it is scaffolded this way

Node.js and npm are not available in the current environment, so this app is structured to be easy to convert into React once moved into a Node-enabled setup.

## Next implementation step

1. Install Node.js in the target environment
2. Convert this scaffold into a React app
3. Replace static data with backend API calls
4. Add routing, forms, and authentication
