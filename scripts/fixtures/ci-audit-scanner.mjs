process.stdout.write(process.env.STORYMAPPER_TEST_AUDIT_STDOUT ?? '');
process.stderr.write(process.env.STORYMAPPER_TEST_AUDIT_STDERR ?? '');
process.exitCode = Number(process.env.STORYMAPPER_TEST_AUDIT_EXIT);
