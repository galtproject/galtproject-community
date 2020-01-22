const Ganache = require('ganache-core');

const config = {
  networks: {
    production: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*'
    },
    ganache: {
      host: '127.0.0.1',
      port: 7545,
      network_id: '*'
    },
    development: {
      host: '127.0.0.1',
      port: 7545,
      network_id: '*'
    },
    local: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*',
      gasLimit: 9000000
    },
    test: {
      // https://github.com/trufflesuite/ganache-core#usage
      provider: Ganache.provider({
        unlocked_accounts: [0, 1, 2, 3, 4, 5],
        total_accounts: 30,
        vmErrorsOnRPCResponse: true,
        default_balance_ether: 5000000,
        gasLimit: 9500000
      }),
      skipDryRun: true,
      gasLimit: 9500000,
      network_id: '*'
    }
  },
  compilers: {
    solc: {
      version: '0.5.13',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};

module.exports = config;
