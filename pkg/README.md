# How to package Next.js application into a single executable using PKG

In some rare cases one might need to publish a Next.js app as a single executable. It’s not as nice as shipping Electron application with Next.js, as I described in my previous article.

Users of the app just need to run the executable and open the browser.

In my case I was using it to run some performance measurements on target machines with the ability to interact with measurement tool via web interface. Pretty neat.

:warning: Images won't work...

Start with installing of the PKG tool. The tool itself has been discontinued, so I will use a fork:

```bash
$ npm install @yao-pkg/pkg
```

Then add following to your `package.json`:

```bash
{
  "name": "next-pkg",
  "bin": "server.js",
  "scripts": {
    "build": "yarn clean && yarn build:next && yarn build:fix && yarn build:pkg",
    "build:next": "next build",
    "build:fix": "sed -i '' 's/process.chdir(__dirname)//' .next/standalone/server.js",
    "build:pkg": "cd .next/standalone && pkg . --compress=GZip --sea",
    "open": "./out/next-pkg"
  },
  "pkg": {
    "assets": [
      ".next/**/*",
      "public/**/*.*"
    ],
    "targets": [
      "node22-macos-arm64"
    ],
    "outputPath": "../../out"
  }
}

```

This `package.json` file will be copied into standalone build, hence the weird paths.

If you're in monorepo, server will be placed one more level down, so:

- `.next/standalone/server.js` will become `.next/standalone/%MONOREPO_FOLDER_NAME%/server.js`
- `"outputPath": "../../out"` should be `"outputPath": "../../../out"`.

Next.js standalone build comes with the server, and one line there needs to be fixed in order to work from packaged executable.

```json
{
  "build:fix": "sed -i '' 's/process.chdir(__dirname)//' .next/standalone/server.js"
}
```

Now let’s configure the Next.js itself:

```jsx
export default {
  output: 'standalone',
  outputFileTracingIncludes: {
    '*': ['public/**/*', '.next/static/**/*'],
  },
};
```

This will copy necessary static and public files into the standalone build.

# References

- https://github.com/yao-pkg/pkg
- https://nodejs.org/api/single-executable-applications.html
- https://medium.com/@evenchange4/deploy-a-commercial-next-js-application-with-pkg-and-docker-5c73d4af2ee
- https://github.com/vercel/next.js/discussions/13801
- https://github.com/nexe/nexe
- https://github.com/nodejs/single-executable/issues/87

# Demo

Run `yarn build:all`.
