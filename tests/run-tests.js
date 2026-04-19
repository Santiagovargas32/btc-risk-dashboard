const tests = [
  require('./feature-engine.test'),
  require('./indicators.test'),
  require('./scoring.test'),
  require('./technical-engine.test'),
  require('./macro-engine.test'),
  require('./geopolitical-engine.test'),
  require('./volatility-engine.test'),
  require('./fusion-engine.test'),
  require('./knowledge-loader.test'),
  require('./pdf-knowledge-engine.test'),
  require('./knowledge-directory-import.test'),
  require('./llm-score.test'),
];

async function main() {
  let failed = 0;

  for (const testCase of tests) {
    try {
      await Promise.resolve(testCase.run());
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
}

main();
