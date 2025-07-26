# Diaryx API

This is the backend API for Diaryx, a secure, end-to-end encrypted journaling application.

## Architecture

The API is built with [Hono](https://hono.dev/) and runs on Node.js. It is designed to be deployed as a single serverless function on Vercel, but can also be run locally for development.

All API routes are defined in `api/index.js`, which imports handlers from the `api/routes/` directory. Each file in `api/routes/` corresponds to a specific API resource (e.g., `entries.js`, `users.js`).

## Local Development

1.  **Install dependencies:**
    ```bash
    bun install
    ```

2.  **Set up environment variables:**
    ```bash
    cp .env.example .env
    # Edit .env with your actual values
    ```

3.  **Start the local server:**
    ```bash
    bun run dev
    ```

The API will be available at `http://localhost:3001`.

## Available Scripts

-   `bun run dev`: Starts the Hono server for local development.
-   `bun run start`: Starts the server in production mode.
-   `bun run deploy`: Deploys the API to Vercel.
