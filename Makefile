.PHONY: test report

cleanup:
	rm -rf ./build

compile: cleanup
	truffle compile
	tput bel

validate:
	npm run solium
	npm run eslint

test:
	-npm test
	tput bel

retest: cleanup test

