#!/bin/bash

echo "" > deployment.log

# Create account
output_account=$(aztec-wallet create-account -a my-wallet  -n https://pxe.obsidion.xyz)
echo "$output_account" | tee -a deployment.log

# Deploy Token Contracts
output_token1=$(aztec-wallet deploy TokenContractArtifact --from accounts:my-wallet --args "accounts:my-wallet TestToken1 TST1 18" -a testtoken1 -n https://pxe.obsidion.xyz)
echo "$output_token1" | tee -a deployment.log

output_token2=$(aztec-wallet deploy TokenContractArtifact --from accounts:my-wallet --args "accounts:my-wallet TestToken2 TST2 18" -a testtoken2 -n https://pxe.obsidion.xyz)
echo "$output_token2" | tee -a deployment.log

output_token3=$(aztec-wallet deploy TokenContractArtifact --from accounts:my-wallet --args "accounts:my-wallet TestToken3 TST3 18" -a testtoken3 -n https://pxe.obsidion.xyz)
echo "$output_token3" | tee -a deployment.log

# Deploy RockPaperScissors Contract
output_rps=$(aztec-wallet deploy src/contracts/target/rock_paper_scissors-RockPaperScissors.json --from accounts:my-wallet --args "accounts:my-wallet 2" -a rps  -n https://pxe.obsidion.xyz)
echo "$output_rps" | tee -a deployment.log

