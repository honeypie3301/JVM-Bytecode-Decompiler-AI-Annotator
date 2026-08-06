# JVM Bytecode Decompiler & AI Annotator

A high-fidelity, client-side capable interactive JVM bytecode visualizer and AI-assisted Java decompiler. This application is optimized for analysis of standard compiled Java classes as well as specialized modding environments, including Forge, Fabric, and MCreator procedural compiler outputs.

## Key Features

- **Multi-File JVM Parsing**: Instantly parse `.class` files locally to extract constant pool tables, field descriptors, method indices, and Java modifiers.
- **AI Source Reconstruction**: Reverse-engineer raw bytecode into beautifully formatted, compilation-ready Java code using Google Gemini.
- **Rich Bytecode Annotations**: Highlight complex JVM instructions (such as `invokevirtual` optimization patterns or synthetic compiler bridges) with detailed, educational compiler notes.
- **Serverless & Static Deployable**: Designed to run seamlessly either through a full-stack Express server or completely client-side in static environments (like **GitHub Pages**) by configuring your personal Gemini API key.

## Deploying to GitHub Pages

This repository is pre-configured for automated deployment to GitHub Pages via GitHub Actions.

### Setup Instructions

1. **Enable GitHub Actions**:
   - Go to your repository settings on GitHub: **Settings** > **Actions** > **General**.
   - Under **Actions permissions**, select **Allow all actions and reusable workflows** and save.

2. **Configure Pages Build Source**:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.

3. **Trigger the Workflow**:
   - Since GitHub does not retroactively trigger workflows for past commits after Actions are enabled, you can trigger it by:
     - Making a new commit (e.g., pulling/pushing this updated `README.md` file).
     - Or navigating to the **Actions** tab in your repository, selecting the **Deploy to GitHub Pages** workflow, and clicking **Run workflow**.

### Running Client-Side

Once deployed to GitHub Pages, the application runs entirely in your browser without a backend. To decompile files:
1. Click the **Settings (Gear Icon)** in the top right corner.
2. Enter your personal **Gemini API Key**.
3. Your key is stored securely in your browser's local cache (`localStorage`) and sent directly to Google's official Gemini endpoint.
