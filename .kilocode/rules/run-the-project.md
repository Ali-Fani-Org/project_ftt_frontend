# Use Bun and Tauri for Running and Testing

This project uses Bun as the JavaScript runtime and Tauri for the desktop application.

## Package Management

- Always use `bun install` instead of `npm install`
- Never use `npm`, `npx`, or `pnpm` in suggestions
- Use `bun add <package>` to install dependencies
- Use `bun remove <package>` to remove dependencies

## Running Scripts

- Use `bun run <script>` instead of `npm run <script>`
- Use `bun test` for running tests

## Tauri Commands

When running the Tauri app, use Bun to invoke Tauri:

- `bun run tauri dev` for development
- `bun run tauri build` for production builds

Do not suggest `npx tauri` or `npm run tauri`.

## General Rule

All command examples and instructions must assume Bun is the runtime and Tauri is used for desktop execution.