# LeakGuard for VS Code

This thin extension runs the local LeakGuard CLI when a Python file opens or is saved. Definite leaks appear as red errors, likely leaks as warnings, and the Problems panel contains clickable witness-path steps.

## Development

```bash
npm install
npm test
```

Open `integrations/vscode` in VS Code and press F5 to start an Extension Development Host. Ensure `leakguard` is installed in the environment visible to VS Code, or set `leakguard.path` to the executable path.

Use the lightbulb action **LeakGuard: apply verified resource fix** to call `leakguard fix --write`. The CLI verifies the rewrite before the extension reloads and rescans the file.
