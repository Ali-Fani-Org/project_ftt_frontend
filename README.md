# Time Tracker

A modern, cross-platform desktop time tracking application built with Tauri, Svelte, and Rust. Track your work hours efficiently with a clean, intuitive interface and powerful backend integration.

![Time Tracker](https://img.shields.io/badge/version-1.0.0--alpha-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

## ✨ Features

- **🔐 User Authentication**: Secure login system with token-based authentication
- **⏱️ Real-time Time Tracking**: Start, stop, and monitor timers with live updates
- **📁 Project Management**: Organize your time entries by projects
- **🖥️ System Tray Integration**: Minimize to tray and control timers from system tray
- **📊 Dashboard**: Clean, responsive dashboard to manage your time entries
- **🎨 Modern UI**: Beautiful interface built with Svelte 5 and DaisyUI
- **⚡ Fast & Lightweight**: Built with Tauri for native performance
- **🔄 Auto-start**: Automatically start with your system
- **📱 Cross-platform**: Works on Windows, macOS, and Linux

## 🛠️ Tech Stack

### Frontend
- **Svelte 5** - Modern reactive framework
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **DaisyUI** - Component library for Tailwind CSS
- **Vite** - Fast build tool and dev server

### Backend
- **Tauri 2** - Framework for building desktop apps with web technologies
- **Rust** - Systems programming language for high performance
- **Django REST Framework** - API backend for data persistence

### Development Tools
- **Bun** - Fast JavaScript runtime and package manager
- **Prettier** - Code formatting
- **ESLint** - Code linting

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- **Bun**: [Installation Guide](https://bun.sh/docs/installation)
- **Rust**: [Installation Guide](https://www.rust-lang.org/tools/install)
- **Backend API**: The application requires a running Django REST API server (see API section below)

#### Windows Additional Requirements
- **MSVC**: Install "Desktop development with C++" workload via Visual Studio Installer

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd time-tracker
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Start development server**
   ```bash
   bun run tauri dev
   ```

### Building for Production

```bash
bun run tauri build
```

This will create a native executable in the `src-tauri/target/release/bundle/` directory.

## 📖 Usage

### First Time Setup

1. **Launch the application** - The app will open to the login screen
2. **Login** - Enter your credentials (requires running backend API)
3. **Configure settings** - Access settings via the gear icon to customize your experience

### Time Tracking

1. **Start a timer**:
   - Navigate to the dashboard
   - Fill in the task title
   - Select a project
   - Optionally add a description
   - Click "Start Timer"

2. **Monitor active timer**:
   - View the running timer in the dashboard
   - See real-time elapsed time
   - Timer continues running even when app is minimized

3. **Stop a timer**:
   - Click "Stop Timer" on the active timer card
   - Or use the system tray menu

### System Tray Features

- **Minimize to tray**: The app minimizes to system tray instead of closing
- **Tray controls**: Start/stop timers and access quick actions from tray menu
- **Auto-start**: App can start automatically with your system

## 🔌 API Integration

This application integrates with a Django REST Framework backend API. The API handles:

- User authentication and management
- Project management
- Time entry storage and retrieval
- Data persistence

### API Documentation

For detailed API documentation, see [`api_documentation.md`](api_documentation.md) which includes:

- Authentication endpoints
- Projects API
- Time entries API
- Data models
- Error handling
- Business rules

### Backend Setup

The application expects the API to be running at `http://localhost:8000`. To set up the backend:

1. Ensure you have Python and Django installed
2. Set up the Django project with the required endpoints
3. Configure the database (SQLite for development)
4. Start the development server on port 8000

## 🏗️ Project Structure

```
time-tracker/
├── src/                    # Frontend source code
│   ├── lib/               # Reusable components and utilities
│   │   ├── api.ts         # API client functions
│   │   ├── stores.ts      # Svelte stores for state management
│   │   └── *.svelte       # Svelte components
│   ├── routes/            # SvelteKit routes
│   │   ├── +page.svelte   # Login page
│   │   └── dashboard/     # Dashboard pages
│   └── app.*              # App configuration
├── src-tauri/             # Tauri backend (Rust)
│   ├── src/               # Rust source code
│   │   ├── main.rs        # Application entry point
│   │   ├── lib.rs         # Library code
│   │   └── commands.rs    # Tauri commands
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── static/                # Static assets
├── api_documentation.md   # API documentation
└── package.json           # Node.js dependencies and scripts
```

## 🛠️ Development

### Available Scripts

```bash
# Development
bun run dev              # Start Vite dev server
bun run tauri dev        # Start Tauri development mode

# Building
bun run build            # Build for production
bun run tauri build      # Build native executable

# Code Quality
bun run check            # Type checking and linting
bun run format           # Format code with Prettier
bun run lint             # Run ESLint
```

### Development Setup

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Start the backend API** (see API documentation)

3. **Start development**
   ```bash
   bun run tauri dev
   ```

The application will open in development mode with hot reloading enabled.

### Code Style

This project uses:
- **Prettier** for code formatting
- **ESLint** for code linting
- **TypeScript** for type checking

Run `bun run format` before committing to ensure consistent code style.

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** and ensure tests pass
4. **Format code**: `bun run format`
5. **Commit your changes**: `git commit -m 'Add some feature'`
6. **Push to the branch**: `git push origin feature/your-feature-name`
7. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style and conventions
- Write clear, concise commit messages
- Test your changes thoroughly
- Update documentation as needed
- Ensure TypeScript types are properly defined

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Tauri** - For the amazing framework that makes desktop apps with web technologies possible
- **Svelte** - For the reactive framework that makes frontend development a joy
- **DaisyUI** - For the beautiful component library
- **Django REST Framework** - For the robust API framework

## 📞 Support

If you encounter any issues or have questions:

1. Check the [API Documentation](api_documentation.md)
2. Review the [Issues](../../issues) page
3. Create a new issue with detailed information about your problem

---

**Note**: This application is currently in alpha (v1.0.0-alpha). Features and API may change before stable release.