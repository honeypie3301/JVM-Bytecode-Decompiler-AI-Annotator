# JVM Bytecode Decompiler & AI Annotator

A high-fidelity, client-side capable interactive JVM bytecode visualizer and AI-assisted Java decompiler. This application is optimized for analysis of standard compiled Java classes as well as specialized modding environments, including Forge, Fabric, and MCreator procedural compiler outputs.

## Key Features

- **Multi-File JVM Parsing**: Instantly parse `.class` files locally to extract constant pool tables, field descriptors, method indices, and Java modifiers.
- **AI Source Reconstruction**: Reverse-engineer raw bytecode into beautifully formatted, compilation-ready Java code using Google Gemini.
- **Rich Bytecode Annotations**: Highlight complex JVM instructions (such as `invokevirtual` optimization patterns or synthetic compiler bridges) with detailed, educational compiler notes.
- **Serverless & Static Deployable**: Designed to run seamlessly either through a full-stack Express server or completely client-side in static environments (like **GitHub Pages**) by configuring your personal Gemini API key.

