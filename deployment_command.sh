#!/bin/bash

echo "" > deployment.log

# Create account
output_account=$(aztec-wallet create-account -a my-wallet)
echo "$output_account" | tee -a deployment.log

# Deploy TokenContract
output_token=$(aztec-wallet deploy TokenContractArtifact --from accounts:my-wallet --args "accounts:my-wallet TestToken TST 18" -a testtoken)
echo "$output_token" | tee -a deployment.log

# Deploy RockPaperScissors Contract
output_rps=$(aztec-wallet deploy src/contracts/target/rock_paper_scissors-RockPaperScissors.json --from accounts:my-wallet --args "accounts:my-wallet contracts:testtoken 2" -a rps)
echo "$output_rps" | tee -a deployment.log

