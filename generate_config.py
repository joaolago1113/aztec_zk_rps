import sys
import re

def extract_details(log_data):
    # Regular expressions for extracting necessary details
    address_pattern = re.compile(r"Contract deployed at\s+(0x[a-fA-F0-9]{64})")
    partial_address_pattern = re.compile(r"Contract partial address\s+(0x[a-fA-F0-9]{64})")
    init_hash_pattern = re.compile(r"Contract init hash\s+(0x[a-fA-F0-9]{64})")
    deploy_tx_hash_pattern = re.compile(r"Deployment tx hash:\s+(0x[a-fA-F0-9]{64})")
    deployment_salt_pattern = re.compile(r"Deployment salt:\s+(0x[a-fA-F0-9]{64})")
    deployer_pattern = re.compile(r"Address:\s+(0x[a-fA-F0-9]{64})")

    # Extract details
    addresses = address_pattern.findall(log_data)
    partial_addresses = partial_address_pattern.findall(log_data)
    init_hashes = init_hash_pattern.findall(log_data)
    deploy_tx_hashes = deploy_tx_hash_pattern.findall(log_data)
    deployment_salts = deployment_salt_pattern.findall(log_data)
    deployer = deployer_pattern.findall(log_data)

    # Print extracted details for debugging
    print("Addresses:", addresses)
    print("Partial Addresses:", partial_addresses)
    print("Init Hashes:", init_hashes)
    print("Deployment TX Hashes:", deploy_tx_hashes)
    print("Deployment Salts:", deployment_salts)
    print("Deployer:", deployer)


    partial_addresses = ['','','','',''];


    # Details dict assembly
    details = {
        'tokens': [
            {
                "ADDRESS": addresses[0],
                "PARTIAL_ADDRESS": partial_addresses[0],
                "INIT_HASH": init_hashes[0],
                "DEPLOYMENT_SALT": deployment_salts[0],
                "TX_HASH": deploy_tx_hashes[0],
                "DEPLOYER": deployer[0] if deployer else '',
                "NAME": "TestToken1",
                "SYMBOL": "TST1",
                "DECIMALS": 18
            },
            {
                "ADDRESS": addresses[1],
                "PARTIAL_ADDRESS": partial_addresses[1],
                "INIT_HASH": init_hashes[1],
                "DEPLOYMENT_SALT": deployment_salts[1],
                "TX_HASH": deploy_tx_hashes[1],
                "DEPLOYER": deployer[0] if deployer else '',
                "NAME": "TestToken2",
                "SYMBOL": "TST2",
                "DECIMALS": 18
            },
            {
                "ADDRESS": addresses[2],
                "PARTIAL_ADDRESS": partial_addresses[2],
                "INIT_HASH": init_hashes[2],
                "DEPLOYMENT_SALT": deployment_salts[2],
                "TX_HASH": deploy_tx_hashes[2],
                "DEPLOYER": deployer[0] if deployer else '',
                "NAME": "TestToken3",
                "SYMBOL": "TST3",
                "DECIMALS": 18
            }
        ],
        'rps': {
            "ADDRESS": addresses[3],
            "PARTIAL_ADDRESS": partial_addresses[3],
            "INIT_HASH": init_hashes[3],
            "DEPLOYMENT_SALT": deployment_salts[3],
            "TX_HASH": deploy_tx_hashes[3],
            "DEPLOYER": deployer[0] if deployer else ''
        }
    }
    return details


def main():
    log_data = sys.stdin.read()
    details = extract_details(log_data)

    config_template = f"""
export const CONFIG = {{
  WALLETCONNECT_PROJECT_ID: '9c949a62a5bde2de36fcd8485d568064',
  l1RpcUrl: 'http://localhost:8545',
  //PXE_URL: 'https://pxe.obsidion.xyz',
  PXE_URL: 'http://localhost:8080',
  
  TOKEN_CONTRACTS: [
    {{
      ADDRESS: '{details['tokens'][0]['ADDRESS']}',
      PARTIAL_ADDRESS: '{details['tokens'][0]['PARTIAL_ADDRESS']}',
      INIT_HASH: '{details['tokens'][0]['INIT_HASH']}',
      DEPLOYMENT_SALT: '{details['tokens'][0]['DEPLOYMENT_SALT']}',
      TX_HASH: '{details['tokens'][0]['TX_HASH']}',
      DEPLOYER: '{details['tokens'][0]['DEPLOYER']}',
      NAME: '{details['tokens'][0]['NAME']}',
      SYMBOL: '{details['tokens'][0]['SYMBOL']}',
      DECIMALS: {details['tokens'][0]['DECIMALS']}
    }},
    {{
      ADDRESS: '{details['tokens'][1]['ADDRESS']}',
      PARTIAL_ADDRESS: '{details['tokens'][1]['PARTIAL_ADDRESS']}',
      INIT_HASH: '{details['tokens'][1]['INIT_HASH']}',
      DEPLOYMENT_SALT: '{details['tokens'][1]['DEPLOYMENT_SALT']}',
      TX_HASH: '{details['tokens'][1]['TX_HASH']}',
      DEPLOYER: '{details['tokens'][1]['DEPLOYER']}',
      NAME: '{details['tokens'][1]['NAME']}',
      SYMBOL: '{details['tokens'][1]['SYMBOL']}',
      DECIMALS: {details['tokens'][1]['DECIMALS']}
    }},
    {{
      ADDRESS: '{details['tokens'][2]['ADDRESS']}',
      PARTIAL_ADDRESS: '{details['tokens'][2]['PARTIAL_ADDRESS']}',
      INIT_HASH: '{details['tokens'][2]['INIT_HASH']}',
      DEPLOYMENT_SALT: '{details['tokens'][2]['DEPLOYMENT_SALT']}',
      TX_HASH: '{details['tokens'][2]['TX_HASH']}',
      DEPLOYER: '{details['tokens'][2]['DEPLOYER']}',
      NAME: '{details['tokens'][2]['NAME']}',
      SYMBOL: '{details['tokens'][2]['SYMBOL']}',
      DECIMALS: {details['tokens'][2]['DECIMALS']}
    }}
  ],
  
  RPS_CONTRACT: {{
    ADDRESS: '{details['rps']['ADDRESS']}',
    PARTIAL_ADDRESS: '{details['rps']['PARTIAL_ADDRESS']}',
    INIT_HASH: '{details['rps']['INIT_HASH']}',
    DEPLOYMENT_SALT: '{details['rps']['DEPLOYMENT_SALT']}',
    TX_HASH: '{details['rps']['TX_HASH']}',
    DEPLOYER: '{details['rps']['DEPLOYER']}'
  }},

  SDK_METADATA: {{
    name: "Aztec Wallet",
    description: "",
    url: "",
    icons: [],
  }}
}};
    """

    # Write to config.ts
    with open('src/config.ts', 'w') as f:
        f.write(config_template.strip())

if __name__ == "__main__":
    main()

