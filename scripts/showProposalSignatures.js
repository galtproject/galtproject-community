const FundStorage = artifacts.require('./FundStorage.sol');

const { initHelperWeb3, getMethodSignature, getMethodCode } = require('../test/helpers');

const { web3 } = FundStorage;

initHelperWeb3(web3);

[
  'addProposalMarker',
  'addFundRule',
  'disableFundRule',
  'addFeeContract',
  'removeFeeContract',
  'setMemberIdentification',
  'setNameAndDescription',
  'setPeriodLimit',
  'setProposalThreshold',
  'setConfigValue',
  'removeProposalMarker',
  'replaceProposalMarker'
].forEach(methodName => {
  const signature = getMethodSignature(FundStorage._json.abi, methodName);
  const code = getMethodCode(FundStorage._json.abi, methodName);
  console.log(methodName, signature, code);
});

process.exit();
