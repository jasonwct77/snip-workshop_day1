# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener.

```sh
node cli.js help
node cli.js add https://example.com
node cli.js ls
node cli.js open Ab12Cd
```

Set `SNIP_API` to use another backend URL; it defaults to `http://localhost:3000`.
The `snip`, `snip.cmd`, and `snip.ps1` wrappers run `cli.js` on POSIX shells,
Windows Command Prompt, and PowerShell, respectively.

Run the built-in tests with `npm test`.
