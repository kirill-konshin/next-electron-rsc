# RCV ANDON

Download dist: http://kirill.konshin.pages.git.ringcentral.com/rcv-andon

:warning: :warning: :warning: On Windows run following as administrator:

```bash
Set-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\PerfProc\\Performance\\" -Name ProcessNameFormat -Value 2 -Type DWord
```

## UI compare & run tool

```bash
$ ./next-pkg-macos
```

## Headless run

If you wish to change any of the default config parameters, create `config.json` file:

```json5
{
  // Scenario
  scenario: 'ft-vbg',

  // Open Chrome instead of Jupiter
  chrome: false,

  // Upload results to Andon server
  andon: false,

  // Speed up test execution by `10`, produces less accurate results but is better
  // for debugging
  timeFactor: 1,

  // Use same output directory `latest` instead of producing timestamp-based
  // directories for each run
  overrideStats: false,

  jupiter: {
    appKey: 'YCWFuqW8T7-GtSTb6KBS6g',
    env: 'PRO',
    username: '+18662260635',
    extension: '',
    password: 'Test@987',
    host: 'https://app.ringcentral.com',
    loginUrl: 'https://login.ringcentral.com',
  },

  rcv: {
    // Note that by default `config.rcv.enabled = false` so that RCV will be launched
    // on the host configured on Jupiter env and supplied credentials will be ignored
    enabled: false,
    appKey: 'AJdKBzHLRkie9peuDaZLLw',
    username: '+18332253117',
    extension: '',
    password: 'Test!123',
    host: 'https://rnd01-t21-vss23-vss.lab.nordigy.ru',
    loginUrl: 'https://login-rndtapams.lab.nordigy.ru',
  },
}
```

Run using following command:

```bash
$ ./next-pkg-macos --config
```

## Stats

https://dashboard.fiji.gliprc.com/andon/rcv/desktop

## Main Repo

https://git.ringcentral.com/circus/andon-client/-/blob/master/andon-demo-ts

## PKG

https://github.com/vercel/pkg/issues/204
https://medium.com/@evenchange4/deploy-a-commercial-next-js-application-with-pkg-and-docker-5c73d4af2ee

## TODO

- [ ] Use Minio server to store launches https://github.com/minio/minio-js
