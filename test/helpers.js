const Web3 = require('web3');

const { BN } = Web3.utils;
const max = new BN('10000000000000000'); // <- 0.01 ether
const min = new BN('0');
const adjust = new BN('10000000000000000');

let web3;

const Helpers = {
  initHelperWeb3(_web3) {
    web3 = new Web3(_web3.currentProvider);
  },
  zeroAddress: '0x0000000000000000000000000000000000000000',
  addressOne: '0x0000000000000000000000000000000000000001',
  hex(input) {
    return web3.utils.fromAscii(input).padEnd(66, '0');
  },
  fromHex(input) {
    return web3.utils.hexToAscii(input);
  },
  int(input) {
    return parseInt(input, 10);
  },
  fullHex(cutHex) {
    return web3.utils.padRight(cutHex, 64);
  },
  numberToEvmWord(number) {
    return web3.utils.padLeft(web3.utils.numberToHex(number), 64);
  },
  addressToEvmWord(address) {
    return web3.utils.padLeft(address, 64);
  },
  gwei(number) {
    return web3.utils.toWei(number.toString(), 'gwei');
  },
  szabo(number) {
    return web3.utils.toWei(number.toString(), 'szabo');
  },
  ether(number) {
    return web3.utils.toWei(number.toString(), 'ether');
  },
  galt(number) {
    return web3.utils.toWei(number.toString(), 'ether');
  },
  roundToPrecision(number, precision = 4) {
    return Math.round(number * 10 ** precision) / 10 ** precision;
  },
  weiToEtherRound(wei, precision = 4) {
    return Helpers.roundToPrecision(parseFloat(web3.utils.fromWei(wei.toFixed(), 'ether')), precision);
  },
  getMethodCode(abi, methodName) {
    let code = null;
    abi.some(method => {
      if (method.name === methodName) {
        code = `${method.name}(${method.inputs.map(i => i.type).join(',')})`;
        return true;
      }
      return false;
    });
    return code;
  },
  getMethodSignature(abi, methodName) {
    let signature = null;
    abi.some(method => {
      if (method.name === methodName) {
        // eslint-disable-next-line
        signature = method.signature;
        if (!signature) {
          signature = web3.eth.abi.encodeFunctionSignature(method);
        }
        return true;
      }
      return false;
    });
    return signature;
  },
  getDestinationMarker(contract, methodName) {
    const methodSignature = Helpers.getMethodSignature(contract.abi, methodName);
    const encodedParameters = web3.eth.abi.encodeParameters(
      ['address', 'bytes32'],
      [contract.address, methodSignature]
    );
    return web3.utils.keccak256(encodedParameters);
  },
  log(...args) {
    console.log('>>>', new Date().toLocaleTimeString(), '>>>', ...args);
  },
  applicationStatus: {
    NOT_EXISTS: 0,
    SUBMITTED: 1,
    APPROVED: 2,
    REJECTED: 3,
    REVERTED: 4,
    ACCEPTED: 5,
    LOCKED: 6,
    REVIEW: 7,
    COMPLETED: 8,
    CLOSED: 9
  },
  paymentMethods: {
    NONE: 0,
    ETH_ONLY: 1,
    GALT_ONLY: 2,
    ETH_AND_GALT: 3
  },
  async sleep(timeout) {
    return new Promise(resolve => {
      setTimeout(resolve, timeout);
    });
  },
  async logLatestBlock(msg) {
    // eslint-disable-next-line
    msg = msg ? `${msg} ` : '';
    const block = await web3.eth.getBlock('latest');
    console.log(`${msg}Block/Timestamp`, `${block.number}/${block.timestamp}`);
  },
  async lastBlockTimestamp() {
    return (await web3.eth.getBlock('latest')).timestamp;
  },
  async increaseTime(seconds) {
    await Helpers.evmIncreaseTime(seconds);
    await Helpers.evmMineBlock(seconds);
  },
  async evmMineBlock() {
    return new Promise(function(resolve, reject) {
      web3.eth.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'evm_mine',
          id: 0
        },
        function(err, res) {
          if (err) {
            reject(err);
            return;
          }

          resolve(res);
        }
      );
    });
  },
  async evmIncreaseTime(seconds) {
    return new Promise(function(resolve, reject) {
      web3.eth.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'evm_increaseTime',
          params: [seconds],
          id: 0
        },
        function(err, res) {
          if (err) {
            reject(err);
            return;
          }

          resolve(res);
        }
      );
    });
  },
  async assertInvalid(promise) {
    try {
      await promise;
    } catch (error) {
      const revert = error.message.search('invalid opcode') >= 0;
      assert(revert, `Expected INVALID (0xfe), got '${error}' instead`);
      return;
    }
    assert.fail('Expected INVALID (0xfe) not received');
  },
  async assertRevert(promise) {
    try {
      await promise;
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert, `Expected throw, got '${error}' instead`);
      return;
    }
    assert.fail('Expected throw not received');
  },
  assertEqualBN(actual, expected) {
    assert(actual instanceof BN, 'Actual value isn not a BN instance');
    assert(expected instanceof BN, 'Expected value isn not a BN instance');

    assert(
      actual.toString(10) === expected.toString(10),
      `Expected ${web3.utils.fromWei(actual)} (actual) ether to be equal ${web3.utils.fromWei(
        expected
      )} ether (expected)`
    );
  },
  /**
   * Compare ETH balances
   *
   * @param balanceBefore string
   * @param balanceAfter string
   * @param balanceDiff string
   */
  assertEthBalanceChanged(balanceBefore, balanceAfter, balanceDiff) {
    const diff = new BN(balanceAfter)
      .sub(new BN(balanceDiff)) // <- the diff
      .sub(new BN(balanceBefore))
      .add(adjust); // <- 0.01 ether

    assert(
      diff.lt(max), // diff < 0.01 ether
      `Expected ${web3.utils.fromWei(diff.toString(10))} (${diff.toString(10)} wei) to be less than 0.01 ether`
    );

    assert(
      diff.gt(min), // diff > 0
      `Expected ${web3.utils.fromWei(diff.toString(10))} (${diff.toString(10)} wei) to be greater than 0`
    );
  },
  /**
   * Compare GALT balances
   *
   * @param balanceBefore string | BN
   * @param balanceAfter string | BN
   * @param balanceDiff string | BN
   */
  assertGaltBalanceChanged(balanceBeforeArg, balanceAfterArg, balanceDiffArg) {
    let balanceBefore;
    let balanceAfter;
    let balanceDiff;

    if (typeof balanceBeforeArg == 'string') {
      balanceBefore = new BN(balanceBeforeArg);
    } else if (balanceBeforeArg instanceof BN) {
      balanceBefore = balanceBeforeArg;
    } else {
      throw Error('#assertGaltBalanceChanged(): balanceBeforeArg is neither BN instance nor a string');
    }

    if (typeof balanceAfterArg == 'string') {
      balanceAfter = new BN(balanceAfterArg);
    } else if (balanceAfterArg instanceof BN) {
      balanceAfter = balanceAfterArg;
    } else {
      throw Error('#assertGaltBalanceChanged(): balanceAfterArg is neither BN instance nor a string');
    }

    if (typeof balanceDiffArg == 'string') {
      balanceDiff = new BN(balanceDiffArg);
    } else if (balanceDiffArg instanceof BN) {
      balanceDiff = balanceDiffArg;
    } else {
      throw Error('#assertGaltBalanceChanged(): balanceDiffArg is neither BN instance nor a string');
    }

    Helpers.assertEqualBN(balanceAfter, balanceBefore.add(balanceDiff));
  },
  async printStorage(address, slotsToPrint) {
    assert(typeof address !== 'undefined');
    assert(address.length > 0);

    console.log('Storage listing for', address);
    const tasks = [];

    for (let i = 0; i < (slotsToPrint || 20); i++) {
      tasks.push(web3.eth.getStorageAt(address, i));
    }

    const results = await Promise.all(tasks);

    for (let i = 0; i < results.length; i++) {
      console.log(`slot #${i}`, results[i]);
    }
  },
  getEventArg(res, eventName, argName) {
    for (let i = 0; i < res.logs.length; i++) {
      const current = res.logs[i];

      if (eventName === current.event) {
        return current.args[argName];
      }
    }

    throw new Error(`Event ${eventName} not found`);
  }
};

Object.freeze(Helpers.applicationStatus);

module.exports = Helpers;
