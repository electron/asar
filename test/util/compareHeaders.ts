export function toSystemIndependentPath(s) {
  return path.sep === '/' ? s : s.replace(/\\/g, '/');
}

export function removeUnstableProperties(data) {
  return JSON.parse(
    JSON.stringify(data, (name, value) => {
      if (name === 'offset') {
        return undefined;
      }
      if (value.size != null) {
        // size differs on various OS and subdependencies aren't pinned, so this will randomly fail when subdependency resolution versions change
        value.size = '<size>';
      }
      if (value.integrity) {
        delete value.integrity;
      }
      return value;
    }),
  );
}

export async function verifySmartUnpack(resourceDir, additionalVerifications) {
  const asarFs = await readAsar(path.join(resourceDir, 'app.asar'));
  //   expect(
  //     await asarFs.readJson(`node_modules${path.sep}debug${path.sep}package.json`),
  //   ).toMatchObject({
  //     name: 'debug',
  //   });

  // For verifying additional files within the Asar Filesystem
  await additionalVerifications?.(asarFs);

  expect(removeUnstableProperties(asarFs.header)).toMatchSnapshot();

  const files = (
    await walk(
      resourceDir,
      (file) =>
        !path.basename(file).startsWith('.') && !file.endsWith(`resources${path.sep}inspector`),
    )
  ).map((it) => {
    const name = toSystemIndependentPath(it.substring(resourceDir.length + 1));
    if (it.endsWith('package.json')) {
      return { name, content: readFileSync(it, 'utf-8') };
    }
    return name;
  });
  expect(files).toMatchSnapshot();
}
