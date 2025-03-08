export const CONFIG = {
  WALLETCONNECT_PROJECT_ID: '9c949a62a5bde2de36fcd8485d568064',
  l1RpcUrl: 'http://localhost:8545',
  //PXE_URL: 'https://pxe.obsidion.xyz',
  PXE_URL: 'http://localhost:8080',
  
  TOKEN_CONTRACTS: [
    {
      ADDRESS: '0x0cee5e047646cc5946f9ecdbb7466ea61fb3e220d0580a993ee9d29ffaa022d2',
      PARTIAL_ADDRESS: '',
      INIT_HASH: '0x2318754e4016d1e06d5dc670da02b5e7d7be93b8a1a53e9db71cb0eadda0b626',
      DEPLOYMENT_SALT: '0x2de507b2d38530d31d1c1d045ec1cc3211d706ee42289decead738e45120e85c',
      TX_HASH: '0x1b2e4f08ca38672352e3981b45a6993ea32c5752444bee0cefd9a828de39dfa9',
      DEPLOYER: '0x2b92f3264db127fb7bc34bc509b0fef8976102d8696b0b6acafd3aaf75e28f5a',
      NAME: 'TestToken1',
      SYMBOL: 'TST1',
      DECIMALS: 18
    },
    {
      ADDRESS: '0x0e743790fa4466244e43dfa3c44cff7cce03f3dad98b23d080f9153d6c92d1e9',
      PARTIAL_ADDRESS: '',
      INIT_HASH: '0x0acb629992b4ef4bb4e10019eeb342dc54995601e2ef2f9d9b9ea2a5e0a7b51d',
      DEPLOYMENT_SALT: '0x123fd5313c11c3767bda3ccff363d0700d445ba75ee458d0632676e3c791f207',
      TX_HASH: '0x0bcdaf1167b82c7e7e9d41ad6c21cada56809575c5eeb6b1c3384458590cc8e7',
      DEPLOYER: '0x2b92f3264db127fb7bc34bc509b0fef8976102d8696b0b6acafd3aaf75e28f5a',
      NAME: 'TestToken2',
      SYMBOL: 'TST2',
      DECIMALS: 18
    },
    {
      ADDRESS: '0x0ce35b6151b37d8397f4198a66b46a1eab8e4b4d9765def8c9becd2ab44c3817',
      PARTIAL_ADDRESS: '',
      INIT_HASH: '0x2747dd89d9bb9ce4bee24b1c3227dc4384547dd5eefbf931725a147c25e296c2',
      DEPLOYMENT_SALT: '0x1af7bdafa591e96f26e8200a632f3e152f48c3a9966fdcf17f4da021c81add78',
      TX_HASH: '0x14b7084d3f01cac1431efdebb2669db70cbb31bed8a93ac37bf9c0ca43774d5e',
      DEPLOYER: '0x2b92f3264db127fb7bc34bc509b0fef8976102d8696b0b6acafd3aaf75e28f5a',
      NAME: 'TestToken3',
      SYMBOL: 'TST3',
      DECIMALS: 18
    }
  ],
  
  RPS_CONTRACT: {
    ADDRESS: '0x029a8266a4747979abc2de5f5bc2edc1458ae7c2655653e05345f307acf4a474',
    PARTIAL_ADDRESS: '',
    INIT_HASH: '0x0e5856aa84e3506b498464f12602a57a283699829bb38412be31fe79fcea99bd',
    DEPLOYMENT_SALT: '0x222af1e7847c1e2e29a47e0f22b9e5862b222669f0dcb50730f1a2e876f09e6b',
    TX_HASH: '0x2314900675649190ec1bb4ac15d5f49996477f6465dc3e54e1875a0fdf71bccd',
    DEPLOYER: '0x2b92f3264db127fb7bc34bc509b0fef8976102d8696b0b6acafd3aaf75e28f5a'
  },

  SDK_METADATA: {
    name: "Aztec Wallet",
    description: "",
    url: "",
    icons: [],
  }
};