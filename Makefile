.PHONY: test report

cleanup:
	rm -rf ./build

compile: cleanup
	npm run compile
	node scripts/checkContractSize.js
	tput bel

validate:
	npm run ethlint
	npm run eslint

test:
	-npm test
	tput bel

check-size:
	node scripts/checkContractSize.js

ctest: cleanup test

