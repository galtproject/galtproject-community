module.exports = {
  accounts: {
    amount: 25, // Number of unlocked accounts
    ether: 1000000 // Initial balance of unlocked accounts (in ether)
  },

  contracts: {
    type: 'truffle', // Contract abstraction to use: 'truffle' for @truffle/contract or 'web3' for web3-eth-contract
    defaultGas: 9800001, // Maximum gas for contract calls (when unspecified)

    // Options available since v0.1.2
    defaultGasPrice: 20e9, // Gas price for contract calls (when unspecified)
    artifactsDir: 'build/contracts' // Directory where contract artifacts are stored
  },

  blockGasLimit: 9900000 // Maximum gas per block
};
