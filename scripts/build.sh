#!/bin/bash

# Build Noir contracts
cd src/contracts
aztec-nargo compile
aztec codegen -o src/artifacts target

# Return to root
cd ../..
