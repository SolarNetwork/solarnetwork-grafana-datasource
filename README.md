# Grafana SolarNetwork Datasource

## Overview
This plugin adds a SolarNetwork datasource to Grafana. It has a backend
component in order to provide a signing key to the frontend without
revealing the secret.

## Build Requirements
As well as the normal npm dependencies, you will need Go 1.22+ and mage
installed and available on the path. These are for the backend component.

On macOS, you can install Go 1.22 via homebrew:

```
brew install go@1.22
export PATH="/opt/homebrew/opt/go@1.22/bin:$PATH"
```

## Building

```
npm run build
```
This will build everything to the dist/ directory.
