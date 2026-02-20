# Contributing to OpenClaw MiniApp

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/kedoupi/openclaw-miniapp.git
cd openclaw-miniapp
npm install
cp .env.example .env
# Edit .env with your config
npm run dev       # Frontend dev server
node server.js    # Backend server
```

## Project Structure

- `server.js` — Backend API server (Node.js, no framework)
- `src/` — React frontend (Vite + TypeScript + Tailwind)
- `docker-compose.yml` — Docker deployment

## Pull Request Guidelines

1. Fork the repo and create a feature branch
2. Make your changes with clear commit messages
3. Run `npm run build` to ensure the build passes
4. Submit a PR with a description of what changed and why

## Security

If you find a security vulnerability, please report it privately rather than opening a public issue. Contact the maintainers directly.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
