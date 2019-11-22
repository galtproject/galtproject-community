const FundStorage = artifacts.require('./FundStorage.sol');
const FundMultiSig = artifacts.require('./FundMultiSig.sol');

const { initHelperWeb3, getMethodSignature, getMethodCode } = require('../test/helpers');

const { web3 } = FundStorage;

initHelperWeb3(web3);

[
  'storage.addProposalMarker',
  'storage.addFundRule',
  'storage.disableFundRule',
  'storage.addFeeContract',
  'storage.removeFeeContract',
  'storage.setMemberIdentification',
  'storage.setNameAndDataLink',
  'storage.setPeriodLimit',
  'storage.setProposalThreshold',
  'storage.setConfigValue',
  'storage.removeProposalMarker',
  'storage.replaceProposalMarker',
  'multiSig.setOwners'
].forEach(fullMethodName => {
  let contract;
  if (fullMethodName.indexOf('storage.') !== -1) {
    contract = FundStorage;
  }
  if (fullMethodName.indexOf('multiSig.') !== -1) {
    contract = FundMultiSig;
  }
  if (!contract) {
    console.error('Contract not found');
    return;
  }
  const methodName = fullMethodName.split('.')[1];
  const signature = getMethodSignature(contract._json.abi, methodName);
  const code = getMethodCode(contract._json.abi, methodName);
  console.log(fullMethodName, signature, code);
});

process.exit();
