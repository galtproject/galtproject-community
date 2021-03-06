.PHONY: test report

cleanup:
	rm -rf ./build

compile: cleanup
	SOLC=0.5.13 npm run compile
	node scripts/checkContractSize.js
	-tput bel

lint:
	npm run ethlint
	npm run eslint

lint-fix:
	npm run ethlint
	npm run eslint-fix

only-skip:
	./scripts/only-skip.sh

only-recover:
	./scripts/only-recover.sh

ftest:
	-npm test
	tput bel

test: only-skip
	-npm test
	-tput bel
	$(MAKE) only-recover

check-size:
	node scripts/checkContractSize.js

ctest: compile test

show-proposal-signatures:
	./node_modules/.bin/truffle exec scripts/showProposalSignatures.js --network test -c

