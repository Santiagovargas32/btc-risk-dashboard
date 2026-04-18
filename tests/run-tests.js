const tests = [
  require('./feature-engine.test'),
  require('./indicators.test'),
  require('./scoring.test'),
];

let failed = 0;

for (const testCase of tests) {
  try {
    testCase.run();
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`${tests.length} tests passed`);
}
