# Gimme

![https://raw.githubusercontent.com/BuiltByMom/gimme/main/packages/gimme/public/og.png](https://raw.githubusercontent.com/BuiltByMom/gimme/main/packages/gimme/public/og.png)
## Build and Develop

### Installing Dependencies

First, navigate to migratooor root directory in your terminal and run the following command to install all the required dependencies:

```bash
bun i
```

### Development Mode

To run migratooor in development mode, use the following command:

```bash
bun run dev
```

If you want to run the TypeScript compiler in watch mode alongside the development server, use:

```bash
bun run dev:ts
```

### Building the Project

To build migratooor, run the following command:

```bash
bun run build
```

This command will first compile the TypeScript files and then build the project using the `next` command.

## Starting the Production Server

To start the production server, first build migratooor (if you haven't already), and then run the following command:

```bash
bun run start
```

### Linting

To run the ESLint linter, use the following command:

```bash
bun run lint
```

This command will check all `.js`, `.jsx`, `.ts`, and `.tsx` files in the project for linting issues.
